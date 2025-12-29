import {
  LitElement,
  html,
  PropertyValues,
  css,
  TemplateResult,
  nothing,
  svg,
} from "lit";
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
const refreshIcon = svg`
  <svg viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z"
    />
  </svg>
`;
const infoIcon = svg`
  <svg viewBox="0 -960 960 960" width="24px">
      <path 
        fill="currentColor"
        d="M440-280h80v-240h-80v240Zm40-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm0 520q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"
      />
  </svg>
`;
const wifiIcon = svg`
  <svg viewBox="0 -960 960 960">
    <path 
      fill="currentColor"
      d="M480-120q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29ZM254-346l-84-86q59-59 138.5-93.5T480-560q92 0 171.5 35T790-430l-84 84q-44-44-102-69t-124-25q-66 0-124 25t-102 69ZM84-516 0-600q92-94 215-147t265-53q142 0 265 53t215 147l-84 84q-77-77-178.5-120.5T480-680q-116 0-217.5 43.5T84-516Z"
    />
  </svg>
`;
const networkWifiFull = svg`
  <svg viewBox="0 -960 960 960" width="24px">
    <path 
      fill="currentColor"
      d="M480-120 0-600q95-97 219.5-148.5T480-800q137 0 261 51t219 149L480-120ZM174-540q67-48 145-74t161-26q83 0 161 26t145 74l58-58q-79-60-172-91t-192-31q-99 0-192 31t-172 91l58 58Z"
    />
  </svg>
`;
const networkWifi3Bar = svg`
  <svg viewBox="0 -960 960 960" width="24px">
    <path 
      fill="currentColor"
      d="M480-120 0-600q96-98 220-149t260-51q137 0 261 51t219 149L480-120ZM232-482q53-38 116-59.5T480-563q69 0 132 21.5T728-482l116-116q-78-59-170.5-90.5T480-720q-101 0-193.5 31.5T116-598l116 116Z"
    />
  </svg>
`;
const networkWifi2Bar = svg`
  <svg viewBox="0 -960 960 960" width="24px">
    <path 
      fill="currentColor"
      d="M480-120 0-600q96-98 220-149t260-51q137 0 261 51t219 149L480-120ZM299-415q38-28 84-43.5t97-15.5q51 0 97 15.5t84 43.5l183-183q-78-59-170.5-90.5T480-720q-101 0-193.5 31.5T116-598l183 183Z"    
    />
  </svg>
`;
const networkWifi1Bar = svg`
    <svg viewBox="0 -960 960 960" width="24px">
      <path
        fill="currentColor" 
        d="M480-120 0-600q96-98 220-149t260-51q137 0 261 51t219 149L480-120ZM361-353q25-18 55.5-28t63.5-10q33 0 63.5 10t55.5 28l245-245q-78-59-170.5-90.5T480-720q-101 0-193.5 31.5T116-598l245 245Z"
      />
    </svg>
`;
const visibilityIcon = svg`
  <svg viewBox="0 -960 960 960">
    <path 
        fill="currentColor" 
        d="M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-72q-45 0-76.5-31.5T372-500q0-45 31.5-76.5T480-608q45 0 76.5 31.5T588-500q0 45-31.5 76.5T480-392Zm0 192q-146 0-266-81.5T40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200Zm0-300Zm0 220q113 0 207.5-59.5T832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280Z"
    />
  </svg>
`;
const visibilityOffIcon = svg`
  <svg viewBox="0 -960 960 960">
    <path
      fill="currentColor" 
      d="m644-428-58-58q9-47-27-88t-93-32l-58-58q17-8 34.5-12t37.5-4q75 0 127.5 52.5T660-500q0 20-4 37.5T644-428Zm128 126-58-56q38-29 67.5-63.5T832-500q-50-101-143.5-160.5T480-720q-29 0-57 4t-55 12l-62-62q41-17 84-25.5t90-8.5q151 0 269 83.5T920-500q-23 59-60.5 109.5T772-302Zm20 246L624-222q-35 11-70.5 16.5T480-200q-151 0-269-83.5T40-500q21-53 53-98.5t73-81.5L56-792l56-56 736 736-56 56ZM222-624q-29 26-53 57t-41 67q50 101 143.5 160.5T480-280q20 0 39-2.5t39-5.5l-36-38q-11 3-21 4.5t-21 1.5q-75 0-127.5-52.5T300-500q0-11 1.5-21t4.5-21l-84-82Zm319 93Zm-151 75Z"
    />
  </svg>
`;
const notificationsActiveIcon = svg`
    <svg viewBox="0 -960 960 960" width="24px">
      <path 
        fill="currentColor" 
        d="M80-560q0-100 44.5-183.5T244-882l47 64q-60 44-95.5 111T160-560H80Zm720 0q0-80-35.5-147T669-818l47-64q75 55 119.5 138.5T880-560h-80ZM160-200v-80h80v-280q0-83 50-147.5T420-792v-28q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-820v28q80 20 130 84.5T720-560v280h80v80H160Zm320-300Zm0 420q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80ZM320-280h320v-280q0-66-47-113t-113-47q-66 0-113 47t-47 113v280Z"
      />
    </svg>
`;
function getWifiIcon(rssi: number): TemplateResult {
  if (rssi >= -50) return networkWifiFull;
  if (rssi >= -60) return networkWifi3Bar;
  if (rssi >= -70) return networkWifi2Bar;
  return networkWifi1Bar;
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

  @query("md-outlined-select") private _selectSSID?: MdOutlinedSelect;
  @query("md-outlined-text-field[name=ssid]")
  private _inputSSID?: MdOutlinedTextField;
  @query("md-outlined-text-field[name=password]")
  private _inputPassword!: MdOutlinedTextField;

  private __client?: ImprovBluetoothLE;

  private get _client(): ImprovBluetoothLE {
    if (!this.__client) {
      this.__client = new ImprovBluetoothLE(this.device, console);
    }
    return this.__client;
  }

  protected render() {
    let heading: TemplateResult = html`${this._client.name || nothing}`;
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
        heading = html`<md-icon>${wifiIcon}</md-icon>Configure Wi-Fi`;
        content = this._renderImprovAuthorized();
        actions = html`
          ${hasIdentifyCapability(this._improvCapabilities)
            ? html`
                <md-outlined-button
                  @click=${this._identify}
                  slot="start"
                  has-icon
                >
                  <md-icon slot="icon">${notificationsActiveIcon}</md-icon
                  >Identify
                </md-outlined-button>
              `
            : nothing}
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
        ${actions ? html`<div slot="actions">${actions}</div>` : nothing}
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
          <div>${infoIcon} Device Info</div>
          <div>Name<span>${this._improvDeviceInfo.deviceName}</span></div>
          <div>Firmware<span>${this._improvDeviceInfo.firmwareName}</span></div>
          <div>
            Version<span>${this._improvDeviceInfo.firmwareVersion}</span>
          </div>
          <div>
            Chip<span>${this._improvDeviceInfo.hardwareChipVariant}</span>
          </div>
          ${this._improvDeviceInfo.osName
            ? html`<div>OS<span>${this._improvDeviceInfo.osName}</span></div>`
            : nothing}
          ${this._improvDeviceInfo.osVersion
            ? html`<div>
                OS Version<span>${this._improvDeviceInfo.osVersion}</span>
              </div>`
            : nothing}
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
                  <span
                    slot="start"
                    class=${getSignalStrengthClass(network.rssi)}
                    >${getWifiIcon(network.rssi)}</span
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
            >${refreshIcon}</md-outlined-icon-button
          >
        </div>`
      : nothing}
    ${this._improvWifiNetworks.length === 0 || this._selectedSsid === null
      ? html`<md-outlined-text-field
          required
          label="Network Name"
          name="ssid"
          @input=${(e: InputEvent) =>
            (this._selectedSsid = (e.target as MdOutlinedTextField).value)}
        ></md-outlined-text-field>`
      : nothing}`;
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
      ${this._renderDeviceInfo()}
      <div>
        Enter the credentials of the Wi-Fi network that you want
        ${this._client.name || "your device"} to connect to.
      </div>
      ${error ? html`<p class="error">${error}</p>` : nothing}
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
          ${this._showPassword ? visibilityOffIcon : visibilityIcon}
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
      input?.updateComplete.then(() => input.focus());
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
      margin-bottom: 16px;
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
