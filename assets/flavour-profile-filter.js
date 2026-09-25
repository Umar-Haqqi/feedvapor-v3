if (!customElements.get('flavour-profile-filter')) {
  customElements.define(
    'flavour-profile-filter',
    class FlavourProfileFilter extends HTMLElement {
      constructor() {
        super();
        this.tabs = Array.from(this.querySelectorAll('[data-flavour-tab]'));
        this.sections = this.tabs
          .map((tab) => document.getElementById(tab.dataset.target))
          .filter(Boolean);
      }

      connectedCallback() {
        this.tabs.forEach((tab) => {
          tab.addEventListener('click', this.onTabClick.bind(this));
        });

        if ('IntersectionObserver' in window && this.sections.length) {
          this.observer = new IntersectionObserver(this.onIntersect.bind(this), {
            rootMargin: '-40% 0px -55% 0px',
            threshold: 0,
          });
          this.sections.forEach((section) => this.observer.observe(section));
        }
      }

      onTabClick(event) {
        const tab = event.currentTarget;
        const target = document.getElementById(tab.dataset.target);
        if (!target) return;

        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });

        if (history.pushState) {
          history.pushState(null, '', `#${tab.dataset.target}`);
        }

        this.setActiveTab(tab);
      }

      onIntersect(entries) {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const tab = this.tabs.find((t) => t.dataset.target === entry.target.id);
          if (tab) this.setActiveTab(tab);
        });
      }

      setActiveTab(activeTab) {
        this.tabs.forEach((tab) => tab.classList.toggle('is-active', tab === activeTab));
      }
    }
  );
}
