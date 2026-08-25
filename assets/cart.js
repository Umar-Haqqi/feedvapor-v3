// Single-flight + COALESCED queue so concurrent excise reconciles can't double
// the tax AND can't pile up. At most one reconcile runs while one more is queued;
// extra requests fold into the trailing run. Each reconcile reads the live cart,
// so the single trailing run reflects the final state.
let exciseReconcileChain = Promise.resolve();
let exciseReconcilePending = false;
// knownCartData: full /cart.js-shaped object the caller already fetched
// (e.g. the response of /cart/change.js), so reconcile can skip its own
// GET /cart.js round trip. Only used when nothing is already queued —
// see the early-return below.
function queueExciseReconcile(cartItems, province, knownCartData) {
  // A reconcile is already queued behind the in-flight one: fold into it.
  if (exciseReconcilePending) return exciseReconcileChain;
  exciseReconcilePending = true;
  exciseReconcileChain = exciseReconcileChain
    .catch(() => {})
    .then(() => {
      exciseReconcilePending = false;
      return cartItems.reconcileExciseTax(province, knownCartData);
    });
  return exciseReconcileChain;
}

class CartRemoveButton extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('click', async (event) => {
      event.preventDefault();
      const cartItems = this.closest('cart-items') || this.closest('cart-drawer-items');

      const line = this.dataset.index;
      const variantId = this.dataset.variantId; // Assuming variant ID is set as a dataset attribute
      const name = document.activeElement.getAttribute('name');

      await cartItems.updateQuantity(line, 0, name, variantId);
    });
  }
}

customElements.define('cart-remove-button', CartRemoveButton);

class CartItems extends window.StandardEvents.createViewEventElement(HTMLElement) {
  constructor() {
    super();
    this.lineItemStatusElement =
      document.getElementById('shopping-cart-line-item-status') || document.getElementById('CartDrawer-LineItemStatus');

    const debouncedOnChange = debounce((event) => {
      this.onChange(event);
    }, ON_CHANGE_DEBOUNCE_TIMER);

    this.addEventListener('change', debouncedOnChange.bind(this));

    //OMAIR
    document.addEventListener('DOMContentLoaded', () => {
      this.updateCartIconBubble();
      // Initialize listeners on load
      this.initAddToCartListeners();

      // Debounced listener for 'productRecommendationsLoaded' event
      const debouncedInitAddToCartListeners = debounce(() => {
        this.initAddToCartListeners(); // Reinitialize Add to Cart listeners
      }, 300); // Adjust the debounce time as needed

      // Listen for product recommendations to load and reinitialize listeners
      document.addEventListener('productRecommendationsLoaded', debouncedInitAddToCartListeners);
    });

    // Add the listener for the custom event 'productRecommendationsLoaded'
    document.addEventListener('productRecommendationsLoaded', () => {
      this.initAddToCartListeners(); // Reinitialize the Add to Cart listeners
    });
  }

  // Function to initialize Add to Cart listeners
  async initAddToCartListeners() {
    const addToCartButtons = document.querySelectorAll('.product-form__submit, .quick-add__submit');

    addToCartButtons.forEach((button) => {
      // Find the nearest form element to this button
      const form = button.closest('form');

      // Remove any previous click event listener to avoid duplicates
      button.removeEventListener('click', this.handleAddToCartClick);

      // Add a new event listener
      button.addEventListener('click', this.handleAddToCartClick.bind(this, form));
    });
  }

  // Province gate for Add to Cart.
  // The actual add is performed by product-form.js; excise tax is reconciled
  // afterwards in the cartUpdate subscription (see connectedCallback). This keeps
  // a single add path and avoids the previous double-add / race that left taxes
  // off the cart until a manual quantity change.
  async handleAddToCartClick(form, event) {
    const userProvince = localStorage.getItem('userProvince');
    if (!userProvince) {
      // Block the add entirely (stops product-form.js submit handler too).
      event.preventDefault();
      event.stopImmediatePropagation();
      alert('Please select a province before adding to cart.');
      this.highlightProvinceSelection();
      return;
    }

    // Bundle flavour gate: every flavour slot must be chosen before adding.
    const bundleSelector = form ? form.querySelector('.bundle-flavour-selector') : null;
    if (bundleSelector) {
      const dropdowns = bundleSelector.querySelectorAll('.bundle-flavour-dropdown');
      let firstInvalid = null;
      dropdowns.forEach((dd) => {
        if (!dd.value) {
          dd.classList.add('is-invalid');
          if (!firstInvalid) firstInvalid = dd;
        } else {
          dd.classList.remove('is-invalid');
        }
      });
      if (firstInvalid) {
        event.preventDefault();
        event.stopImmediatePropagation();
        alert('Please select a flavour for every item in the bundle.');
        firstInvalid.focus();
        return;
      }
    }

    // Province selected: allow product-form.js to handle the add.
    // Disable checkout while the upcoming reconcile sets taxes.
    this.toggleCheckoutButton(false);
  }

