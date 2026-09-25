if (!customElements.get('collection-faq-accordion')) {
  customElements.define(
    'collection-faq-accordion',
    class CollectionFaqAccordion extends HTMLElement {
      connectedCallback() {
        this.headers = Array.from(this.querySelectorAll('.accordion-item-header'));
        this.headers.forEach((header) => {
          header.addEventListener('click', this.onHeaderClick.bind(this));
        });
      }

      onHeaderClick(event) {
        const header = event.currentTarget;
        const body = header.nextElementSibling;
        const icon = header.querySelector('.faq-direction-icon');
        const isActive = header.classList.contains('active-faq');

        this.headers.forEach((item) => {
          item.classList.remove('active-faq');
          item.nextElementSibling.style.maxHeight = 0;
          const itemIcon = item.querySelector('.faq-direction-icon');
          if (itemIcon) itemIcon.style.transform = 'rotate(0deg)';
        });

        if (!isActive) {
          header.classList.add('active-faq');
          body.style.maxHeight = `${body.scrollHeight}px`;
          if (icon) icon.style.transform = 'rotate(180deg)';
        }
      }
    }
  );
}
