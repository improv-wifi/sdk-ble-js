import { LitElement, html, PropertyValues, css, TemplateResult } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import "./components/ib-dialog";
import "./components/ib-textfield";
import "./components/ib-button";
import "./components/ib-circular-progress";
import type { IbTextfield } from "./components/ib-textfield";
import {
  hasIdentifyCapability,
  ImprovCurrentState,
  ImprovErrorState,
  State,
  ImprovState,
} from "./const";
import { ImprovBluetoothLE } from "./ble";

const ERROR_ICON = "⚠️";
const OK_ICON = "🎉";
const AUTHORIZE_ICON = "👉";

@customElement("improv-wifi-provision-dialog")
class ProvisionDialog extends LitElement {
  public client!: ImprovBluetoothLE;

  public stateUpdateCallback!: (state: ImprovState) => void;

  @state() private _state: State = "CONNECTING";

  @state() private _improvCurrentState?: ImprovCurrentState | undefined;
  @state() private _improvErrorState = ImprovErrorState.NO_ERROR;
  @state() private _improvCapabilities = 0;

  @state() private _busy = false;

  private _error?: string;

  @query("ib-textfield[name=ssid]") private _inputSSID!: IbTextfield;
  @query("ib-textfield[name=password]") private _inputPassword!: IbTextfield;

  protected render() {
    let heading: string = "";
    let content: TemplateResult;
    let hideActions = false;

    if (this._state === "CONNECTING") {
      content = this._renderProgress("Connecting");
      hideActions = true;
    } else if (this._state === "ERROR") {
      content = this._renderMessage(
        ERROR_ICON,
        `An error occurred. ${this._error}`,
        true
      );
    } else if (
      this._improvCurrentState === ImprovCurrentState.AUTHORIZATION_REQUIRED
    ) {
      content = this._renderMessage(
        AUTHORIZE_ICON,
        "Press the authorize button on the device",
        false
      );
    } else if (this._improvCurrentState === ImprovCurrentState.AUTHORIZED) {
      if (this._busy) {
        content = this._renderProgress("Provisioning");
        hideActions = true;
      } else {
        heading = "Configure Wi-Fi";
        content = this._renderImprovAuthorized();
      }
    } else if (this._improvCurrentState === ImprovCurrentState.PROVISIONING) {
      content = this._renderProgress("Provisioning");
      hideActions = true;
    } else if (this._improvCurrentState === ImprovCurrentState.PROVISIONED) {
      content = this._renderImprovProvisioned();
    } else {
      content = this._renderMessage(
        ERROR_ICON,
        `Unexpected state: ${this._state} - ${this._improvCurrentState}`,
        true
      );
    }

    return html`
      <ib-dialog
        open
        .heading=${heading}
        scrimClickAction
        @closed=${this._handleClose}
        .hideActions=${hideActions}
        >${content}</ib-dialog
      >
    `;
  }

  _renderProgress(label: string) {
    return html`
      <div class="center">
        <div>
          <ib-circular-progress
            active
            indeterminate
            density="8"
          ></ib-circular-progress>
        </div>
        ${label}
      </div>
    `;
  }

  _renderMessage(icon: string, label: string, showClose: boolean) {
    return html`
      <div class="center">
        <div class="icon">${icon}</div>
        ${label}
      </div>
      ${showClose &&
      html`
        <ib-button
          slot="primaryAction"
          dialogAction="ok"
          label="Close"
        ></ib-button>
      `}
    `;
  }

  private _renderImprovAuthorized() {
    let error: string | undefined;

    switch (this._improvErrorState) {
      case ImprovErrorState.UNABLE_TO_CONNECT:
        error = "Unable to connect";
        break;

      case ImprovErrorState.NO_ERROR:
        break;

      default:
        error = `Unknown error (${this._improvErrorState})`;
    }

    return html`
      <div>
        Enter the credentials of the Wi-Fi network that you want
        ${this.client.name || "your device"} to connect to.
        ${hasIdentifyCapability(this._improvCapabilities)
          ? html`
              <button class="link" @click=${this._identify}>
                Identify the device.
              </button>
            `
          : ""}
      </div>
      ${error ? html`<p class="error">${error}</p>` : ""}
      <ib-textfield label="Network Name" name="ssid"></ib-textfield>
      <ib-textfield
        label="Password"
        name="password"
        type="password"
      ></ib-textfield>
      <ib-button
        slot="primaryAction"
        label="Connect"
        @click=${this._provision}
      ></ib-button>
      <ib-button
        slot="secondaryAction"
        dialogAction="close"
        label="Cancel"
      ></ib-button>
    `;
  }