  toggleCheckoutButton(isEnabled) {
    // Never resurrect the checkout button once the user has actually clicked
    // it and we're navigating away — a drawer re-render mid-reconcile used to
    // swap in a fresh, non-disabled button from the server-rendered section
    // HTML, which visually looked like the button "came back" seconds before
    // the redirect actually fired. See guardCheckoutForExciseTax below.
    if (isEnabled && window.__checkoutNavigating) return;

    const checkoutButton = document.getElementById('CartDrawer-Checkout'); // Adjust selector as needed

    if (checkoutButton) {
      checkoutButton.disabled = !isEnabled;

      // Add or remove styles based on whether the button is enabled or disabled
      if (!isEnabled) {
        checkoutButton.style.backgroundColor = '#ccc !important'; // Set to gray or another "disabled" color
        checkoutButton.style.cursor = 'not-allowed !important';   // Change cursor to indicate disabled state
      } else {
        checkoutButton.style.backgroundColor = '#fff';  // Reset to default
        checkoutButton.style.cursor = 'pointer';           // Reset cursor to default
      }
    }
  }

  // Highlight province selection if it isn't selected
  highlightProvinceSelection() {
    const provinceSelect = document.getElementById('newProvinceSelect');
    if (provinceSelect) {
      provinceSelect.style.border = '2px solid red';
      provinceSelect.style.boxShadow = '0 0 10px red';
      provinceSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        provinceSelect.style.border = '';
        provinceSelect.style.boxShadow = '';
      }, 3000);
    }
  }

  // Recompute every excise-tax line item from the current cart state.
  // Idempotent: safe to call after any add / quantity change / removal.
  //
  // Fully data-driven: NO hardcoded variant IDs live here. Each taxable line
  // carries the excise variant IDs of its collection as hidden line-item
  // properties, injected at add-to-cart by snippets/excise-tax-properties.liquid
  // from the collection's custom.excise_federal_id / custom.excise_provincial_id
  // metafields:
  //     _excise_federal_id      -> federal tax variant id (always applies)
  //     _excise_provincial_id   -> provincial tax variant id (province-gated)
  //     _bundle_pack_size     -> multiplier (bundle = pack_size units per unit)
  // To add a new taxable collection, create the tax products + set the
  // collection metafields. No JS change needed.
  //
  // knownCartData: pass the full /cart.js-shaped object when the caller
  // already has a fresh one (e.g. /cart/change.js's response) to skip the
  // GET below entirely.
  async reconcileExciseTax(province, knownCartData) {
    // Provinces that levy provincial excise tax. Federal always applies to any
    // taxable line; provincial applies only when the shopper is in one of these.
    const PROVINCIAL_TAX_PROVINCES = ['ON', 'QC', 'NU', 'NT', 'AB', 'MB', 'NB', 'YT', 'PE'];
    const provincialApplies = PROVINCIAL_TAX_PROVINCES.includes(province);

    const cartData = knownCartData || (await (await fetch('/cart.js')).json());

    // Desired quantity per excise variant id, derived entirely from the
    // line-item properties on each taxable cart line.
    const desired = {};
    const want = (id, qty) => {
      if (!id) return;
      const key = String(id);
      desired[key] = (desired[key] || 0) + qty;
    };

    for (const item of cartData.items) {
      const props = item.properties || {};
      const federal = props._excise_federal_id;
      // No federal property => not a taxable line (also skips excise lines
      // themselves and untaxed items like batteries/accessories).
      if (!federal) continue;

      const packSize = parseInt(props._bundle_pack_size, 10) || 1;
      const qty = item.quantity * packSize;

      want(federal, qty);
      if (provincialApplies && props._excise_provincial_id) {
        want(props._excise_provincial_id, qty);
      }
    }

    // Every excise line currently in the cart, detected by product_type. Union
    // with the desired ids so stale tax lines get set to 0 (removed).
    const currentExcise = {};
    const managedIds = new Set(Object.keys(desired));
    for (const item of cartData.items) {
      if ((item.product_type || '').toLowerCase() === 'excise tax') {
        const key = String(item.variant_id);
        currentExcise[key] = (currentExcise[key] || 0) + item.quantity;
        managedIds.add(key);
      }
    }

    // Build the desired quantity for every managed excise variant (0 = remove)
    // and detect whether the cart already matches (skip the network write if so).
    const updates = {};
    let changeNeeded = false;
    for (const id of managedIds) {
      updates[id] = desired[id] || 0;
      if ((currentExcise[id] || 0) !== updates[id]) changeNeeded = true;
    }

    if (!changeNeeded) return;

    // ONE request handles add (missing id), set (qty change) and remove (qty 0)
    // for every managed variant AND renders the updated sections, all in a
    // single round trip — this used to be a plain POST followed by a separate
    // updateCartDrawerUI() call that fetched `${cart_url}?section_ids=...`.
    // section_ids (plural) isn't a valid Shopify param on a page route, so
    // that call silently fell back to returning the ENTIRE page HTML and
    // parsing it client-side on every reconcile — the main source of the
    // 10-20s checkout-drawer stall. Folding sections into this POST (the same
    // technique updateQuantity already uses for /cart/change.js) fixes that.
    const sectionsToRender = this.getSectionsToRender();
    const response = await fetch('/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updates,
        sections: sectionsToRender.map((section) => section.section),
        sections_url: window.location.pathname,
      }),
    });
    const parsedState = await response.json();

    sectionsToRender.forEach((section) => {
      const container = document.getElementById(section.id);
      if (!container) return; // e.g. main-cart-items absent while only the drawer is open
      const elementToReplace = (section.selector && container.querySelector(section.selector)) || container;
      elementToReplace.innerHTML = this.getSectionInnerHTML(parsedState.sections[section.section], section.selector);
    });

    this.correctCartIconBubbleCount(parsedState.items);
    applyCheckoutNavigatingUI();
  }

  // The cart-icon-bubble section's own markup counts every line, including
  // hidden excise-tax lines. Overwrite it with the visible-only count using
  // cart data already in hand (no extra network round trip).
  correctCartIconBubbleCount(items) {
    let itemCount = 0;
    (items || []).forEach((item) => {
      if (item && item.product_type !== 'excise tax') {
        itemCount += item.quantity;
      }
    });

    const cartIconBubble = document.querySelector('#cart-icon-bubble .cart-count-bubble span');
    if (cartIconBubble) {
      if (itemCount > 0) {
        cartIconBubble.innerText = itemCount;
        cartIconBubble.parentElement.style.display = 'block';
      } else {
        cartIconBubble.parentElement.style.display = 'none';
      }
    }
  }

  cartUpdateUnsubscriber = undefined;

  static pendingCartDataPromise = null;

  connectedCallback() {
    // The factory base class auto-dispatches cart:view from the
    // `view-event-payload` attribute (Liquid filter output). The drawer
    // sets `view-event-trigger="manual"` to skip auto-dispatch.
    super.connectedCallback();

    this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
      if (event.source === 'cart-items') {
        return;
      }
      this.onCartUpdate();

      // After an add from product-form.js / quick-add (any source other than our
      // own cart-page updates, which already reconcile in updateQuantity),
      // recompute excise tax once. Gate on the drawer instance so this runs a
      // single time even when both <cart-items> and <cart-drawer-items> exist.
      if (this.tagName === 'CART-DRAWER-ITEMS') {
        const userProvince = localStorage.getItem('userProvince');
        if (userProvince) {
          this.toggleCheckoutButton(false);
          queueExciseReconcile(this, userProvince).finally(() => this.toggleCheckoutButton(true));
        }
      }
    });
  }

  // Fetches the full cart shape (used to resolve the cart:lines-update event
  // promise after /cart/add.js, which only returns the added line — not the
  // post-mutation cart aggregates). De-duplicated across concurrent callers.
  static fetchCartData() {
    if (!CartItems.pendingCartDataPromise) {
      const pendingCartDataPromise = fetch(`${routes.cart_url}.json`)
        .then((response) => response.json())
        .catch(() => null)
        .finally(() => {
          if (CartItems.pendingCartDataPromise === pendingCartDataPromise) CartItems.pendingCartDataPromise = null;
        });

      CartItems.pendingCartDataPromise = pendingCartDataPromise;
    }
    return CartItems.pendingCartDataPromise;
  }

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
  }

  async onChange(event) {
    const line = event.target.dataset.index;
    const quantity = event.target.value;
    const name = document.activeElement.getAttribute('name');
    const variantId = event.target.dataset.quantityVariantId;

    // updateQuantity reconciles all excise tax lines from the resulting cart state.
    await this.updateQuantity(line, quantity, name, variantId);
  }

  onCartUpdate() {
    if (this.tagName === 'CART-DRAWER-ITEMS') {
      return fetch(`${routes.cart_url}?section_id=cart-drawer`)
        .then((response) => response.text())
        .then((responseText) => {
          const html = new DOMParser().parseFromString(responseText, 'text/html');
          const selectors = ['cart-drawer-items', '.cart-drawer__footer'];
          for (const selector of selectors) {
            const targetElement = document.querySelector(selector);
            const sourceElement = html.querySelector(selector);
            if (targetElement && sourceElement) {
              targetElement.replaceWith(sourceElement);
            }
          }
          applyCheckoutNavigatingUI();
        })
        .catch((e) => {
          console.error(e);
        });
    } else {
      return fetch(`${routes.cart_url}?section_id=main-cart-items`)
        .then((response) => response.text())
        .then((responseText) => {
          const html = new DOMParser().parseFromString(responseText, 'text/html');
          const sourceQty = html.querySelector('cart-items');
          this.innerHTML = sourceQty.innerHTML;
        })
        .catch((e) => {
          console.error(e);
        });
    }
  }

  getSectionsToRender() {
    return [
      {
        id: 'main-cart-items',
        section: document.getElementById('main-cart-items').dataset.id,
        selector: '.js-contents',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
      {
        id: 'cart-live-region-text',
        section: 'cart-live-region-text',
        selector: '.shopify-section',
      },
      {
        id: 'main-cart-footer',
        section: document.getElementById('main-cart-footer').dataset.id,
        selector: '.js-contents',
      },
    ];
  }

  async updateQuantity(line, quantity, name, variantId) {
    this.enableLoading(line);
    this.toggleCheckoutButton(false);

    try {
      const body = JSON.stringify({
        line,
        quantity,
        sections: this.getSectionsToRender().map((section) => section.section),
        sections_url: window.location.pathname,
      });

      const response = await fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } })
      const state = await response.text();
      const parsedState = JSON.parse(state);
      const quantityElement =
        document.getElementById(`Quantity-${line}`) || document.getElementById(`Drawer-quantity-${line}`);
      const items = document.querySelectorAll('.cart-item');

      if (parsedState.errors) {
        quantityElement.value = quantityElement.getAttribute('value');
        this.updateLiveRegions(line, parsedState.errors);
        return;
      }

      this.classList.toggle('is-empty', parsedState.item_count === 0);
      const cartDrawerWrapper = document.querySelector('cart-drawer');
      const cartFooter = document.getElementById('main-cart-footer');

      if (cartFooter) cartFooter.classList.toggle('is-empty', parsedState.item_count === 0);
      if (cartDrawerWrapper) cartDrawerWrapper.classList.toggle('is-empty', parsedState.item_count === 0);

      this.getSectionsToRender().forEach((section) => {
        const elementToReplace =
          document.getElementById(section.id).querySelector(section.selector) || document.getElementById(section.id);
        elementToReplace.innerHTML = this.getSectionInnerHTML(
          parsedState.sections[section.section],
          section.selector
        );
      });
      applyCheckoutNavigatingUI();
      this.toggleCheckoutButton(false);
      const updatedValue = parsedState.items[line - 1] ? parsedState.items[line - 1].quantity : undefined;
      let message = '';
      if (items.length === parsedState.items.length && updatedValue !== parseInt(quantityElement.value)) {
        if (typeof updatedValue === 'undefined') {
          message = window.cartStrings.error;
        } else {
          message = window.cartStrings.quantityError.replace('[quantity]', updatedValue);
        }
      }
      this.updateLiveRegions(line, message);

      const lineItem =
        document.getElementById(`CartItem-${line}`) || document.getElementById(`CartDrawer-Item-${line}`);
      if (lineItem && lineItem.querySelector(`[name="${name}"]`)) {
        cartDrawerWrapper
          ? trapFocus(cartDrawerWrapper, lineItem.querySelector(`[name="${name}"]`))
          : lineItem.querySelector(`[name="${name}"]`).focus();
      } else if (parsedState.item_count === 0 && cartDrawerWrapper) {
        trapFocus(cartDrawerWrapper.querySelector('.drawer__inner-empty'), cartDrawerWrapper.querySelector('a'));
      } else if (document.querySelector('.cart-item') && cartDrawerWrapper) {
        trapFocus(cartDrawerWrapper, document.querySelector('.cart-item__name'));
      }

      // Reconcile every excise tax line from the resulting cart state.
      // reconcileExciseTax already refreshes the drawer/bubble when it changes
      // anything, so only refresh here when there's no province (nothing to do).
      const userProvince = localStorage.getItem('userProvince');
      if (userProvince) {
        // parsedState is already the full post-mutation cart (from
        // /cart/change.js above) — hand it to reconcile so it can skip its
        // own GET /cart.js round trip.
        await queueExciseReconcile(this, userProvince, parsedState);
      } else {
        await this.updateCartDrawerUI();
        await this.updateCartIconBubble();
      }

      publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-items', cartData: parsedState, variantId: variantId });
    } catch(error) {
        this.querySelectorAll('.loading__spinner').forEach((overlay) => overlay.classList.add('hidden'));
        const errors = document.getElementById('cart-errors') || document.getElementById('CartDrawer-CartErrors');
        errors.textContent = window.cartStrings.error;
        console.error("Error updating quantity: ", error);
    } finally {
        this.disableLoading(line);
        this.toggleCheckoutButton(true);
      }
  }


  async updateCartDrawerUI() {
    try {
      // Fetch the latest cart sections
      const response = await fetch(`${routes.cart_url}?section_ids=cart-drawer,cart-icon-bubble,main-cart-items,main-cart-footer`);
      const htmlText = await response.text();
      const parser = new DOMParser();
      const html = parser.parseFromString(htmlText, 'text/html');

      // Update the cart drawer
      const newCartDrawer = html.querySelector('#CartDrawer');
      const currentCartDrawer = document.querySelector('#CartDrawer');
      if (newCartDrawer && currentCartDrawer) {
        currentCartDrawer.innerHTML = newCartDrawer.innerHTML;
      }

      // Update the main cart items
      const newCartItems = html.querySelector('#main-cart-items');
      const currentCartItems = document.querySelector('#main-cart-items');
      if (newCartItems && currentCartItems) {
        currentCartItems.innerHTML = newCartItems.innerHTML;
      }

      // Update the footer if it exists
      const newFooter = html.querySelector('#main-cart-footer');
      const currentFooter = document.querySelector('#main-cart-footer');
      if (newFooter && currentFooter) {
        currentFooter.innerHTML = newFooter.innerHTML;
      }

      // Update cart icon bubble (for the cart count, etc.)
      const newCartBubble = html.querySelector('#cart-icon-bubble');
      const currentCartBubble = document.querySelector('#cart-icon-bubble');
      if (newCartBubble && currentCartBubble) {
        currentCartBubble.innerHTML = newCartBubble.innerHTML;
      }

      // Check if the cart is empty by looking for 'cart__contents' or item count
      const cartContents = html.querySelector('.cart__contents');
      const isCartEmpty = cartContents && cartContents.querySelectorAll('.cart-item').length === 0;

      // Toggle 'is-empty' class on cart drawer if the cart is empty
      const cartDrawer = document.querySelector('cart-drawer');
      if (isCartEmpty) {
        cartDrawer.classList.add('is-empty');
      } else {
        cartDrawer.classList.remove('is-empty');
      }
    } catch (error) {
      console.error('Error updating cart drawer UI:', error);
    }
  }

  async updateCartIconBubble() {
    try {
      const response = await fetch('/cart.js');
      const cart = await response.json();

      // Calculate the item count, excluding excise tax items
      let itemCount = 0;
      cart.items.forEach(item => {
        // Check if item.product exists and has tags before accessing them
        if (item && item.product_type !== 'excise tax') {
          itemCount += item.quantity;
        }
      });

      // Update the cart icon bubble
      const cartIconBubble = document.querySelector('#cart-icon-bubble .cart-count-bubble span');
      if (cartIconBubble) {
        if (itemCount > 0) {
          cartIconBubble.innerText = itemCount;
          cartIconBubble.parentElement.style.display = 'block';  // Ensure the bubble is shown
        } else {
          cartIconBubble.parentElement.style.display = 'none';   // Hide bubble when count is 0
        }
      }
    } catch (error) {
      console.error('Error updating cart icon bubble:', error);
    }
  }

  createCartLinesUpdateEvent(action, variantId, quantity, lineKey) {
    const { CartLinesUpdateEvent } = window.StandardEvents || {};
    if (!CartLinesUpdateEvent || !variantId) return null;
    // No AJAX line key on the row — likely cached HTML rendered before this
    // attribute landed. Skip dispatch rather than emit an event with id: ''.
    if (!lineKey) return null;

    const deferred = CartLinesUpdateEvent.createPromise();
    this.dispatchEvent(
      new CartLinesUpdateEvent({
        action,
        context: 'cart',
        lines: [{ id: lineKey, quantity }],
        promise: deferred.promise,
      })
    );
    return deferred;
  }

  resolveCartLinesUpdate(deferred, parsedState) {
    if (!deferred) return;
    const { CartLinesUpdateEvent } = window.StandardEvents || {};
    if (!CartLinesUpdateEvent) return;

    deferred.resolve({ cart: CartLinesUpdateEvent.createCartFromAjaxResponse(parsedState) });
  }

  dispatchCartErrorEvent(message, code) {
    const { CartErrorEvent } = window.StandardEvents || {};
    if (!CartErrorEvent) return;
    this.dispatchEvent(new CartErrorEvent({ error: message, code }));
  }

  updateLiveRegions(line, message) {
    const lineItemError =
      document.getElementById(`Line-item-error-${line}`) || document.getElementById(`CartDrawer-LineItemError-${line}`);
    if (lineItemError) lineItemError.querySelector('.cart-item__error-text').textContent = message;

    this.lineItemStatusElement.setAttribute('aria-hidden', true);

    const cartStatus =
      document.getElementById('cart-live-region-text') || document.getElementById('CartDrawer-LiveRegionText');
    cartStatus.setAttribute('aria-hidden', false);

    setTimeout(() => {
      cartStatus.setAttribute('aria-hidden', true);
    }, 1000);
  }

  getSectionInnerHTML(html, selector) {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  enableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.add('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

    [...cartItemElements, ...cartDrawerItemElements].forEach((overlay) => overlay.classList.remove('hidden'));

    document.activeElement.blur();
    this.lineItemStatusElement.setAttribute('aria-hidden', false);
  }

  disableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.remove('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

    cartItemElements.forEach((overlay) => overlay.classList.add('hidden'));
    cartDrawerItemElements.forEach((overlay) => overlay.classList.add('hidden'));
  }
}

