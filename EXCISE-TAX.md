# Excise Tax — How It Works

Canadian vape excise tax (federal + provincial), applied per-collection via
Shopify **collection metafields**, computed and kept in sync client-side in
the cart. No hardcoded variant IDs anywhere in the theme — launching a new
taxable collection is an admin-only task, zero code changes.

This doc supersedes `EXCISE-REMAP.md` (that file documents the historical
migration from the old hardcoded-ID system; keep it for context, but this is
the current source of truth).

---

## 1. Concept

Every product belongs to at most one **tax collection** — the collection that
carries the excise tax metafields. At add-to-cart time, Liquid looks up that
collection's tax product references and stamps their **variant IDs** onto the
cart line as hidden line-item properties. The cart JS never queries
collections or metafields itself — it only ever reads those properties off
whatever's already in the cart. This is the whole design: **Liquid resolves
"which tax products," JS only resolves "how much tax."**

```
Admin (Shopify)                Liquid (render time)              JS (cart time)
────────────────               ─────────────────────             ──────────────
Collection "Pods 30K"          product.collections               reconcileExciseTax()
 ├─ excise_federal_id    ───►   → first collection with    ───►   reads _excise_federal_id /
 │   (Product reference)         excise_federal_id set             _excise_provincial_id /
 └─ excise_provincial_id        → injects hidden inputs:           _bundle_pack_size off
     (Product reference)          properties[_excise_federal_id]   every cart line
                                  properties[_excise_provincial_id]
                                                                   → sums qty per tax variant
                                                                   → POST /cart/update.js
                                                                     (one request, add/set/
                                                                     remove all tax lines)
```

---

## 2. Files

| File | Role |
|---|---|
| [`snippets/excise-tax-properties.liquid`](snippets/excise-tax-properties.liquid) | Resolves a product's tax collection, injects `_excise_federal_id` / `_excise_provincial_id` / `_excise_group` / `_bundle_pack_size` as hidden line-item properties. Rendered inside every add-to-cart `<form 'product'>`. |
| [`snippets/bundle-flavour-selector.liquid`](snippets/bundle-flavour-selector.liquid) | Renders N flavour dropdowns for bundle products (N = `bundle_pack_size`), sourced from `bundle_collection_handle`. Selections submit as visible `Flavour N` properties. |
| [`assets/cart.js`](assets/cart.js) | All the runtime logic — see §3 below for the function-by-function breakdown. |
| [`assets/cart-drawer.js`](assets/cart-drawer.js) | `CartDrawer.renderContents()` (line ~355) — re-applies the checkout loading state after a drawer re-render (see §4). |
| [`EXCISE-REMAP.md`](EXCISE-REMAP.md) | Historical doc from the hardcoded-ID → metafield migration. Background only. |

### Injection points (where `excise-tax-properties.liquid` is rendered)
Every path that can add a product to cart needs this snippet inside its
`<form 'product'>`, or that line silently gets **no tax** (by design — no
property means "not taxable," see §3.1):