  private _renderImprovProvisioned() {
    return html`
      <div class="center">
        <div class="icon">${OK_ICON}</div>
        Provisioned!
      </div>
      ${this.client.nextUrl === undefined
        ? html`
            <ib-button
              slot="primaryAction"
              dialogAction="ok"
              label="Close"
            ></ib-button>
          `
        : html`
            <a
              href=${this.client.nextUrl}
              slot="primaryAction"
              class="has-button"
              dialogAction="ok"
            >
              <ib-button label="Next"></ib-button>
            </a>
          `}
    `;
  }

  protected firstUpdated(changedProps: PropertyValues) {
    super.firstUpdated(changedProps);
    this.client.addEventListener("state-changed", () => {
      this._state = "IMPROV-STATE";
      this._busy = false;
      this._improvCurrentState = this.client.currentState;
    });
    this.client.addEventListener("error-changed", () => {
      this._improvErrorState = this.client.errorState;
      // Sending an RPC command sets error to no error.
      // If we get a real error it means the RPC command is done.

      if (this._improvErrorState !== ImprovErrorState.NO_ERROR) {
        this._busy = false;
      }
    });
    this.client.addEventListener("disconnect", () => {
      // If we're provisioned, we expect to be disconnected.
      if (
        this._state === "IMPROV-STATE" &&
        this._improvCurrentState === ImprovCurrentState.PROVISIONED
      ) {
        return;
      }
      this._state = "ERROR";
      this._error = "Device disconnected.";
    });
    this._connect();
  }

  private async _connect() {
    try {
      await this.client.initialize();
      this._improvCurrentState = this.client.currentState;
      this._improvErrorState = this.client.errorState;
      this._improvCapabilities = this.client.capabilities;
      this._state = "IMPROV-STATE";
    } catch (err: any) {
      this._state = "ERROR";
      this._error = err.message;
    }
  }

  private async _provision() {
    this._busy = true;
    try {
      await this.client.provision(
        this._inputSSID.value,
        this._inputPassword.value
      );
    } catch (err) {
      // Ignore, error state takes care of this.
    } finally {
      this._busy = false;
    }
  }

  private _identify() {
    this.client.identify();
  }

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);

    if (
      changedProps.has("_state") ||
      (this._state === "IMPROV-STATE" &&
        changedProps.has("_improvCurrentState"))
    ) {
      const state =
        this._state === "IMPROV-STATE"
          ? (ImprovCurrentState[
              this._improvCurrentState!
            ] as keyof typeof ImprovCurrentState) || "UNKNOWN"
          : this._state;
      this.stateUpdateCallback({ state });
    }

    if (
      (changedProps.has("_improvCurrentState") || changedProps.has("_state")) &&
      this._state === "IMPROV-STATE" &&
      this._improvCurrentState === ImprovCurrentState.AUTHORIZED
    ) {
      const input = this._inputSSID;
      input.updateComplete.then(() => input.focus());
    }
  }

  private _handleClose() {
    this.client.close();
    this.parentNode!.removeChild(this);
  }

  static styles = css`
    :host {
      --mdc-dialog-max-width: 390px;
      --mdc-theme-primary: var(--improv-primary-color, #03a9f4);
      --mdc-theme-on-primary: var(--improv-on-primary-color, #fff);
    }
    ib-textfield {
      display: block;
    }
    ib-textfield {
      margin-top: 16px;
    }
    .center {
      text-align: center;
    }
    ib-circular-progress {
      margin-bottom: 16px;
    }
    a.has-button {
      text-decoration: none;
    }
    .icon {
      font-size: 50px;
      line-height: 80px;
      color: black;
    }
    .error {
      color: #db4437;
    }
    button.link {
      background: none;
      color: inherit;
      border: none;
      padding: 0;
      font: inherit;
      text-align: left;
      text-decoration: underline;
      cursor: pointer;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "improv-wifi-provision-dialog": ProvisionDialog;
  }
}
