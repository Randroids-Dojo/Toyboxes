// "New version ready" banner. It shows only at calm moments (no dialog open,
// no race running), so a refresh never costs a lap or an unsaved page.

import { h } from './ui';

export class UpdateBanner {
  private el: HTMLElement | null = null;
  private ready = false;
  private dismissed = false;

  constructor(
    private readonly parent: HTMLElement,
    private readonly refresh: () => void,
  ) {}

  get available(): boolean {
    return this.ready;
  }

  /** A newer version is live. A dismissed banner comes back for the next one. */
  show(): void {
    this.ready = true;
    this.dismissed = false;
  }

  sync(calm: boolean): void {
    const want = this.ready && !this.dismissed && calm;
    if (want && !this.el) {
      const go = h('button', { class: 'update-go', type: 'button' }, 'Refresh');
      go.addEventListener('click', () => this.refresh());
      const close = h('button', { class: 'update-close', type: 'button', 'aria-label': 'Dismiss' }, '×');
      close.addEventListener('click', () => {
        this.dismissed = true;
        this.sync(false);
      });
      this.el = h('div', { class: 'update-banner', role: 'status' }, h('span', {}, 'A new version of Toyboxes is ready.'), go, close);
      this.parent.appendChild(this.el);
    } else if (!want && this.el) {
      this.el.remove();
      this.el = null;
    }
  }
}
