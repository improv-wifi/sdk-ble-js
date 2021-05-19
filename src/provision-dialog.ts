import { LitElement, html, PropertyValues, css } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import "@material/mwc-dialog";
import "@material/mwc-textfield";
import "@material/mwc-button";
import "@material/mwc-circular-progress";
import type { TextField } from "@material/mwc-textfield";
import {
  ImprovState,
  IMPROV_BLE_CURRENT_STATE_CHARACTERISTIC,
  IMPROV_BLE_ERROR_STATE_CHARACTERISTIC,
  IMPROV_BLE_RPC_CHARACTERISTIC,
  IMPROV_BLE_SERVICE,
} from "./const";

const ERROR_ICON = "⚠️";
const OK_ICON = "🎉";

@customElement("improv-wifi-provision-dialog")
class ProvisionDialog extends LitElement {
  public device!: BluetoothDevice;

  @state() private _state:
    | "connecting"
    | "improv-state"
    | "disconnected"
    | "error" =
    // "connecting";
    "improv-state";

  @state() private _improvCurrentState?: ImprovState | undefined =
    // temp
    "ACTIVATED";
  @state() private _improvErrorState?: string | undefined;

  @state() private _busy = false;

  private _error?: string;
  private _decoder = new TextDecoder("utf-8");

  private _currentStateChar?: BluetoothRemoteGATTCharacteristic;
  private _errorStateChar?: BluetoothRemoteGATTCharacteristic;
  private _rpcChar?: BluetoothRemoteGATTCharacteristic;

  @query("mwc-textfield[name=ssid]") private _inputSSID!: TextField;
  @query("mwc-textfield[name=password]") private _inputPassword!: TextField;

  protected render() {
    let heading;
    let content;
    let hideActions = false;

    if (this._state === "connecting") {
      content = this._renderProgress("Connecting");
      hideActions = true;
    } else if (this._state === "disconnected") {
      content = this._renderEndMessage(ERROR_ICON, "Device disconnected");
    } else if (this._state === "error") {
      content = this._renderEndMessage(
        ERROR_ICON,
        `An error occurred. ${this._error}`
      );
    } else if (this._improvCurrentState === "AVAILABLE") {
      content = this._renderImprovAwaitingActivation();
    } else if (this._improvCurrentState === "ACTIVATED") {
      if (this._busy) {
        content = this._renderProgress("Provisioning");
        hideActions = true;
      } else {
        heading = "Configure Wi-Fi";
        content = this._renderImprovActivated();
      }
    } else if (this._improvCurrentState === "PROVISIONING") {
      content = this._renderProgress("Provisioning");
      hideActions = true;
    } else if (this._improvCurrentState === "PROVISIONED") {
      content = this._renderEndMessage(OK_ICON, "Provisioning done!");
    } else {
      content = this._renderEndMessage(
        ERROR_ICON,
        `Unexpected state: ${this._state} - ${this._improvCurrentState}`
      );
    }

    return html`
      <mwc-dialog
        open
        heading=${heading}
        scrimClickAction
        @closed=${this._handleClose}
        .hideActions=${hideActions}
        >${content}</mwc-dialog
      >
    `;
  }

  _renderProgress(label: string) {
    return html`
      <div class="center">
        <div>
          <mwc-circular-progress
            active
            indeterminate
            density="8"
          ></mwc-circular-progress>
        </div>
        ${label}
      </div>
    `;
  }

  _renderEndMessage(icon: string, label: string) {
    return html`
      <div class="center">
        <div class="icon">${icon}</div>
        ${label}
      </div>
      <mwc-button
        slot="primaryAction"
        dialogAction="ok"
        label="Close"
      ></mwc-button>
    `;
  }

  _renderImprovAwaitingActivation() {
    return html`Press the activate button on the device`;
  }

  _renderImprovActivated() {
    return html`
      <div>
        Enter the Wi-Fi credentials of the network that you want
        ${this.device.name || "your device"} to connect to.
      </div>
      <mwc-textfield
        label="Wi-Fi SSID"
        name="ssid"
        @keydown=${this._handleKeyDown}
      ></mwc-textfield>
      <mwc-textfield
        label="Wi-Fi password"
        name="password"
        type="password"
        @keydown=${this._handleKeyDown}
      ></mwc-textfield>
      <mwc-button
        slot="primaryAction"
        label="Save"
        @click=${this._writeSettings}
      ></mwc-button>
      <mwc-button
        slot="secondaryAction"
        dialogAction="close"
        label="Cancel"
      ></mwc-button>
    `;
  }

