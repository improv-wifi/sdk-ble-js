import { LitElement, html, PropertyValues, css } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import "@material/mwc-dialog";
import "@material/mwc-textfield";
import "@material/mwc-button";
import "@material/mwc-circular-progress";
import type { TextField } from "@material/mwc-textfield";
import {
  ImprovCurrentState,
  ImprovErrorState,
  ImprovRPCCommand,
  IMPROV_BLE_CURRENT_STATE_CHARACTERISTIC,
  IMPROV_BLE_ERROR_STATE_CHARACTERISTIC,
  IMPROV_BLE_RPC_CHARACTERISTIC,
  IMPROV_BLE_SERVICE,
} from "./const";

const ERROR_ICON = "⚠️";
const OK_ICON = "🎉";
const DEBUG = false;

@customElement("improv-wifi-provision-dialog")
class ProvisionDialog extends LitElement {
  public device!: BluetoothDevice;

  @state() private _state:
    | "connecting"
    | "improv-state"
    | "disconnected"
    | "error" = "connecting";

  @state() private _improvCurrentState?: ImprovCurrentState | undefined;
  @state() private _improvErrorState = ImprovErrorState.NO_ERROR;

  @state() private _busy = false;

  private _error?: string;

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
    } else if (this._improvCurrentState === ImprovCurrentState.AVAILABLE) {
      content = this._renderImprovAwaitingActivation();
    } else if (this._improvCurrentState === ImprovCurrentState.ACTIVATED) {
      if (this._busy) {
        content = this._renderProgress("Provisioning");
        hideActions = true;
      } else {
        heading = "Configure Wi-Fi";
        content = this._renderImprovActivated();
      }
    } else if (this._improvCurrentState === ImprovCurrentState.PROVISIONING) {
      content = this._renderProgress("Provisioning");
      hideActions = true;
    } else if (this._improvCurrentState === ImprovCurrentState.PROVISIONED) {
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
        Enter the Wi-Fi credentials of the network that you want
        ${this.device.name || "your device"} to connect to.
      </div>
      ${error ? html`<p class="error">${error}</p>` : ""}
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
      (changedProps.has("_improvCurrentState") || changedProps.has("_state")) &&
      this._state === "improv-state" &&
      this._improvCurrentState === ImprovCurrentState.ACTIVATED
    ) {
      const input = this._inputSSID;
      input.updateComplete.then(() => input.focus());
    }
  }

  private async _connect() {
    // Some OSes do not support parallel GATT commands
    // https://github.com/WebBluetoothCG/web-bluetooth/issues/188#issuecomment-255121220

    try {
      await this.device.gatt!.connect();

      const service = await this.device.gatt!.getPrimaryService(
        IMPROV_BLE_SERVICE
      );

      this._currentStateChar = await service.getCharacteristic(
        IMPROV_BLE_CURRENT_STATE_CHARACTERISTIC
      );
      this._errorStateChar = await service.getCharacteristic(
        IMPROV_BLE_ERROR_STATE_CHARACTERISTIC
      );
      this._rpcChar = await service.getCharacteristic(
        IMPROV_BLE_RPC_CHARACTERISTIC
      );

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

      const curState = await this._currentStateChar.readValue();
      const errorState = await this._errorStateChar.readValue();

      this._handleImprovCurrentStateChange(curState);
      this._handleImprovErrorStateChange(errorState);
      this._state = "improv-state";
    } catch (err) {
      this._state = "error";
      this._error = `Unable to establish a connection: ${err}`;
    }
  }

  private _handleImprovCurrentStateChange(encodedState: DataView) {
    const state = encodedState.getUint8(0) as ImprovCurrentState;
    if (DEBUG) console.log("improv current state", state);
    this._improvCurrentState = state;
    // If we receive a new state, it means the RPC command is done
    this._busy = false;
  }

  private _handleImprovErrorStateChange(encodedState: DataView) {
    const state = encodedState.getUint8(0) as ImprovErrorState;
    if (DEBUG) console.log("improv error state", state);
    this._improvErrorState = state;
    // Sending an RPC command sets error to no error.
    // If we get a real error it means the RPC command is done.
    if (state !== ImprovErrorState.NO_ERROR) {
      this._busy = false;
    }
  }

  private async _writeSettings() {
    const encoder = new TextEncoder();
    const ssidEncoded = encoder.encode(this._inputSSID.value);
    console.log({ ssid: this._inputSSID.value, pw: this._inputPassword.value });
    const pwEncoded = encoder.encode(this._inputPassword.value);
    const data = new Uint8Array([
      ssidEncoded.length,
      ...ssidEncoded,
      pwEncoded.length,
      ...pwEncoded,
    ]);
    this._sendRPC(ImprovRPCCommand.SEND_WIFI_SETTINGS, data);
  }

  private _sendRPC(command: ImprovRPCCommand, data: Uint8Array) {
    if (DEBUG) console.log("RPC COMMAND", command, data);
    this._busy = true;
    const payload = new Uint8Array([command, data.length, ...data, 0]);
    payload[payload.length - 1] = payload.reduce((sum, cur) => sum + cur, 0);
    this._rpcChar!.writeValueWithoutResponse(payload);
  }

  private _handleKeyDown(ev: KeyboardEvent) {
    if (ev.key == "enter") {
      this._writeSettings();
    }
  }

  private async _handleClose() {
    if (this.device.gatt!.connected) {
      if (DEBUG) console.log("Disconnecting gatt");
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
    .error {
      color: #db4437;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "improv-wifi-provision-dialog": ProvisionDialog;
  }
}