- [`snippets/buy-buttons.liquid:59`](snippets/buy-buttons.liquid#L59) — main product page, featured product.
- [`snippets/buy-buttons.liquid:61`](snippets/buy-buttons.liquid#L61) — `bundle-flavour-selector`, same form.
- [`snippets/card-product.liquid:363`](snippets/card-product.liquid#L363) — collection grid quick-add.
- [`snippets/custom-recommendation-product.liquid:318`](snippets/custom-recommendation-product.liquid#L318) — product recommendations.

**If you add a new add-to-cart surface (a new quick-buy widget, a custom
upsell block, etc.), you must render this snippet inside its form too.**

---

## 3. `cart.js` — function-by-function

### 3.1 `snippets/excise-tax-properties.liquid` (Liquid, not JS, but starts the chain)
```liquid
for coll in product.collections
  if coll.metafields.custom.excise_federal_id != blank
    assign tax_collection = coll
    break
  endif
endfor
```
First collection (in the product's collection list) that has
`excise_federal_id` set wins. If a product is in zero tax collections, no
properties are injected, and the line is simply never taxed — this is the
mechanism that keeps batteries/accessories untaxed, not a special-case skip
list.

### 3.2 `reconcileExciseTax(province, knownCartData)` — cart.js:190
The single source of truth for "what excise tax lines should exist right
now." Idempotent — safe to call after any add, quantity change, or removal;
always recomputes from scratch rather than incrementing/decrementing.

1. Reads the cart (`knownCartData` if the caller already has a fresh
   `/cart.js`-shaped object — e.g. `updateQuantity` passes its own
   `/cart/change.js` response through to skip a redundant fetch; otherwise
   fetches `/cart.js` itself).
2. For every non-tax line with an `_excise_federal_id` property: sums
   `quantity × (_bundle_pack_size || 1)` onto that federal variant id, and
   onto `_excise_provincial_id` too **if** `province` is in
   `PROVINCIAL_TAX_PROVINCES` (`ON, QC, NU, NT, AB, MB, NB, YT, PE`).
3. Finds every excise line **currently in the cart** (`product_type ===
   'excise tax'`) and unions their variant IDs into the "managed" set, so a
   collection that's no longer represented in the cart gets its tax line set
   to `0` (removed), not just skipped.
4. Diffs desired vs. current; if nothing changed, returns immediately — no
   network write at all (this is what makes the checkout guard's `await
   exciseReconcileChain` resolve instantly on the common case).
5. If something changed: **one** `POST /cart/update.js` sets every managed
   tax variant's quantity (add / change / remove-at-zero, all in one call),
   requesting rendered `sections` in the same response (see §4) so the
   drawer/cart page updates without a second round trip.
6. Corrects the cart-icon-bubble count (which the server-rendered section
   counts inclusive of hidden tax lines) using the cart data already in
   hand — `correctCartIconBubbleCount()`, cart.js:281. No extra fetch.

### 3.3 `queueExciseReconcile(cartItems, province, knownCartData)` — cart.js:11
Single-flight + coalescing queue. If a reconcile is already in flight, a new
call folds into it (returns the same promise) rather than starting a second
one — this is what prevents two rapid cart edits from double-taxing or
racing each other. `exciseReconcileChain` (module-level) is always the
"currently settling" promise; `guardCheckoutForExciseTax` (§3.5) awaits this
exact variable.

### 3.4 `handleAddToCartClick(form, event)` — cart.js:97
Runs **before** the actual add (product-form.js does the real `/cart/add`
POST). Two hard gates:
- No `userProvince` in `localStorage` → blocks the add entirely
  (`preventDefault` + `stopImmediatePropagation`), highlights the province
  selector.
- Bundle product with any flavour dropdown unfilled → blocks the add, marks
  invalid dropdowns, focuses the first one.

Tax reconcile itself does **not** run here — it runs from the
`cartUpdate` pub/sub subscriber (`connectedCallback`, cart.js:~300) after the
add actually completes, so there's one add path, not two racing ones.

### 3.5 `guardCheckoutForExciseTax()` — cart.js:784
Intercepts clicks on `#CartDrawer-Checkout`, `#checkout`, `[name="checkout"]`
in the capture phase (runs before the native form submit). If a province is
set, it blocks navigation, shows the loading state (§4), **awaits the
existing `exciseReconcileChain`** (does not start a new reconcile — if
nothing's in flight this resolves on the same tick), then navigates to
`/checkout`.

---

## 4. Checkout loading-state (perf fix, July 2026)

**Symptom that was fixed:** clicking checkout from the drawer took 10-20s to
redirect, and the button appeared to "re-enable itself" partway through
before still not navigating for several more seconds.

**Root cause:** `reconcileExciseTax`'s old UI-refresh step called
`updateCartDrawerUI()`, which fetched `` `${cart_url}?section_ids=...` ``
(plural). Shopify's page-route Section Rendering API only supports the
*singular* `section_id` param — the plural version isn't recognized, so the
request silently fell back to returning the **entire cart page's HTML**,
parsed client-side, on every single reconcile. A second full `/cart.js`
re-fetch in the old `updateCartIconBubble()` compounded it. The "re-enabled
itself" symptom was the drawer's section HTML being swapped in fresh
(non-disabled) mid-flight, overwriting the disabled checkout button with a
brand-new DOM node that had no memory of the click.

**Fix (see the commit "Fix 10-20s checkout/cart-drawer stall in excise
reconcile"):**
- The tax-quantity write and the UI refresh are now **one request**:
  `POST /cart/update.js` carries `sections` + `sections_url` (same technique
  `updateQuantity` already used for `/cart/change.js`), applied via
  `this.getSectionsToRender()` — which is already polymorphic (drawer vs.
  full cart page render different section lists; `CartDrawerItems` overrides
  it in `cart-drawer.js`).
- `updateQuantity` passes its already-fresh cart response straight into
  `reconcileExciseTax` as `knownCartData`, skipping reconcile's own
  `GET /cart.js` on that path.
- `applyCheckoutNavigatingUI()` (cart.js:746) sets a persistent
  "Redirecting…" spinner + `disabled` on click, tracked via
  `window.__checkoutNavigating` (not a local closure var) specifically so it
  can be **re-applied after every DOM swap** that might otherwise resurrect
  a fresh, enabled button — called after `reconcileExciseTax`'s section
  render, `onCartUpdate`'s replace, `updateQuantity`'s section render, and
  `CartDrawer.renderContents` (`cart-drawer.js:365`).
- `toggleCheckoutButton(isEnabled)` (cart.js:~131) now refuses to re-enable
  the button at all once `window.__checkoutNavigating` is true.

`updateCartDrawerUI()` / `updateCartIconBubble()` (the old methods) are still
present and still used by the "no province selected" fallback branch of
`updateQuantity` — a low-traffic edge case (no province ⇒ no tax lines to
speak of) intentionally left alone to keep this fix's blast radius small.
**Known follow-up, not yet fixed:** that fallback path still has the same
`section_ids` (plural) bug if it's ever hit.

---

## 5. Admin setup checklist (do this in Shopify admin)

### 5.1 Metafield definitions (one-time, Settings → Custom data)
- **Collection**, namespace `custom`:
  - `excise_federal_id` — type **Product reference**
  - `excise_provincial_id` — type **Product reference**
- **Product**, namespace `custom` (bundles only):
  - `bundle_pack_size` — type **Integer**
  - `bundle_collection_handle` — type **Single line text** (handle of the
    collection supplying bundle flavour options)

### 5.2 Launching a new taxable collection
1. Create the hidden **federal** tax product (and **provincial**, if the
   collection charges it). Each must:
   - have **`product_type` exactly `excise tax`** — removal detection in
     `reconcileExciseTax` relies on an exact match,
   - be **tagged `excise-tax`** — hides it from cart UI, search, and
     recommendations (see `sections/predictive-search.liquid:138` and
     similar checks elsewhere),
   - be a **single-variant** product — the Liquid snippet uses
     `variants.first.id`.
2. On the collection, set `excise_federal_id` → the federal tax product, and
   `excise_provincial_id` → the provincial one (leave blank if the
   collection has no provincial tax).
3. Add the real product(s) to that collection. **A product should be a
   member of exactly one tax collection** — if it's in several, whichever
   comes first in `product.collections` with `excise_federal_id` set wins,
   which is order you don't control from admin. Don't rely on it.

### 5.3 Bundles
1. Create the bundle product, add it to a collection that has
   `excise_federal_id`/`excise_provincial_id` set (its tax source).
2. Set on the bundle product: `bundle_pack_size` (e.g. `3`) and
   `bundle_collection_handle` (handle of the collection whose products
   populate the flavour dropdowns).
3. `handleAddToCartClick` blocks the add until every dropdown has a value;
   `reconcileExciseTax` multiplies `qty × bundle_pack_size` into the tax
   line quantity.

### 5.4 Common admin mistakes (both bit us during setup — see git history)
- **Copying the wrong ID.** In the browser network tab, `/cart/add` payloads
  have both an `id` field (the variant ID — what you want) and a
  `product-id` field (unrelated, used elsewhere in this theme) — do not
  confuse them. This mistake shouldn't be possible anymore since the
  metafields are **Product reference** type (you pick the product from a
  list in admin, no ID copy-pasting at all) — if you ever see a plain-text
  metafield holding a raw number here, something regressed back to the old,
  error-prone setup.
- **Metafield key drift.** The metafield keys (`excise_federal_id`,
  `excise_provincial_id`) must match exactly what
  `snippets/excise-tax-properties.liquid` and `assets/cart.js` read. If you
  rename a metafield in admin, grep both files for the old name and update
  every occurrence — a silent mismatch means tax quietly stops applying with
  no error anywhere.

---

## 6. Testing checklist before going live
- [ ] Add a product from each taxable collection, confirm correct federal +
      provincial tax lines appear (provincial only for the 9-province list).
- [ ] Add a product from a **non-taxable** collection (batteries), confirm
      **no** tax lines appear.
- [ ] Change province mid-cart, confirm provincial tax lines add/remove
      correctly without duplicating federal.
- [ ] Add a bundle product, confirm the flavour gate blocks an incomplete
      selection, and tax quantity = `pack_size × qty`.
- [ ] Increase/decrease quantity in the cart drawer and on `/cart`, confirm
      tax lines track the change and the checkout button doesn't stay
      disabled longer than the actual network round trip.
- [ ] Click checkout immediately after an add (fast double-click), confirm
      no double-tax and no premature redirect before tax settles.
- [ ] Remove all taxable items from cart, confirm tax lines are fully
      removed (not left at qty 0 as visible lines).