  _renderImprovProvisioned() {
    return html`provisioned`;
  }

  public willUpdate(changedProps: PropertyValues) {
    super.willUpdate(changedProps);
    if (!this.device.gatt!.connected) {
      this._state = "connecting";
    }
  }

  protected firstUpdated(changedProps: PropertyValues) {
    super.firstUpdated(changedProps);

    this.device.addEventListener("gattserverdisconnected", () => {
      this._state = "disconnected";
    });
  }

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);

    if (!this.device.gatt!.connected) {
      this._connect();
    }

    if (
      changedProps.has("_improvCurrentState") &&
      this._improvCurrentState === "ACTIVATED"
    ) {
      const input = this._inputSSID;
      input.updateComplete.then(() => input.focus());
    }
  }

  private async _connect() {
    try {
      await this.device.gatt!.connect();

      const service = await this.device.gatt!.getPrimaryService(
        IMPROV_BLE_SERVICE
      );

      [this._currentStateChar, this._errorStateChar, this._rpcChar] =
        await Promise.all([
          service.getCharacteristic(IMPROV_BLE_CURRENT_STATE_CHARACTERISTIC),
          service.getCharacteristic(IMPROV_BLE_ERROR_STATE_CHARACTERISTIC),
          service.getCharacteristic(IMPROV_BLE_RPC_CHARACTERISTIC),
        ]);

      this._currentStateChar.startNotifications();
      this._currentStateChar.addEventListener(
        "characteristicvaluechanged",
        (ev: any) => this._handleImprovCurrentStateChange(ev.target.value)
      );

      this._errorStateChar.startNotifications();
      this._errorStateChar.addEventListener(
        "characteristicvaluechanged",
        (ev: any) => this._handleImprovErrorStateChange(ev.target.value)
      );

      const [curState, errorState] = await Promise.all([
        this._currentStateChar.readValue(),
        this._errorStateChar.readValue(),
      ]);

      this._handleImprovCurrentStateChange(curState);
      this._handleImprovErrorStateChange(errorState);
      this._state = "improv-state";
    } catch (err) {
      this._state = "error";
      this._error = `Unable to establish a connection: ${err}`;
    }
  }

  private _handleImprovCurrentStateChange(encodedState: any) {
    const state = this._decoder.decode(encodedState) as ImprovState;
    this._improvCurrentState = state;
  }

  private _handleImprovErrorStateChange(encodedState: any) {
    const state = this._decoder.decode(encodedState);
    this._improvErrorState = state;
  }

  private async _writeSettings() {
    const encoder = new TextEncoder();
    const data =
      this._inputSSID.value + ":::" + this._inputPassword.value + ":%:";

    try {
      this._busy = true;
      // this._rpcChar!.writeValueWithoutResponse(encoder.encode(data));
      // Temp
      await new Promise((resolve) => setTimeout(resolve, 2000));
      this._improvCurrentState = "PROVISIONED";
    } catch (err) {
      this._error = "Error writing data.";
      this._state = "error";
    } finally {
      this._busy = false;
    }
  }

  private _handleKeyDown(ev: KeyboardEvent) {
    if (ev.key == "enter") {
      this._writeSettings();
    }
  }

  private _handleClose() {
    this._currentStateChar?.stopNotifications();
    this._errorStateChar?.stopNotifications();
    if (this.device.gatt!.connected) {
      this.device.gatt!.disconnect();
    }
    this.parentNode!.removeChild(this);
  }

  static styles = css`
    :host {
      --mdc-dialog-max-width: 390px;
      --mdc-theme-primary: #03a9f4;
    }
    mwc-textfield {
      display: block;
    }
    mwc-textfield {
      margin-top: 16px;
    }
    .center {
      text-align: center;
    }
    mwc-circular-progress {
      margin-bottom: 16px;
    }
    .icon {
      font-size: 50px;
      line-height: 80px;
      color: black;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "improv-wifi-provision-dialog": ProvisionDialog;
  }
}
