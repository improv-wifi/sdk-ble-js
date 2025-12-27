import { LitElement, html, PropertyValues, css, TemplateResult } from "lit";
import { customElement, query, state } from "lit/decorators.js";

import "@material/web/button/outlined-button.js";
import "@material/web/button/filled-button.js";
import "@material/web/button/filled-tonal-button.js";
import "@material/web/dialog/dialog.js";
import "@material/web/progress/circular-progress.js";
import "@material/web/textfield/outlined-text-field.js";
import "@material/web/chips/chip-set.js";
import "@material/web/chips/filter-chip.js";
import "@material/web/select/select-option.js";
import "@material/web/select/outlined-select.js";
import "@material/web/icon/icon.js";
import "@material/web/iconbutton/outlined-icon-button.js";

import type { MdOutlinedTextField } from "@material/web/textfield/outlined-text-field.js";
import type { MdOutlinedSelect } from "@material/web/select/outlined-select.js";

import {
  hasIdentifyCapability,
  ImprovCurrentState,
  ImprovErrorState,
  State,
  ImprovState,
  hasGetWifiNetworksCapability,
} from "./const";
import {
  ImprovBluetoothDeviceInfo,
  ImprovBluetoothLE,
  ImprovBluetoothWifiNetwork,
} from "./ble";

const ERROR_ICON = "⚠️";
const OK_ICON = "🎉";
const AUTHORIZE_ICON = "👉";
const MATERIAL_SYMBOLS_FONT_ID = "material-symbols-font";
const MATERIAL_SYMBOLS_FONT_URL =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined";

function getWifiIconName(rssi: number): string {
  if (rssi >= -50) return "network_wifi";
  if (rssi >= -60) return "network_wifi_3_bar";
  if (rssi >= -70) return "network_wifi_2_bar";
  return "network_wifi_1_bar";
}

function getSignalStrengthClass(rssi: number): string {
  if (rssi >= -50) return "signal-excellent";
  if (rssi >= -60) return "signal-good";
  if (rssi >= -70) return "signal-fair";
  return "signal-weak";
}

function getSecurityClass(security: string): string {
  switch (security) {
    case "WPA":
      return "security-fair";
    case "WPA2":
    case "WPA2 EAP":
      return "security-good";
    case "WPA3":
    case "WAPI":
      return "security-excellent";
    default:
      return "security-weak";
  }
}

@customElement("improv-wifi-provision-dialog")
class ProvisionDialog extends LitElement {
  public device!: BluetoothDevice;

  public stateUpdateCallback!: (state: ImprovState) => void;

  @state() private _state: State = "CONNECTING";

  @state() private _improvCurrentState?: ImprovCurrentState | undefined;
  @state() private _improvErrorState = ImprovErrorState.NO_ERROR;
  @state() private _improvCapabilities = 0;
  @state() private _improvDeviceInfo?: ImprovBluetoothDeviceInfo | undefined;
  @state() private _improvWifiNetworks: ImprovBluetoothWifiNetwork[] = [];
  @state() private _selectedSsid: string | null = null;
  @state() private _showPassword = false;

  @state() private _busy = false;

  private _error?: string;

  @query("md-outlined-select") private _selectSSID!: MdOutlinedSelect;
  @query("md-outlined-text-field[name=ssid]")
  private _inputSSID!: MdOutlinedTextField;
  @query("md-outlined-text-field[name=password]")
  private _inputPassword!: MdOutlinedTextField;

  private __client?: ImprovBluetoothLE;

  connectedCallback() {
    super.connectedCallback();
    if (!document.getElementById(MATERIAL_SYMBOLS_FONT_ID)) {
      const link = document.createElement("link");
      link.id = MATERIAL_SYMBOLS_FONT_ID;
      link.rel = "stylesheet";
      link.href = MATERIAL_SYMBOLS_FONT_URL;
      document.head.appendChild(link);
    }
  }

  private get _client(): ImprovBluetoothLE {
    if (!this.__client) {
      this.__client = new ImprovBluetoothLE(this.device, console);
    }
    return this.__client;
  }

