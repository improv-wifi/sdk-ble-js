class LaunchButton extends HTMLElement {
  public static isSupported = "bluetooth" in navigator;

  static get observedAttributes() {
    return ["hide-if-unsupported"];
  }

  private renderRoot?: ShadowRoot;

  public connectedCallback() {
    this.update();
  }

  public attributeChangedCallback() {
    this.update();
  }

  protected update() {
    if (!this.renderRoot) {
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
    }

    this.renderRoot.innerHTML = LaunchButton.isSupported
      ? "<slot name='activate'><button>Connect device to Wi-Fi</button></slot>"
      : "<slot name='unsupported'>Your browser does not support bluetooth provisioning. Use Google Chrome or Microsoft Edge.</slot>";
  }
}

customElements.define("improv-wifi-launch-button", LaunchButton);
