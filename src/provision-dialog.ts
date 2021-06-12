import { LitElement, html, PropertyValues, css } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import "@material/mwc-dialog";
import "@material/mwc-textfield";
import "@material/mwc-button";
import "@material/mwc-circular-progress";
import type { TextField } from "@material/mwc-textfield";
import {
  hasIdentifyCapability,
  ImprovCurrentState,
  ImprovErrorState,
  ImprovRPCCommand,
  IMPROV_BLE_CURRENT_STATE_CHARACTERISTIC,
  IMPROV_BLE_ERROR_STATE_CHARACTERISTIC,
  IMPROV_BLE_RPC_COMMAND_CHARACTERISTIC,
  IMPROV_BLE_RPC_RESULT_CHARACTERISTIC,
  IMPROV_BLE_SERVICE,
  ImprovRPCResult,
} from "./const";

const ERROR_ICON = "⚠️";
const OK_ICON = "🎉";
const AUTHORIZE_ICON = "👉";
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
  @state() private _improvRPCResult?: ImprovRPCResult;
  @state() private _improvCapabilities = 0;

  @state() private _busy = false;

  private _error?: string;

  private _currentStateChar?: BluetoothRemoteGATTCharacteristic;
  private _errorStateChar?: BluetoothRemoteGATTCharacteristic;
  private _rpcCommandChar?: BluetoothRemoteGATTCharacteristic;
  private _rpcResultChar?: BluetoothRemoteGATTCharacteristic;

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
      content = this._renderMessage(ERROR_ICON, "Device disconnected", true);
    } else if (this._state === "error") {
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

  _renderMessage(icon: string, label: string, showClose: boolean) {
    return html`
      <div class="center">
        <div class="icon">${icon}</div>
        ${label}
      </div>
      ${showClose &&
      html`
        <mwc-button
          slot="primaryAction"
          dialogAction="ok"
          label="Close"
        ></mwc-button>
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
        Enter the Wi-Fi credentials of the network that you want
        ${this.device.name || "your device"} to connect to.
        ${hasIdentifyCapability(this._improvCapabilities)
          ? html`
              <button class="link" @click=${this._rpcIdentify}>
                Identify the device.
              </button>
            `
          : ""}
      </div>
      ${error ? html`<p class="error">${error}</p>` : ""}
      <mwc-textfield label="Wi-Fi SSID" name="ssid"></mwc-textfield>
      <mwc-textfield
        label="Wi-Fi password"
        name="password"
        type="password"
      ></mwc-textfield>
      <mwc-button
        slot="primaryAction"
        label="Save"
        @click=${this._rpcWriteSettings}
      ></mwc-button>
      <mwc-button
        slot="secondaryAction"
        dialogAction="close"
        label="Cancel"
      ></mwc-button>
    `;
  }

  private _renderImprovProvisioned() {
    if (this._busy) {
      return this._renderProgress("");
    }

    let redirectUrl: string | undefined;

    if (
      this._improvRPCResult &&
      this._improvRPCResult.command === ImprovRPCCommand.SEND_WIFI_SETTINGS &&
      this._improvRPCResult.values.length > 0
    ) {
      redirectUrl = this._improvRPCResult.values[0];
    }

    return html`
      <div class="center">
        <div class="icon">${OK_ICON}</div>
        Provisioned!
      </div>
      ${redirectUrl === undefined
        ? html`
            <mwc-button
              slot="primaryAction"
              dialogAction="ok"
              label="Close"
            ></mwc-button>
          `
        : html`
            <a
              href=${redirectUrl}
              slot="primaryAction"
              class="has-button"
              @click=${() => {
                this._busy = true;
              }}
            >
              <mwc-button label="Next"></mwc-button>
            </a>
          `}
    `;
  }

  protected firstUpdated(changedProps: PropertyValues) {
    super.firstUpdated(changedProps);
    this.device.addEventListener("gattserverdisconnected", () => {
      this._state = "disconnected";
    });
    this._connect();
  }

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);

    if (
      (changedProps.has("_improvCurrentState") || changedProps.has("_state")) &&
      this._state === "improv-state" &&
      this._improvCurrentState === ImprovCurrentState.AUTHORIZED
    ) {
      const input = this._inputSSID;
      input.updateComplete.then(() => input.focus());
    }
  }

  private async _connect() {
    // Do everything in sequence as some OSes do not support parallel GATT commands
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
      this._rpcCommandChar = await service.getCharacteristic(
        IMPROV_BLE_RPC_COMMAND_CHARACTERISTIC
      );
      this._rpcResultChar = await service.getCharacteristic(
        IMPROV_BLE_RPC_RESULT_CHARACTERISTIC
      );
      try {
        const capabilitiesChar = await service.getCharacteristic(
          IMPROV_BLE_RPC_COMMAND_CHARACTERISTIC
        );
        const capabilitiesValue = await capabilitiesChar.readValue();
        this._improvCapabilities = capabilitiesValue.getUint8(0);
      } catch (err) {
        console.warn(
          "Firmware not according to spec, missing capability support."
        );
      }

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

      this._rpcResultChar.startNotifications();
      this._rpcResultChar.addEventListener(
        "characteristicvaluechanged",
        (ev: any) => this._handleImprovRPCResultChange(ev.target.value)
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

  private _handleImprovRPCResultChange(encodedResult: DataView) {
    if (DEBUG) console.log("improv RPC result", encodedResult);

    const command = encodedResult.getUint8(0) as ImprovRPCCommand;
    const result: ImprovRPCResult = {
      command,
      values: [],
    };
    const dataLength = encodedResult.getUint8(1);

    const baseOffset = 2;
    const decoder = new TextDecoder();

    for (let start = 0; start < dataLength; ) {
      const valueLength = encodedResult.getUint8(baseOffset + start);
      const valueBytes = new Uint8Array(valueLength);
      const valueOffset = baseOffset + start + 1;
      for (let i = 0; i < valueLength; i++) {
        valueBytes[i] = encodedResult.getUint8(valueOffset + i);
      }
      result.values.push(decoder.decode(valueBytes));
      start += valueLength;
    }

    this._improvRPCResult = result;
  }

  private _rpcIdentify() {
    this._sendRPC(ImprovRPCCommand.IDENTIFY, new Uint8Array(), false);
  }

  private _rpcWriteSettings() {
    const encoder = new TextEncoder();
    const ssidEncoded = encoder.encode(this._inputSSID.value);
    const pwEncoded = encoder.encode(this._inputPassword.value);
    const data = new Uint8Array([
      ssidEncoded.length,
      ...ssidEncoded,
      pwEncoded.length,
      ...pwEncoded,
    ]);
    this._sendRPC(ImprovRPCCommand.SEND_WIFI_SETTINGS, data, true);
  }

  private _sendRPC(
    command: ImprovRPCCommand,
    data: Uint8Array,
    receivedFeedback: boolean
  ) {
    if (DEBUG) console.log("RPC COMMAND", command, data);
    // Commands that receive feedback will finish when either
    // the state changes or the error code becomes not 0.
    if (receivedFeedback) {
      this._busy = true;
    }
    const payload = new Uint8Array([command, data.length, ...data, 0]);
    payload[payload.length - 1] = payload.reduce((sum, cur) => sum + cur, 0);
    this._improvRPCResult = undefined;
    this._rpcCommandChar!.writeValueWithoutResponse(payload);
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