  protected render() {
    let heading: TemplateResult = html`${this._client.name || ""}`;
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
        "Press the authorize button on the device",
      );
    } else if (this._improvCurrentState === ImprovCurrentState.AUTHORIZED) {
      if (this._busy) {
        content = this._renderProgress("Provisioning");
      } else {
        heading = html`<md-icon>wifi</md-icon>Configure Wi-Fi`;
        content = this._renderImprovAuthorized();
        actions = html`
          ${hasIdentifyCapability(this._improvCapabilities)
            ? html`
                <md-outlined-button
                  @click=${this._identify}
                  slot="start"
                  has-icon
                >
                  <md-icon slot="icon">notifications_active</md-icon>
                  Identify
                </md-outlined-button>
              `
            : ""}
          ${this._renderCloseAction()}
          <md-filled-button @click=${this._provision} slot="end"
            >Connect</md-filled-button
          >
        `;
      }
    } else if (this._improvCurrentState === ImprovCurrentState.PROVISIONING) {
      content = this._renderProgress("Provisioning");
    } else if (this._improvCurrentState === ImprovCurrentState.PROVISIONED) {
      content = this._renderImprovProvisioned();
      actions =
        this._client.nextUrl === undefined
          ? this._renderCloseAction()
          : html`${this._renderCloseAction()}
              <md-filled-button
                href=${this._client.nextUrl}
                form="improv-form"
                slot="end"
                >Next</md-filled-button
              >`;
    } else {
      content = this._renderMessage(
        ERROR_ICON,
        `Unexpected state: ${this._state} - ${this._improvCurrentState}`,
      );
      actions = this._renderCloseAction();
    }

    return html`
      <md-dialog open @close=${this._handleClose}>
        <div slot="headline">${heading}</div>
        <form slot="content" id="improv-form" method="dialog">${content}</form>
        ${actions ? html`<div slot="actions">${actions}</div>` : ""}
      </md-dialog>
    `;
  }

  _renderCloseAction() {
    return html`<md-outlined-button
      form="improv-form"
      @click="${this._handleClose}"
      slot="end"
      >Close</md-outlined-button
    >`;
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

  _renderDeviceInfo(): TemplateResult {
    return this._improvDeviceInfo === undefined
      ? html``
      : html`<div class="device-info">
          <div><md-icon>info</md-icon>Device Info</div>
          <div>Name<span>${this._improvDeviceInfo.deviceName}</span></div>
          <div>Firmware<span>${this._improvDeviceInfo.firmwareName}</span></div>
          <div>
            Version<span>${this._improvDeviceInfo.firmwareVersion}</span>
          </div>
          <div>
            Chip<span>${this._improvDeviceInfo.hardwareChipVariant}</span>
          </div>
        </div>`;
  }

  private _renderWifiSecurity(security: string[]) {
    return html`<md-chip-set
      >${security.map(
        (val) =>
          html`<md-filter-chip
            selected
            label="${val === "NO" ? "Open" : val}"
            class="${getSecurityClass(val)}"
          >
          </md-filter-chip>`,
      )}</md-chip-set
    >`;
  }

  private _renderNetworkName() {
    return html` ${hasGetWifiNetworksCapability(this._improvCapabilities)
      ? html`<div class="network-select">
          <md-outlined-select
            name="ssid_select"
            required
            label="Network"
            @change=${(ev: Event) => {
              const index = (ev.target as MdOutlinedSelect).selectedIndex;
              // The "Join Other" item is always the last item.
              this._selectedSsid =
                index === this._improvWifiNetworks!.length
                  ? null
                  : this._improvWifiNetworks![index].ssid;
            }}
            @closed=${(ev: Event) => ev.stopPropagation()}
          >
            ${this._improvWifiNetworks.map(
              (network, idx) =>
                html`<md-select-option
                  .selected=${this._selectedSsid === network.ssid}
                  value=${idx}
                >
                  <md-icon
                    slot="start"
                    class=${getSignalStrengthClass(network.rssi)}
                    >${getWifiIconName(network.rssi)}</md-icon
                  >
                  <span slot="headline">${network.ssid}</span>
                  <span slot="end" class="network-details">
                    <span class="signal-strength">${network.rssi}dB</span>
                    ${this._renderWifiSecurity(network.security)}
                  </span>
                </md-select-option>`,
            )}
            <md-select-option .selected=${!this._selectedSsid} value="-1">
              Join other…
            </md-select-option>
          </md-outlined-select>
          <md-outlined-icon-button
            data-refresh
            @click=${this._scanWifiNetworks}
            slot="end"
            ><md-icon>refresh</md-icon></md-outlined-icon-button
          >
        </div>`
      : ""}
    ${this._improvWifiNetworks.length === 0 || this._selectedSsid === null
      ? html`<md-outlined-text-field
          required
          label="Network Name"
          name="ssid"
          @input=${(e: InputEvent) => {
            this._selectedSsid = e.data;
          }}
        ></md-outlined-text-field>`
      : ""}`;
  }

  private _togglePasswordVisibility(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this._showPassword = !this._showPassword;
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
      </div>
      ${this._renderDeviceInfo()}
      ${error ? html`<p class="error">${error}</p>` : ""}
      ${this._renderNetworkName()}
      <md-outlined-text-field
        required
        label="Password"
        name="password"
        type=${this._showPassword ? "text" : "password"}
      >
        <md-icon-button
          slot="trailing-icon"
          @click=${this._togglePasswordVisibility}
          toggle
          .selected=${this._showPassword}
        >
          <md-icon
            >${this._showPassword ? "visibility_off" : "visibility"}</md-icon
          >
        </md-icon-button>
      </md-outlined-text-field>
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
      this._improvDeviceInfo = this._client.deviceInfo;
      this._improvWifiNetworks = this._client.wifiNetworks;
      this._selectedSsid = this._improvWifiNetworks.length
        ? this._improvWifiNetworks[0].ssid
        : null;
      this._state = "IMPROV-STATE";
    } catch (err: any) {
      this._state = "ERROR";
      this._error = err.message;
    }
  }

  private async _scanWifiNetworks(event: Event) {
    try {
      event.preventDefault();
      event.stopPropagation();
      await this._client.scanWifiNetworks();
      this._improvWifiNetworks = this._client.wifiNetworks;
    } catch (err: any) {
      this._error = err.message;
    }
  }

  private async _provision(event: Event) {
    if (!this._selectedSsid) {
      this._error = hasGetWifiNetworksCapability(this._improvCapabilities)
        ? "Please select a network."
        : "Please enter a Network Name.";
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    this._error = undefined;
    this._busy = true;
    try {
      await this._client.provision(
        this._selectedSsid,
        this._inputPassword.value,
      );
    } catch (err) {
      // Ignore, error state takes care of this.
    } finally {
      this._busy = false;
    }
  }

  private _identify(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
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

    let toFocus: LitElement | undefined;
    if (changedProps.has("_improvWifiNetworks")) {
      toFocus = this._improvWifiNetworks.length
        ? this._selectSSID
        : this._inputSSID;
    } else if (
      changedProps.has("_selectedSsid") &&
      this._selectedSsid === null
    ) {
      toFocus = this._inputSSID;
    }

    if (toFocus) {
      toFocus.updateComplete.then(() => toFocus!.focus());
    }
  }

  private _handleClose() {
    this._client.close();
    this.parentNode!.removeChild(this);
  }

  static styles = css`
    :host {
      --md-dialog-max-width: 390px;
      --md-dialog-container-max-block-size: none !important;
      --md-sys-color-primary: var(--improv-primary-color, #03a9f4);
      --md-sys-color-on-primary: var(--improv-on-primary-color, #fff);
    }

    md-dialog {
      --md-dialog-container-max-block-size: none !important;
      max-height: 90vh !important;
    }

    md-dialog [slot="content"],
    form[slot="content"] {
      overflow: visible !important;
      max-height: none !important;
    }

    md-outlined-text-field,
    md-outlined-select {
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
    }

    .device-info {
      margin-top: 16px;
      padding: 16px;
      background-color: #d6d6d6;
      border-radius: 8px;
      border: 1px solid #676767;
    }

    .device-info > div {
      display: flex;
      color: #5f6368;
      justify-content: space-between;
    }

    .device-info > div:first-child {
      justify-content: flex-start;
      align-items: center;
      gap: 8px;
    }

    .device-info > div > span {
      color: #1f1f1f;
    }

    md-select-option[value="-1"] {
      border-top: 1px solid #ccc;
    }
    md-outlined-select[name="ssid_select"] {
      width: 100%;
    }

    .network-select {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      margin-top: 16px;
    }

    .network-select md-outlined-icon-button {
      margin-bottom: 8px;
    }

    .network-details {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #5f6368;
      font-size: 0.85em;
    }

    .signal-strength {
      min-width: 45px;
      text-align: right;
    }

    .lock-icon {
      font-size: 18px;
    }

    .lock-secured {
      color: #34a853;
    }

    .lock-unsecured {
      color: #ea4335;
    }

    .signal-excellent {
      color: #34a853;
    }

    .signal-good {
      color: #4285f4;
    }

    .signal-fair {
      color: #fbbc04;
    }

    .signal-weak {
      color: #ea4335;
    }

    .security-excellent {
      --md-filter-chip-icon-size: 0px;
      --md-filter-chip-label-text-color: #1b592b;
      --md-filter-chip-selected-container-color: #34a853;
    }

    .security-good {
      --md-filter-chip-icon-size: 0px;
      --md-filter-chip-label-text-color: #204075;
      --md-filter-chip-selected-container-color: #4285f4;
    }

    .security-fair {
      --md-filter-chip-icon-size: 0px;
      --md-filter-chip-label-text-color: #977101;
      --md-filter-chip-selected-container-color: #fbbc04;
    }

    .security-weak {
      --md-filter-chip-icon-size: 0px;
      --md-filter-chip-label-text-color: #b5352a;
      --md-filter-chip-selected-container-color: #ea4335;
    }

    [slot="actions"] {
      display: flex;
      width: 100%;
    }

    [slot="actions"] > [slot="start"] {
      margin-right: auto;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "improv-wifi-provision-dialog": ProvisionDialog;
  }
}