customElements.define('cart-items', CartItems);

if (!customElements.get('cart-note')) {
  customElements.define(
    'cart-note',
    class CartNote extends HTMLElement {
      constructor() {
        super();

        this.addEventListener(
          'input',
          debounce((event) => {
            const newNote = event.target.value;
            const noteDeferred = this.dispatchNoteUpdateEvent(newNote);

            const body = JSON.stringify({ note: newNote });
            fetch(`${routes.cart_update_url}`, { ...fetchConfig(), ...{ body } })
              .then((r) => r.json())
              .then((cart) => {
                if (!cart || cart.errors) {
                  throw Object.assign(new Error(cart?.errors), { code: 'INVALID' });
                }

                if (noteDeferred) {
                  const { CartNoteUpdateEvent } = window.StandardEvents || {};
                  if (CartNoteUpdateEvent) {
                    noteDeferred.resolve({ cart: CartNoteUpdateEvent.createCartFromAjaxResponse(cart) });
                  }
                }
                CartPerformance.measureFromEvent('note-update:user-action', event);
              })
              .catch((e) => {
                noteDeferred?.reject(e);
                const { CartErrorEvent } = window.StandardEvents || {};
                if (CartErrorEvent) {
                  this.dispatchEvent(
                    new CartErrorEvent({
                      error: e.message || 'Note update failed',
                      code: e.code || 'SERVICE_UNAVAILABLE',
                    })
                  );
                }
              });
          }, ON_CHANGE_DEBOUNCE_TIMER)
        );
      }

      dispatchNoteUpdateEvent(newNote) {
        const { CartNoteUpdateEvent } = window.StandardEvents || {};
        if (!CartNoteUpdateEvent) return null;

        const context = this.closest('dialog') || this.closest('cart-drawer') ? 'dialog' : 'cart';
        const deferred = CartNoteUpdateEvent.createPromise();

        this.dispatchEvent(
          new CartNoteUpdateEvent({
            context,
            note: newNote,
            promise: deferred.promise,
          })
        );

        return deferred;
      }
    }
  );
}

