import {
  ImprovCurrentState,
  ImprovErrorState,
  ImprovRPCCommand,
  IMPROV_BLE_CURRENT_STATE_CHARACTERISTIC,
  IMPROV_BLE_ERROR_STATE_CHARACTERISTIC,
  IMPROV_BLE_RPC_COMMAND_CHARACTERISTIC,
  IMPROV_BLE_RPC_RESULT_CHARACTERISTIC,
  IMPROV_BLE_SERVICE,
  ImprovRPCResult,
  IMPROV_BLE_CAPABILITIES_CHARACTERISTIC,
  Logger,
} from "./const";

export class ImprovBluetoothLE extends EventTarget {
  public currentState?: ImprovCurrentState | undefined;
  public errorState = ImprovErrorState.NO_ERROR;
  public RPCResult?: ImprovRPCResult;
  public capabilities = 0;
  public nextUrl: string | undefined;

  private _currentStateChar?: BluetoothRemoteGATTCharacteristic;
  private _errorStateChar?: BluetoothRemoteGATTCharacteristic;
  private _rpcCommandChar?: BluetoothRemoteGATTCharacteristic;
  private _rpcResultChar?: BluetoothRemoteGATTCharacteristic;
  private _rpcFeedback?: {
    command: ImprovRPCCommand;
    resolve: (value: ImprovRPCResult) => void;
    reject: (err: ImprovErrorState) => void;
  };

  constructor(public device: BluetoothDevice, public logger: Logger) {
    super();
  }

  public get name() {
    return this.device.name;
  }

  public async initialize() {
    this.logger.log("Trying to connect to Improv BLE service");
    this.device.addEventListener("gattserverdisconnected", () => {
      // If we're provisioned, we expect to be disconnected.
      if (this.currentState === ImprovCurrentState.PROVISIONED) {
        return;
      }
      this.dispatchEvent(new CustomEvent("disconnect"));
    });
    // Do everything in sequence as some OSes do not support parallel GATT commands
    // https://github.com/WebBluetoothCG/web-bluetooth/issues/188#issuecomment-255121220

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
        IMPROV_BLE_CAPABILITIES_CHARACTERISTIC
      );
      const capabilitiesValue = await capabilitiesChar.readValue();
      this.capabilities = capabilitiesValue.getUint8(0);
    } catch (err) {
      console.warn(
        "Firmware not according to spec, missing capability support."
      );
    }

    this._currentStateChar.addEventListener(
      "characteristicvaluechanged",
      (ev: any) => this._handleImprovCurrentStateChange(ev.target.value)
    );
    await this._currentStateChar.startNotifications();

    this._errorStateChar.addEventListener(
      "characteristicvaluechanged",
      (ev: any) => this._handleImprovErrorStateChange(ev.target.value)
    );
    await this._errorStateChar.startNotifications();

    this._rpcResultChar.addEventListener(
      "characteristicvaluechanged",
      (ev: any) => this._handleImprovRPCResultChange(ev.target.value)
    );
    await this._rpcResultChar.startNotifications();

    const curState = await this._currentStateChar.readValue();
    const errorState = await this._errorStateChar.readValue();

    this._handleImprovCurrentStateChange(curState);
    this._handleImprovErrorStateChange(errorState);
  }

  public close() {
    if (this.device.gatt!.connected) {
      this.logger.debug("Disconnecting gatt");
      this.device.gatt!.disconnect();
    }
  }

  public identify() {
    this.sendRPC(ImprovRPCCommand.IDENTIFY, new Uint8Array());
  }

  public async provision(
    ssid: string,
    password: string
  ): Promise<string | undefined> {
    const encoder = new TextEncoder();
    const ssidEncoded = encoder.encode(ssid);
    const pwEncoded = encoder.encode(password);
    const data = new Uint8Array([
      ssidEncoded.length,
      ...ssidEncoded,
      pwEncoded.length,
      ...pwEncoded,
    ]);
    try {
      const rpcResult = await this.sendRPCWithResponse(
        ImprovRPCCommand.SEND_WIFI_SETTINGS,
        data
      );
      this.logger.debug("Provisioned! Disconnecting gatt");
      // We're going to set this result manually in case we get RPC result first
      // that way it's safe to disconnect.
      this.currentState = ImprovCurrentState.PROVISIONED;
      this.dispatchEvent(new CustomEvent("state-changed"));
      this.device.gatt!.disconnect();
      this.dispatchEvent(new CustomEvent("disconnect"));
      this.nextUrl =
        rpcResult.values.length > 0 ? rpcResult.values[0] : undefined;
      return this.nextUrl;
    } catch (err) {
      // Do nothing. Error code will handle itself.
      return undefined;
    }
  }

  public async sendRPCWithResponse(
    command: ImprovRPCCommand,
    data: Uint8Array
  ) {
    // Commands that receive feedback will finish when either
    // the state changes or the error code becomes not 0.
    if (this._rpcFeedback) {
      throw new Error(
        "Only 1 RPC command that requires feedback can be active"
      );
    }

    return await new Promise<ImprovRPCResult>((resolve, reject) => {
      this._rpcFeedback = { command, resolve, reject };
      this.sendRPC(command, data);
    });
  }

  public sendRPC(command: ImprovRPCCommand, data: Uint8Array) {
    this.logger.debug("RPC COMMAND", command, data);
    const payload = new Uint8Array([command, data.length, ...data, 0]);
    payload[payload.length - 1] = payload.reduce((sum, cur) => sum + cur, 0);
    this.RPCResult = undefined;
    this._rpcCommandChar!.writeValueWithoutResponse(payload);
  }

  private _handleImprovCurrentStateChange(encodedState: DataView) {
    const state = encodedState.getUint8(0) as ImprovCurrentState;
    this.logger.debug("improv current state", state);
    this.currentState = state;
    this.dispatchEvent(new CustomEvent("state-change"));
  }

  private _handleImprovErrorStateChange(encodedState: DataView) {
    const state = encodedState.getUint8(0) as ImprovErrorState;
    this.logger.debug("improv error state", state);
    this.errorState = state;
    // Sending an RPC command sets error to no error.
    // If we get a real error it means the RPC command is done.
    if (state !== ImprovErrorState.NO_ERROR) {
      if (this._rpcFeedback) {
        this._rpcFeedback.reject(state);
        this._rpcFeedback = undefined;
      }
    }
  }

  private _handleImprovRPCResultChange(encodedResult: DataView) {
    this.logger.debug("improv RPC result", encodedResult);

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
      start += valueLength + 1; // +1 for length byte
    }

    this.RPCResult = result;

    if (this._rpcFeedback) {
      if (this._rpcFeedback.command !== command) {
        this.logger.error("Received ");
      }
      this._rpcFeedback.resolve(result);
      this._rpcFeedback = undefined;
    }
  }
}
