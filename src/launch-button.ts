class LaunchButton extends HTMLElement {
  private static _browserSupported = navigator.userAgent.includes("Linux");
  public static isSupported =
    LaunchButton._browserSupported && "bluetooth" in navigator;

  private renderRoot?: ShadowRoot;

  public connectedCallback() {
    if (this.renderRoot) {
      return;
    }

    this.renderRoot = this.attachShadow({ mode: "open" });

    if (LaunchButton.isSupported) {
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

    this.renderRoot.innerHTML = LaunchButton.isSupported
      ? "<slot name='activate'><button>Connect device to Wi-Fi</button></slot>"
      : `<slot name='unsupported'>Your browser does not support bluetooth provisioning. ${
          !LaunchButton._browserSupported
            ? "Use Google Chrome or Microsoft Edge."
            : ""
        }</slot>`;
  }
}

customElements.define("improv-wifi-launch-button", LaunchButton);