// Persistent "Redirecting…" loading state for the checkout button. Exported
// on window (not a closure var) so both toggleCheckoutButton (CartItems) and
// any later drawer/section re-render can check/re-apply it — a re-render
// swaps in a fresh DOM node (innerHTML replace) that starts out enabled with
// its default label, so this needs to be re-applied after every such swap,
// not just set once on click.
function applyCheckoutNavigatingUI() {
  if (!window.__checkoutNavigating) return;
  const btn = document.querySelector('#CartDrawer-Checkout, #checkout, [name="checkout"]');
  if (!btn || btn.dataset.navigatingApplied === 'true') return;

  btn.disabled = true;
  btn.dataset.navigatingApplied = 'true';
  btn.innerHTML = '<span class="excise-checkout-spinner" aria-hidden="true"></span><span>Redirecting…</span>';
  btn.style.opacity = '0.7';
  btn.style.cursor = 'wait';
  btn.style.display = 'inline-flex';
  btn.style.alignItems = 'center';
  btn.style.justifyContent = 'center';
  btn.style.gap = '0.6em';

  if (!document.getElementById('excise-checkout-spinner-style')) {
    const style = document.createElement('style');
    style.id = 'excise-checkout-spinner-style';
    style.textContent = `
      .excise-checkout-spinner {
        width: 1em; height: 1em; border-radius: 50%;
        border: 0.15em solid currentColor; border-top-color: transparent;
        display: inline-block; animation: excise-checkout-spin 0.6s linear infinite;
      }
      @keyframes excise-checkout-spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
  }
}

// Ensure excise tax is fully reconciled before any checkout proceeds.
// Catches the case where a user adds a product and immediately clicks checkout
// before the background reconcile has finished.
//
// IMPORTANT: this only WAITS for the in-flight reconcile to drain. It does NOT
// start a fresh full reconcile (the old behaviour, which ran a whole ~8-request
// cycle on every click = the 15-30s stall). After an add/quantity change the tax
// is already reconciled in the background, so this normally resolves instantly.
(function guardCheckoutForExciseTax() {
  document.addEventListener(
    'click',
    async (event) => {
      const btn = event.target.closest('#CartDrawer-Checkout, #checkout, [name="checkout"]');
      if (!btn) return;

      const province = localStorage.getItem('userProvince');
      if (!province) return; // nothing to reconcile without a province

      // Stop the native submit/navigation until tax is set.
      event.preventDefault();
      event.stopImmediatePropagation();

      if (window.__checkoutNavigating) return; // ignore extra clicks while we drain
      window.__checkoutNavigating = true;
      applyCheckoutNavigatingUI();

      try {
        // Wait only for whatever reconcile is already in flight; do not queue a
        // new one. If everything is already settled this resolves immediately.
        await exciseReconcileChain;
      } catch (e) {
        console.error('Excise reconcile before checkout failed:', e);
      }

      window.location.href = '/checkout';
    },
    true // capture phase: run before the form submit handler
  );
})();