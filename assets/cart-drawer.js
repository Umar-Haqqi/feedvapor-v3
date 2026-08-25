class CartDrawer extends HTMLElement {
  constructor() {
    super();
    this.addEventListener('keyup', (evt) => evt.code === 'Escape' && this.close());
    this.querySelector('#CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
    this.setHeaderCartIconAccessibility();

    // // Remove excise tax products immediately upon page load
    // this.removeFeeProductsFromCart();
    // const cart_products = this.getCartItemsFromAPI()
    // console.log(cart_products)

    // // Add custom functionality on checkout
    // const checkoutButton = document.getElementById('CartDrawer-Checkout');
    // if (checkoutButton) {
    //   checkoutButton.addEventListener('click', this.handleCheckout.bind(this));
    // }
    
  }

  // async handleCheckout(event) {
    
  //   event.preventDefault(); // Prevent default checkout action

  //   // Disable the checkout button to prevent multiple clicks
  //   const checkoutButton = event.currentTarget;
  //   checkoutButton.disabled = true;

  //   const userProvince = localStorage.getItem('userProvince');
  //   if (!userProvince) {
  //     alert('Please select a province before proceeding to checkout.');
  //     checkoutButton.disabled = false; // Re-enable the button
  //     return;
  //   }

  //   try {
  //     // Step 1: Remove existing excise tax products
  //     // await this.removeFeeProductsFromCart();

  //     // Step 2: Add necessary excise tax products based on current cart state
  //     const cartItems = await this.getCartItemsFromAPI();
      
  //     await this.addExciseTaxProductsToCart(cartItems, userProvince);

  //     // Step 3: Proceed to checkout after confirming cart update
  //     // setTimeout(() => {
  //       window.location.href = '/checkout';
  //     // }, 10000000);
  //   } catch (error) {
  //     console.error('Error handling checkout:', error);
  //     // alert('An error occurred. Please try again.');
  //   } finally {
  //     checkoutButton.disabled = false; // Re-enable the checkout button
  //   }
  // }

  // // Revised method to remove all products of type 'excise tax' from the cart
  // async removeFeeProductsFromCart() {
  //   console.log("removeFeeProductsFromCart: Fetching cart data...");
  
  //   const cart = await fetch('/cart.js').then((response) => response.json());
  //   const feeItems = cart.items.filter((item) => item.product_type.toLowerCase() === 'excise tax');
  
  //   console.log("Cart: ", cart);
  //   console.log("FeeItems to Remove: ", feeItems);
  
  //   if (feeItems.length > 0) {
  //     await this.emptyCart();
  //     location.reload();
  //     // Use a loop to ensure all fee items are removed in sequence
  //     // for (const item of feeItems) {
  //     //   console.log(`Removing item: ${item.title}, Variant ID: ${item.key || item.id}`);
  //     //   await this.removeItemFromCart(item.key || item.id);
  //     // }
  //     // this.updateCartCount();
  //     // this.updateCartDrawer();
  //     // // Re-check the cart to ensure no remaining fee items
  //     // const updatedCart = await fetch('/cart.js').then((response) => response.json());
  //     // const remainingFeeItems = updatedCart.items.filter((item) => item.product_type.toLowerCase() === 'excise tax');
  
  //     // console.log("Updated Cart: ", updatedCart);
  //     // console.log("Remaining FeeItems: ", remainingFeeItems);
      
  
  //     // if (remainingFeeItems.length > 0) {
  //     //   console.log("Re-invoking removeFeeProductsFromCart due to remaining fee items...");
  //     //   await this.removeFeeProductsFromCart(); // Recursively remove any remaining items
  //     // }
  //     // else{
  //     //   console.log("DONE");
  //     //   await this.emptyCart();
  //     //   location.reload();
  //     // }
  //   }
  // }

  // // Function to empty the Shopify cart
  // async emptyCart() {
  //   try {
  //     const response = await fetch('/cart/clear.js', {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //       },
  //     });
  
  //     if (response.ok) {
  //       console.log("Cart cleared successfully");
  //     } else {
  //       console.error("Failed to clear the cart");
  //     }
  //   } catch (error) {
  //     console.error("Error clearing the cart:", error);
  //   }
  // }

  // // Fetch cart items directly from the API
  // async getCartItemsFromAPI() {
  //   const cart = await fetch('/cart.js').then((response) => response.json());
  //   return cart.items.map((item) => ({
  //     title: item.title,
  //     quantity: item.quantity,
  //     // collection: item.properties ? item.properties.collection_name : '', // Access collection name from properties
  //     collection: item.product_type
  //   }));
  // }

  // getExciseTaxProducts(province) {
  //   // Define mappings for excise tax products based on province and collection
  //   const exciseTaxProducts = {
  //     Federal: {
  //       'Federal': { productId: 44494271774820 }, 
  //     },
  //     Provincial: {
  //       'ON': { productId: 44494273609828 },
  //       'QC': { productId: 44494275969124 },
  //       'NU': { productId: 44494277279844 },
  //       'NT': { productId: 44494276067428 },
  //     },
  //   };

  //   // Return federal and provincial product IDs for the collection
  //   return {
  //     federal: exciseTaxProducts['Federal']['Federal'],
  //     provincial: exciseTaxProducts['Provincial'][province],
  //   };
  // }

  
  // // Revised method to add excise tax products to the cart
  // async addExciseTaxProductsToCart(cartItems, province) {
  //   const exciseProductsToAdd = [];

  //   // *** add more provinces acc to your use case
  //   const provincesRequiringProvincialTax = ['ON', 'QC', 'NU', 'NT'];

  //   const exciseTaxProducts = this.getExciseTaxProducts(province);

    

  //   console.log(exciseTaxProducts)
    
  //   for (const item of cartItems) {
  //     // const applyTax = cartItems.product.collections.metafields.custom.applyexcisetax; //testing to make tax application dynamic

      
  //     if(item.title.toLowerCase() == "feed battery - black" ||  item.title.toLowerCase() === "feed battery - navy blue" || item.title.toLowerCase() === "feed battery - rose gold"){
  //       //do nothing
  //     }else{
  //         if (exciseTaxProducts.federal) {
  //         exciseProductsToAdd.push({
  //           id: exciseTaxProducts.federal.productId,
  //           quantity: item.quantity,
  //         });
  //       }

  //       // Add provincial excise product if needed
  //       if (provincesRequiringProvincialTax.includes(province) && exciseTaxProducts.provincial) {
  //         exciseProductsToAdd.push({
  //           id: exciseTaxProducts.provincial.productId,
  //           quantity: item.quantity,
  //         });
  //       }
  //     }
      
  //   }

  //   if (exciseProductsToAdd.length > 0) {
  //     await this.addExciseProducts(exciseProductsToAdd);
  //   }
  // }

  // // Add excise products to the cart
  // async addExciseProducts(exciseProducts) {
  //   console.log("Adding excise products to the cart: ", exciseProducts);
  
  //   return fetch('/cart/add.js', {
  //     method: 'POST',
  //     headers: {
  //       'Content-Type': 'application/json',
  //     },
  //     body: JSON.stringify({
  //       items: exciseProducts,
  //     }),
  //   })
  //     .then((response) => response.json())
  //     .then((data) => {
  //       console.log('Excise tax products added:', data);
  //     })
  //     .catch((error) => {
  //       console.error('Error adding excise tax products:', error);
  //       throw new Error('Unable to add excise tax. Please try again.');
  //     });
  // }

  // // Method to remove an item from the cart based on its variant ID
  // async removeItemFromCart(variantId) {
  //   return fetch('/cart/change.js', {
  //     method: 'POST',
  //     headers: {
  //       'Content-Type': 'application/json',
  //     },
  //     body: JSON.stringify({
  //       id: variantId,
  //       quantity: 0,
  //     }),
  //   })
  //     .then((response) => response.json())
  //     .then((data) => {
  //       console.log(`Item with variant ID ${variantId} removed from cart:`, data);
  //     })
  //     .catch((error) => {
  //       console.error('Error removing item from cart:', error);
  //       throw new Error('Unable to remove item from cart. Please try again.');
  //     });
  // }

  // // Method to update cart count in the header/cart icon
  // updateCartCount() {
  //   fetch('/cart.js')
  //     .then((response) => response.json())
  //     .then((cart) => {
  //       const cartCount = cart.item_count;
  //       const cartBubble = document.querySelector('#cart-icon-bubble .cart-count-bubble');
        
  //       if (cartBubble) {
  //         const countSpan = cartBubble.querySelector('span[aria-hidden="true"]');
  //         const visuallyHiddenSpan = cartBubble.querySelector('.visually-hidden');
          
  //         // Update the visible cart count if it is less than 100
  //         if (countSpan && cartCount < 100) {
  //           countSpan.innerText = cartCount;
  //         }
  
  //         // Update the visually hidden text for accessibility
  //         if (visuallyHiddenSpan) {
  //           visuallyHiddenSpan.innerText = `Cart contains ${cartCount} items`; // You can adjust the text as needed
  //         }
  //       } else {
  //         // If the cart-count-bubble does not exist (for example, when the cart is empty), you might need to render it dynamically
  //         console.log('Cart icon bubble element not found.');
  //       }
  //     })
  //     .catch((error) => console.error('Error updating cart count:', error));
  // }
  
  // // Method to update the cart drawer after changes
  // updateCartDrawer() {
  //   fetch(`${routes.cart_url}?section_id=cart-drawer`)
  //     .then((response) => response.text())
  //     .then((responseText) => {
  //       const html = new DOMParser().parseFromString(responseText, 'text/html');
  //       const drawerInner = document.querySelector('.drawer__inner');
  //       const updatedInner = html.querySelector('.drawer__inner');
  
  //       // Replace the current drawer content with the updated content
  //       if (drawerInner && updatedInner) {
  //         drawerInner.innerHTML = updatedInner.innerHTML;
  //       }
  //     })
  //     .catch((error) => console.error('Error updating cart drawer:', error));
  // }

  // below is original code - OMA

  setHeaderCartIconAccessibility() {
    const cartLink = document.querySelector('#cart-icon-bubble');
    if (!cartLink) return;

    cartLink.setAttribute('role', 'button');
    cartLink.setAttribute('aria-haspopup', 'dialog');
    cartLink.addEventListener('click', (event) => {
      event.preventDefault();
      this.open(cartLink);
    });
    cartLink.addEventListener('keydown', (event) => {
      if (event.code.toUpperCase() === 'SPACE') {
        event.preventDefault();
        this.open(cartLink);
      }
    });
  }

  open(triggeredBy) {
    if (this.classList.contains('active')) return;
    if (triggeredBy) this.setActiveElement(triggeredBy);
    const cartDrawerNote = this.querySelector('[id^="Details-"] summary');
    if (cartDrawerNote && !cartDrawerNote.hasAttribute('role')) this.setSummaryAccessibility(cartDrawerNote);
    // here the animation doesn't seem to always get triggered. A timeout seem to help
    setTimeout(() => {
      this.classList.add('animate', 'active');
    });

    this.addEventListener(
      'transitionend',
      () => {
        const containerToTrapFocusOn = this.classList.contains('is-empty')
          ? this.querySelector('.drawer__inner-empty')
          : document.getElementById('CartDrawer');
        const focusElement = this.querySelector('.drawer__inner') || this.querySelector('.drawer__close');
        trapFocus(containerToTrapFocusOn, focusElement);
      },
      { once: true },
    );

    document.body.classList.add('overflow-hidden');

    // cart-drawer-items is a CartItems subclass that extends createViewEventElement.
    // Its `view-event-trigger="manual"` skips auto-dispatch on connect; we fire
    // it here when the drawer opens, with `context: 'dialog'` from the payload attribute.
    this.querySelector('cart-drawer-items')?.dispatchViewEvent();
  }

  close() {
    this.classList.remove('active');
    removeTrapFocus(this.activeElement);
    document.body.classList.remove('overflow-hidden');
  }

  setSummaryAccessibility(cartDrawerNote) {
    cartDrawerNote.setAttribute('role', 'button');
    cartDrawerNote.setAttribute('aria-expanded', 'false');

    if (cartDrawerNote.nextElementSibling.getAttribute('id')) {
      cartDrawerNote.setAttribute('aria-controls', cartDrawerNote.nextElementSibling.id);
    }

    cartDrawerNote.addEventListener('click', (event) => {
      event.currentTarget.setAttribute('aria-expanded', !event.currentTarget.closest('details').hasAttribute('open'));
    });

    cartDrawerNote.parentElement.addEventListener('keyup', onKeyUpEscape);
  }

  renderContents(parsedState) {
    this.querySelector('.drawer__inner').classList.contains('is-empty') &&
      this.querySelector('.drawer__inner').classList.remove('is-empty');
    this.productId = parsedState.id;
    this.getSectionsToRender().forEach((section) => {
      const sectionElement = section.selector
        ? document.querySelector(section.selector)
        : document.getElementById(section.id);

      if (!sectionElement) return;
      sectionElement.innerHTML = this.getSectionInnerHTML(parsedState.sections[section.id], section.selector);
    });
    if (typeof applyCheckoutNavigatingUI === 'function') applyCheckoutNavigatingUI();

    setTimeout(() => {
      this.querySelector('#CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
      this.open();
    });
  }

  getSectionInnerHTML(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  getSectionsToRender() {
    return [
      {
        id: 'cart-drawer',
        selector: '#CartDrawer',
      },
      {
        id: 'cart-icon-bubble',
      },
    ];
  }

  getSectionDOM(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
  }

  setActiveElement(element) {
    this.activeElement = element;
  }
}

customElements.define('cart-drawer', CartDrawer);

class CartDrawerItems extends CartItems {
  getSectionsToRender() {
    return [
      {
        id: 'CartDrawer',
        section: 'cart-drawer',
        selector: '.drawer__inner',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
    ];
  }
}

customElements.define('cart-drawer-items', CartDrawerItems);
const FREE_SHIPPING_THRESHOLD = 8000; // $80 CAD in cents

function updateShippingBar() {
  fetch('/cart.js')
    .then(r => r.json())
    .then(cart => {
      const bar = document.getElementById('free-shipping-bar');
      const msg = document.getElementById('shipping-msg');
      const fill = document.getElementById('shipping-progress-fill');
      if (!bar) return;

      // Exclude hidden excise tax products
const visibleItems = cart.items.filter(item => item.product_type !== 'excise tax');
const visibleCount = visibleItems.reduce((sum, item) => sum + item.quantity, 0);

if (visibleCount === 0) {
  bar.style.display = 'none';
  return;
}

bar.style.display = 'block';
const total = visibleItems.reduce((sum, item) => sum + item.line_price, 0);

      const progress = Math.min((total / FREE_SHIPPING_THRESHOLD) * 100, 100);
      fill.style.width = progress + '%';

      if (total >= FREE_SHIPPING_THRESHOLD) {
        msg.innerHTML = '🎉 You\'ve Unlocked Free Shipping!';
        msg.style.color = '#ffffff';
        fill.style.background = '#ffffff';
      } else {
        const remaining = ((FREE_SHIPPING_THRESHOLD - total) / 100).toFixed(2);
        msg.innerHTML = 'You\'re <strong>$' + remaining + ' CAD</strong> away from FREE SHIPPING!';
        msg.style.color = '#fff';
        fill.style.background = '#fff';
      }
    });
}

document.addEventListener('DOMContentLoaded', updateShippingBar);
document.addEventListener('cart:refresh', updateShippingBar);
document.addEventListener('cart:updated', updateShippingBar);
document.addEventListener('theme:cart:update', updateShippingBar);

// Observe DOM for when cart drawer is injected
const observer = new MutationObserver(() => {
  if (document.getElementById('free-shipping-bar')) {
    updateShippingBar();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
