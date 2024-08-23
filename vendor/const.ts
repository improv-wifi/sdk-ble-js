export interface Logger {
  log(msg: string, ...args: any[]): void;
  error(msg: string, ...args: any[]): void;
  debug(msg: string, ...args: any[]): void;
}

export const IMPROV_BLE_SERVICE = "00467768-6228-2272-4663-277478268000";
export const IMPROV_BLE_CURRENT_STATE_CHARACTERISTIC =
  "00467768-6228-2272-4663-277478268001";
export const IMPROV_BLE_ERROR_STATE_CHARACTERISTIC =
  "00467768-6228-2272-4663-277478268002";
export const IMPROV_BLE_RPC_COMMAND_CHARACTERISTIC =
  "00467768-6228-2272-4663-277478268003";
// <command ID><total length><length of string 1><string 1>[<string 2 length≥, <string 2>]<CS>
export const IMPROV_BLE_RPC_RESULT_CHARACTERISTIC =
  "00467768-6228-2272-4663-277478268004";
export const IMPROV_BLE_CAPABILITIES_CHARACTERISTIC =
  "00467768-6228-2272-4663-277478268005";

export type State = "CONNECTING" | "IMPROV-STATE" | "ERROR";

export interface ImprovState {
  state:
    | Omit<State, "IMPROV-STATE">
    | keyof typeof ImprovCurrentState
    | "UNKNOWN";
}

export enum ImprovCurrentState {
  AUTHORIZATION_REQUIRED = 0x01,
  AUTHORIZED = 0x02,
  PROVISIONING = 0x03,
  PROVISIONED = 0x04,
}

export const enum ImprovErrorState {
  NO_ERROR = 0x00,
  INVALID_RPC_PACKET = 0x01,
  UNKNOWN_RPC_COMMAND = 0x02,
  UNABLE_TO_CONNECT = 0x03,
  NOT_AUTHORIZED = 0x04,
  UNKNOWN_ERROR = 0xff,
}

export const enum ImprovRPCCommand {
  SEND_WIFI_SETTINGS = 0x01,
  IDENTIFY = 0x02,
}

export interface ImprovRPCResult {
  command: ImprovRPCCommand;
  values: string[];
}

export const hasIdentifyCapability = (capabilities: number) =>
  (capabilities & 1) === 1;

declare global {
  interface HTMLElementEventMap {
    "state-changed": CustomEvent<ImprovState>;
  }
}
