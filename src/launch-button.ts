import { PropertyValues, ReactiveElement } from "@lit/reactive-element";

class LaunchButton extends ReactiveElement {
  public static isSupported = "bluetooth" in navigator;
  public static noSupportMsg =
    "Your browser does not support bluetooth provisioning. Use Google Chrome or Microsoft Edge.";

  static get properties() {
    return {
      hideIfUnsupported: { type: Boolean, attribute: "hide-if-unsupported" },
    };
  }

  public hideIfUnsupported = false;

  protected update(changedProps: PropertyValues) {
    super.update(changedProps);

    this.renderRoot.innerHTML = LaunchButton.isSupported
      ? "<slot><button>Connect device to Wi-Fi</button></slot>"
      : this.hideIfUnsupported
      ? ""
      : LaunchButton.noSupportMsg;
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
