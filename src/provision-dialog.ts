import { LitElement, html, PropertyValues, css, TemplateResult } from "lit";
import { customElement, query, state } from "lit/decorators.js";


import "@material/web/button/outlined-button.js"
import "@material/web/button/filled-button.js"
import "@material/web/dialog/dialog.js"
import "@material/web/progress/circular-progress.js"
import "@material/web/textfield/outlined-text-field.js"

import type { MdOutlinedTextField } from "@material/web/textfield/outlined-text-field.js"

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
  public device!: BluetoothDevice;

  public stateUpdateCallback!: (state: ImprovState) => void;

  @state() private _state: State = "CONNECTING";

  @state() private _improvCurrentState?: ImprovCurrentState | undefined;
  @state() private _improvErrorState = ImprovErrorState.NO_ERROR;
  @state() private _improvCapabilities = 0;

  @state() private _busy = false;

  private _error?: string;

  @query("md-outlined-text-field[name=ssid]") private _inputSSID!: MdOutlinedTextField;
  @query("md-outlined-text-field[name=password]") private _inputPassword!: MdOutlinedTextField;

  private __client?: ImprovBluetoothLE;

  private get _client(): ImprovBluetoothLE {
    if (!this.__client) {
      this.__client = new ImprovBluetoothLE(this.device, console);
    }
    return this.__client;
  }

  protected render() {
    let heading: string = "";
    let content: TemplateResult;
    let actions: TemplateResult | undefined;

    if (this._state === "CONNECTING") {
      content = this._renderProgress("Connecting");
    } else if (this._state === "ERROR") {
      content = this._renderMessage(
        ERROR_ICON,
        `An error occurred. ${this._error}`,
      );
      actions = this._renderCloseAction();
    } else if (
      this._improvCurrentState === ImprovCurrentState.AUTHORIZATION_REQUIRED
    ) {
      content = this._renderMessage(
        AUTHORIZE_ICON,
        "Press the authorize button on the device"
      );
    } else if (this._improvCurrentState === ImprovCurrentState.AUTHORIZED) {
      if (this._busy) {
        content = this._renderProgress("Provisioning");
      } else {
        heading = "Configure Wi-Fi";
        content = this._renderImprovAuthorized();
        actions = html`${this._renderCloseAction()}
          <md-filled-button @click=${this._provision}>Connect</md-filled-button>
        `;
      }
    } else if (this._improvCurrentState === ImprovCurrentState.PROVISIONING) {
      content = this._renderProgress("Provisioning");
    } else if (this._improvCurrentState === ImprovCurrentState.PROVISIONED) {
      content = this._renderImprovProvisioned();
      actions = this._client.nextUrl === undefined
          ? this._renderCloseAction()
          : html`${this._renderCloseAction()}
          <md-filled-button href=${this._client.nextUrl} form="improv-form">Next</md-filled-button>`;
    } else {
      content = this._renderMessage(
        ERROR_ICON,
        `Unexpected state: ${this._state} - ${this._improvCurrentState}`
      );
      actions = this._renderCloseAction();
    }

    return html`
      <md-dialog open @close=${this._handleClose}>
        <div slot="headline">${heading}</div>
        <form slot="content" id="improv-form" method="dialog">${content}</form>
        ${actions ? html`<div slot="actions">${actions}</div>` : ''}
      </md-dialog>
    `;
  }

  _renderCloseAction() {
    return html`<md-outlined-button form="improv-form">Close</md-outlined-button>`
  }

  _renderProgress(label: string) {
    return html`
      <div class="center">
        <div>
          <md-circular-progress indeterminate></md-circular-progress>
        </div>
        ${label}
      </div>
    `;
  }

  _renderMessage(icon: string, label: string) {
    return html`
      <div class="center">
        <div class="icon">${icon}</div>
        ${label}
      </div>
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
        ${this._client.name || "your device"} to connect to.
        ${hasIdentifyCapability(this._improvCapabilities)
          ? html`
              <md-filled-button @click=${this._identify}>
                Identify the device.
              </md-filled-button>
            `
          : ""}
      </div>
      ${error ? html`<p class="error">${error}</p>` : ""}
      <md-outlined-text-field label="Network Name" name="ssid"></md-outlined-text-field>
      <md-outlined-text-field
          label="Password"
          name="password"
          type="password"
      ></md-outlined-text-field>
    `;
  }

  private _renderImprovProvisioned() {
    return html`
      <div class="center">
        <div class="icon">${OK_ICON}</div>
        Provisioned!
      </div>
    `;
  }

  protected firstUpdated(changedProps: PropertyValues) {
    super.firstUpdated(changedProps);
    this._client.addEventListener("state-changed", () => {
      this._state = "IMPROV-STATE";
      this._busy = false;
      this._improvCurrentState = this._client.currentState;
    });
    this._client.addEventListener("error-changed", () => {
      this._improvErrorState = this._client.errorState;
      // Sending an RPC command sets error to no error.
      // If we get a real error it means the RPC command is done.

      if (this._improvErrorState !== ImprovErrorState.NO_ERROR) {
        this._busy = false;
      }
    });
    this._client.addEventListener("disconnect", () => {
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
      await this._client.initialize();
      this._improvCurrentState = this._client.currentState;
      this._improvErrorState = this._client.errorState;
      this._improvCapabilities = this._client.capabilities;
      this._state = "IMPROV-STATE";
    } catch (err: any) {
      this._state = "ERROR";
      this._error = err.message;
    }
  }

  private async _provision() {
    this._busy = true;
    try {
      await this._client.provision(
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
    this._client.identify();
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
    this._client.close();
    this.parentNode!.removeChild(this);
  }

  static styles = css`
    :host {
      --mdc-dialog-max-width: 390px;
      --mdc-theme-primary: var(--improv-primary-color, #03a9f4);
      --mdc-theme-on-primary: var(--improv-on-primary-color, #fff);
    }

    md-outlined-text-field {
      display: block;
      margin-top: 16px;
    }
    
    .center {
      text-align: center;
    }
    md-circular-progress {
      margin-bottom: 16px;
    }
    .icon {
      font-size: 50px;
      line-height: 80px;
      color: black;
    }
    .error {
      color: #db4437;
    }`;
}

declare global {
  interface HTMLElementTagNameMap {
    "improv-wifi-provision-dialog": ProvisionDialog;
  }
}
