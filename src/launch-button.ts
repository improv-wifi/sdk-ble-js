import { LitElement, html, PropertyValues, css } from "lit";
import { customElement } from "lit/decorators.js";
import { startProvisioning } from "./provision";
import "@material/mwc-button";

@customElement("improv-wifi-launch-button")
class LaunchButton extends LitElement {
  protected render() {
    return "bluetooth" in navigator
      ? html`
          <slot>
            <mwc-button label="Connect device to Wi-Fi"></mwc-button>
          </slot>
        `
      : html`Your browser does not support bluetooth provisioning. Use Google
        Chrome or Microsoft Edge.`;
  }

  protected firstUpdated(changedProps: PropertyValues) {
    super.firstUpdated(changedProps);
    this.addEventListener("click", (ev) => {
      ev.preventDefault();
      startProvisioning();
    });
  }

  static styles = css`
    :host {
      --mdc-theme-primary: #03a9f4;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "improv-wifi-launch-button": LaunchButton;
  }
}
