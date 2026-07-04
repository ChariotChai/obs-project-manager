import App from "./App.svelte";
import type PmStore from "../store";

export class PmView {
  component?: App;

  constructor(public target: HTMLElement, public store: PmStore) {}

  mount() {
    this.component = new App({ target: this.target, props: { store: this.store } });
  }

  destroy() {
    if (this.component) {
      this.component.$destroy();
      this.component = undefined;
    }
  }
}
