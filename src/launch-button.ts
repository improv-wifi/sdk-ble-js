import { LitElement, html, PropertyValues } from "lit";

class LaunchButton extends LitElement {
  public static isSupported = "bluetooth" in navigator;
  public static noSupportMsg =
    "Your browser does not support bluetooth provisioning. Use Google Chrome or Microsoft Edge.";

  protected render() {
    return LaunchButton.isSupported
      ? html`
          <slot>
            <button>Connect device to Wi-Fi</button>
          </slot>
        `
      : html`${LaunchButton.noSupportMsg}`;
  }

  protected firstUpdated(changedProps: PropertyValues) {
    super.firstUpdated(changedProps);
    this.addEventListener("mouseover", () => {
      // Preload
      import("./provision");
    });
    this.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const mod = await import("./provision");
      mod.startProvisioning();
    });
  }
}

customElements.define("improv-wifi-launch-button", LaunchButton);
