import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ImprovBluetoothDeviceInfo,
  ImprovBluetoothLE,
  ImprovBluetoothWifiNetwork,
} from "../src/ble";
import {
  IMPROV_BLE_CAPABILITIES_CHARACTERISTIC,
  IMPROV_BLE_CURRENT_STATE_CHARACTERISTIC,
  IMPROV_BLE_ERROR_STATE_CHARACTERISTIC,
  IMPROV_BLE_RPC_COMMAND_CHARACTERISTIC,
  IMPROV_BLE_RPC_RESULT_CHARACTERISTIC,
  IMPROV_BLE_SERVICE,
  ImprovCurrentState,
  ImprovErrorState,
  ImprovRPCCommand,
} from "../src/const";

const encoder = new TextEncoder();

const view = (bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);

/** Encode an RPC result the way a device would send it on the result characteristic. */
const encodeResult = (command: number, values: string[]): number[] => {
  const body: number[] = [];
  for (const value of values) {
    const bytes = encoder.encode(value);
    body.push(bytes.length, ...bytes);
  }
  return [command, body.length, ...body, 0];
};

class FakeCharacteristic extends EventTarget {
  value: DataView;
  written: Uint8Array[] = [];
  onWrite?: (payload: Uint8Array) => void;
  startNotifications = vi.fn(async () => this);
  readValue = vi.fn(async () => this.value);
  writeValue = vi.fn(async (data: BufferSource) => {
    const payload = new Uint8Array(data as ArrayBuffer);
    this.written.push(payload);
    this.onWrite?.(payload);
  });

  constructor(initial: number[] = [0]) {
    super();
    this.value = view(initial);
  }

  /** Update the value and notify, like a GATT notification. */
  notify(bytes: number[]): void {
    this.value = view(bytes);
    this.dispatchEvent(new Event("characteristicvaluechanged"));
  }
}

interface Rig {
  device: BluetoothDevice;
  gatt: {
    connected: boolean;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    getPrimaryService: ReturnType<typeof vi.fn>;
  };
  service: { getCharacteristic: ReturnType<typeof vi.fn> };
  currentState: FakeCharacteristic;
  errorState: FakeCharacteristic;
  rpcCommand: FakeCharacteristic;
  rpcResult: FakeCharacteristic;
  capabilities: FakeCharacteristic | undefined;
  device_: EventTarget & { name?: string };
}

const makeRig = ({
  capabilities,
  initialState = ImprovCurrentState.AUTHORIZED,
  initialError = ImprovErrorState.NO_ERROR,
  name = "Improv Device",
}: {
  /** undefined means the capabilities characteristic is missing. */
  capabilities?: number;
  initialState?: number;
  initialError?: number;
  name?: string;
} = {}): Rig => {
  const currentState = new FakeCharacteristic([initialState]);
  const errorState = new FakeCharacteristic([initialError]);
  const rpcCommand = new FakeCharacteristic();
  const rpcResult = new FakeCharacteristic();
  const capsChar =
    capabilities === undefined
      ? undefined
      : new FakeCharacteristic([capabilities]);

  const chars: Record<string, FakeCharacteristic | undefined> = {
    [IMPROV_BLE_CURRENT_STATE_CHARACTERISTIC]: currentState,
    [IMPROV_BLE_ERROR_STATE_CHARACTERISTIC]: errorState,
    [IMPROV_BLE_RPC_COMMAND_CHARACTERISTIC]: rpcCommand,
    [IMPROV_BLE_RPC_RESULT_CHARACTERISTIC]: rpcResult,
    [IMPROV_BLE_CAPABILITIES_CHARACTERISTIC]: capsChar,
  };

  const service = {
    getCharacteristic: vi.fn(async (uuid: string) => {
      const char = chars[uuid];
      if (!char) {
        throw new Error(`No characteristic ${uuid}`);
      }
      return char;
    }),
  };

  const gatt = {
    connected: false,
    connect: vi.fn(async () => {
      gatt.connected = true;
      return gatt;
    }),
    disconnect: vi.fn(() => {
      gatt.connected = false;
    }),
    getPrimaryService: vi.fn(async () => service),
  };

  const device_ = Object.assign(new EventTarget(), { name, gatt });

  return {
    device: device_ as unknown as BluetoothDevice,
    gatt,
    service,
    currentState,
    errorState,
    rpcCommand,
    rpcResult,
    capabilities: capsChar,
    device_,
  };
};

const makeLogger = () => ({ log: vi.fn(), error: vi.fn(), debug: vi.fn() });

const setup = (opts: Parameters<typeof makeRig>[0] = {}) => {
  const rig = makeRig(opts);
  const logger = makeLogger();
  const improv = new ImprovBluetoothLE(rig.device, logger);
  return { rig, logger, improv };
};

/** Make the fake device answer RPC commands. */
const answer = (
  rig: Rig,
  handler: (command: number, data: Uint8Array) => void,
): void => {
  rig.rpcCommand.onWrite = (payload) => {
    handler(payload[0], payload.slice(2, 2 + payload[1]));
  };
};

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("data classes", () => {
  it("ImprovBluetoothDeviceInfo stores its fields", () => {
    const info = new ImprovBluetoothDeviceInfo(
      "fw",
      "1.0",
      "ESP32",
      "dev",
      "os",
      "2",
    );
    expect(info).toMatchObject({
      firmwareName: "fw",
      firmwareVersion: "1.0",
      hardwareChipVariant: "ESP32",
      deviceName: "dev",
      osName: "os",
      osVersion: "2",
    });
  });

  it("ImprovBluetoothWifiNetwork stores its fields", () => {
    const net = new ImprovBluetoothWifiNetwork("ssid", -40, ["WPA"]);
    expect(net).toMatchObject({ ssid: "ssid", rssi: -40, security: ["WPA"] });
  });
});

describe("ImprovBluetoothLE basics", () => {
  it("exposes the device name", () => {
    const { improv } = setup({ name: "My Improv" });
    expect(improv.name).toBe("My Improv");
  });

  it("starts with sane defaults", () => {
    const { improv } = setup();
    expect(improv.currentState).toBeUndefined();
    expect(improv.errorState).toBe(ImprovErrorState.NO_ERROR);
    expect(improv.capabilities).toBe(0);
    expect(improv.wifiNetworks).toEqual([]);
    expect(improv.deviceInfo).toBeUndefined();
    expect(improv.nextUrl).toBeUndefined();
  });
});

describe("initialize", () => {
  it("connects, walks the GATT service and reads initial state", async () => {
    const { rig, logger, improv } = setup({
      capabilities: 1,
      initialState: ImprovCurrentState.AUTHORIZATION_REQUIRED,
      initialError: ImprovErrorState.NOT_AUTHORIZED,
    });
    const onState = vi.fn();
    improv.addEventListener("state-changed", onState);

    await improv.initialize();

    expect(logger.log).toHaveBeenCalledWith(
      "Trying to connect to Improv BLE service",
    );
    expect(rig.gatt.connect).toHaveBeenCalledOnce();
    expect(rig.gatt.getPrimaryService).toHaveBeenCalledWith(IMPROV_BLE_SERVICE);
    expect(rig.service.getCharacteristic.mock.calls.map((c) => c[0])).toEqual([
      IMPROV_BLE_CURRENT_STATE_CHARACTERISTIC,
      IMPROV_BLE_ERROR_STATE_CHARACTERISTIC,
      IMPROV_BLE_RPC_COMMAND_CHARACTERISTIC,
      IMPROV_BLE_RPC_RESULT_CHARACTERISTIC,
      IMPROV_BLE_CAPABILITIES_CHARACTERISTIC,
    ]);
    expect(improv.capabilities).toBe(1);
    expect(rig.currentState.startNotifications).toHaveBeenCalledOnce();
    expect(rig.errorState.startNotifications).toHaveBeenCalledOnce();
    expect(rig.rpcResult.startNotifications).toHaveBeenCalledOnce();
    expect(improv.currentState).toBe(ImprovCurrentState.AUTHORIZATION_REQUIRED);
    expect(improv.errorState).toBe(ImprovErrorState.NOT_AUTHORIZED);
    expect(onState).toHaveBeenCalledOnce();
    // Neither device info nor wifi scan capability: no RPC sent.
    expect(rig.rpcCommand.written).toEqual([]);
    expect(improv.deviceInfo).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns and keeps capabilities at 0 when the characteristic is missing", async () => {
    const { rig, improv } = setup({ capabilities: undefined });

    await improv.initialize();

    expect(warn).toHaveBeenCalledWith(
      "Firmware not according to spec, missing capability support.",
    );
    expect(improv.capabilities).toBe(0);
    expect(rig.rpcCommand.written).toEqual([]);
    expect(improv.currentState).toBe(ImprovCurrentState.AUTHORIZED);
  });

  it("reacts to state notifications after initialize", async () => {
    const { rig, improv } = setup({ capabilities: 0 });
    await improv.initialize();
    const onState = vi.fn();
    improv.addEventListener("state-changed", onState);

    rig.currentState.notify([ImprovCurrentState.PROVISIONING]);

    expect(improv.currentState).toBe(ImprovCurrentState.PROVISIONING);
    expect(onState).toHaveBeenCalledOnce();

    rig.errorState.notify([ImprovErrorState.UNABLE_TO_CONNECT]);
    expect(improv.errorState).toBe(ImprovErrorState.UNABLE_TO_CONNECT);
  });

  it("fetches device info with 6 values", async () => {
    const { rig, improv } = setup({ capabilities: 2 });
    answer(rig, (command) => {
      expect(command).toBe(ImprovRPCCommand.GET_DEVICE_INFO);
      rig.rpcResult.notify(
        encodeResult(command, [
          "fw",
          "1.2.3",
          "ESP32-C3",
          "Lamp",
          "ESPHome",
          "2026.1",
        ]),
      );
    });

    await improv.initialize();

    expect(improv.deviceInfo).toEqual(
      new ImprovBluetoothDeviceInfo(
        "fw",
        "1.2.3",
        "ESP32-C3",
        "Lamp",
        "ESPHome",
        "2026.1",
      ),
    );
    expect(improv.wifiNetworks).toEqual([]);
    expect(rig.rpcCommand.written).toHaveLength(1);
  });

  it("fetches device info with 5 values (no OS version)", async () => {
    const { rig, improv } = setup({ capabilities: 2 });
    answer(rig, (command) =>
      rig.rpcResult.notify(
        encodeResult(command, ["fw", "1", "chip", "name", "ESPHome"]),
      ),
    );

    await improv.initialize();

    expect(improv.deviceInfo?.osName).toBe("ESPHome");
    expect(improv.deviceInfo?.osVersion).toBeNull();
  });

  it("fetches device info with 4 values (no OS)", async () => {
    const { rig, improv } = setup({ capabilities: 2 });
    answer(rig, (command) =>
      rig.rpcResult.notify(encodeResult(command, ["fw", "1", "chip", "name"])),
    );

    await improv.initialize();

    expect(improv.deviceInfo).toEqual(
      new ImprovBluetoothDeviceInfo("fw", "1", "chip", "name", null, null),
    );
  });

  it("warns and carries on when device info fails", async () => {
    const { rig, improv } = setup({ capabilities: 2 });
    answer(rig, () =>
      rig.errorState.notify([ImprovErrorState.UNKNOWN_RPC_COMMAND]),
    );

    await improv.initialize();

    expect(improv.deviceInfo).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      "Failed to get device info, ignoring.",
      ImprovErrorState.UNKNOWN_RPC_COMMAND,
    );
  });

  it("scans wifi networks when supported", async () => {
    const { rig, improv } = setup({ capabilities: 4 });
    answer(rig, (command) => {
      expect(command).toBe(ImprovRPCCommand.GET_WIFI_NETWORKS);
      rig.rpcResult.notify(
        encodeResult(command, [
          "Home",
          "-50",
          "WPA/WPA2",
          "Guest",
          "-70",
          "NO",
        ]),
      );
    });

    await improv.initialize();

    expect(improv.wifiNetworks).toEqual([
      new ImprovBluetoothWifiNetwork("Home", -50, ["WPA", "WPA2"]),
      new ImprovBluetoothWifiNetwork("Guest", -70, ["NO"]),
    ]);
    expect(improv.deviceInfo).toBeUndefined();
  });

  it("does device info first, then wifi scan, when both are supported", async () => {
    const { rig, improv } = setup({ capabilities: 1 | 2 | 4 });
    answer(rig, (command) => {
      if (command === ImprovRPCCommand.GET_DEVICE_INFO) {
        rig.rpcResult.notify(encodeResult(command, ["fw", "1", "chip", "n"]));
      } else {
        rig.rpcResult.notify(encodeResult(command, ["Net", "-1", "WEP"]));
      }
    });

    await improv.initialize();

    expect(rig.rpcCommand.written.map((p) => p[0])).toEqual([
      ImprovRPCCommand.GET_DEVICE_INFO,
      ImprovRPCCommand.GET_WIFI_NETWORKS,
    ]);
    expect(improv.deviceInfo?.firmwareName).toBe("fw");
    expect(improv.wifiNetworks).toHaveLength(1);
  });

  it("warns and carries on when the wifi scan fails", async () => {
    const { rig, improv } = setup({ capabilities: 4 });
    answer(rig, () => rig.errorState.notify([ImprovErrorState.UNKNOWN_ERROR]));

    await improv.initialize();

    expect(improv.wifiNetworks).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      "Failed to get wifi networks, ignoring.",
      ImprovErrorState.UNKNOWN_ERROR,
    );
  });
});

describe("gattserverdisconnected", () => {
  it("fires disconnect when not provisioned", async () => {
    const { rig, improv } = setup({ capabilities: 0 });
    await improv.initialize();
    const onDisconnect = vi.fn();
    improv.addEventListener("disconnect", onDisconnect);

    rig.device_.dispatchEvent(new Event("gattserverdisconnected"));

    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it("is silent when the device is provisioned", async () => {
    const { rig, improv } = setup({
      capabilities: 0,
      initialState: ImprovCurrentState.PROVISIONED,
    });
    await improv.initialize();
    const onDisconnect = vi.fn();
    improv.addEventListener("disconnect", onDisconnect);

    rig.device_.dispatchEvent(new Event("gattserverdisconnected"));

    expect(onDisconnect).not.toHaveBeenCalled();
  });
});

describe("close", () => {
  it("disconnects a connected gatt server", async () => {
    const { rig, logger, improv } = setup({ capabilities: 0 });
    await improv.initialize();
    expect(rig.gatt.connected).toBe(true);

    improv.close();

    expect(logger.debug).toHaveBeenCalledWith("Disconnecting gatt");
    expect(rig.gatt.disconnect).toHaveBeenCalledOnce();
  });

  it("does nothing when already disconnected", () => {
    const { rig, logger, improv } = setup();

    improv.close();

    expect(rig.gatt.disconnect).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
  });
});

describe("scanWifiNetworks", () => {
  it("throws without the capability and sends nothing", async () => {
    const { rig, improv } = setup({ capabilities: 1 });
    await improv.initialize();

    await expect(improv.scanWifiNetworks()).rejects.toThrow(
      "Device does not support scanning wifi networks",
    );
    expect(rig.rpcCommand.written).toEqual([]);
  });

  it("replaces the network list on each scan", async () => {
    const { rig, improv } = setup({ capabilities: 4 });
    let round = 0;
    answer(rig, (command) => {
      round++;
      rig.rpcResult.notify(
        encodeResult(
          command,
          round === 1
            ? ["A", "-10", "WPA", "B", "-20", "WEP"]
            : ["C", "-30", "NO"],
        ),
      );
    });
    await improv.initialize();
    expect(improv.wifiNetworks.map((n) => n.ssid)).toEqual(["A", "B"]);

    await improv.scanWifiNetworks();

    expect(improv.wifiNetworks).toEqual([
      new ImprovBluetoothWifiNetwork("C", -30, ["NO"]),
    ]);
  });

  it("ends up with an empty list when the device sees no networks", async () => {
    const { rig, improv } = setup({ capabilities: 4 });
    answer(rig, (command) => rig.rpcResult.notify(encodeResult(command, [])));

    await improv.initialize();

    expect(improv.wifiNetworks).toEqual([]);
  });
});

describe("identify and sendRPC", () => {
  it("sends the IDENTIFY command with a checksum", async () => {
    const { rig, logger, improv } = setup({ capabilities: 1 });
    await improv.initialize();

    await improv.identify();

    expect(rig.rpcCommand.written).toEqual([
      new Uint8Array([ImprovRPCCommand.IDENTIFY, 0, ImprovRPCCommand.IDENTIFY]),
    ]);
    expect(logger.debug).toHaveBeenCalledWith(
      "RPC COMMAND",
      ImprovRPCCommand.IDENTIFY,
      new Uint8Array(),
    );
  });

  it("builds command, length, data and checksum bytes", async () => {
    const { rig, improv } = setup({ capabilities: 0 });
    await improv.initialize();

    await improv.sendRPC(
      ImprovRPCCommand.SEND_WIFI_SETTINGS,
      new Uint8Array([1, 2, 3]),
    );

    expect(rig.rpcCommand.written[0]).toEqual(
      new Uint8Array([0x01, 3, 1, 2, 3, (0x01 + 3 + 1 + 2 + 3) & 0xff]),
    );
  });

  it("wraps the checksum to a byte", async () => {
    const { rig, improv } = setup({ capabilities: 0 });
    await improv.initialize();
    const data = new Uint8Array(10).fill(0xff);

    await improv.sendRPC(ImprovRPCCommand.GET_WIFI_NETWORKS, data);

    const sent = rig.rpcCommand.written[0];
    const sum = 4 + 10 + 10 * 0xff;
    expect(sent).toHaveLength(13);
    expect(sent[sent.length - 1]).toBe(sum & 0xff);
    expect(sum).toBeGreaterThan(0xff);
  });

  it("clears the previous RPCResult when sending", async () => {
    const { rig, improv } = setup({ capabilities: 0 });
    await improv.initialize();
    rig.rpcResult.notify(encodeResult(ImprovRPCCommand.IDENTIFY, ["x"]));
    expect(improv.RPCResult).toBeDefined();

    await improv.sendRPC(ImprovRPCCommand.IDENTIFY, new Uint8Array());

    expect(improv.RPCResult).toBeUndefined();
  });
});

describe("sendRPCWithResponse", () => {
  it("throws when another feedback RPC is pending", async () => {
    const { rig, improv } = setup({ capabilities: 0 });
    await improv.initialize();

    const first = improv.sendRPCWithResponse(
      ImprovRPCCommand.GET_DEVICE_INFO,
      new Uint8Array(),
    );
    await expect(
      improv.sendRPCWithResponse(
        ImprovRPCCommand.GET_WIFI_NETWORKS,
        new Uint8Array(),
      ),
    ).rejects.toThrow(
      "Only 1 RPC command that requires feedback can be active",
    );
    // Only the first one reached the wire.
    expect(rig.rpcCommand.written).toHaveLength(1);

    rig.rpcResult.notify(encodeResult(ImprovRPCCommand.GET_DEVICE_INFO, ["a"]));
    await expect(first).resolves.toEqual({
      command: ImprovRPCCommand.GET_DEVICE_INFO,
      values: ["a"],
    });

    // Feedback was cleared so a new one may start.
    const next = improv.sendRPCWithResponse(
      ImprovRPCCommand.GET_DEVICE_INFO,
      new Uint8Array(),
    );
    rig.rpcResult.notify(encodeResult(ImprovRPCCommand.GET_DEVICE_INFO, ["b"]));
    await expect(next).resolves.toMatchObject({ values: ["b"] });
  });

  it("rejects the pending RPC with the error state and clears it", async () => {
    const { rig, improv } = setup({ capabilities: 0 });
    await improv.initialize();

    const pending = improv.sendRPCWithResponse(
      ImprovRPCCommand.GET_DEVICE_INFO,
      new Uint8Array(),
    );
    rig.errorState.notify([ImprovErrorState.INVALID_RPC_PACKET]);

    await expect(pending).rejects.toBe(ImprovErrorState.INVALID_RPC_PACKET);
    expect(improv.errorState).toBe(ImprovErrorState.INVALID_RPC_PACKET);

    // A later error with nothing pending is just recorded.
    rig.errorState.notify([ImprovErrorState.UNKNOWN_ERROR]);
    expect(improv.errorState).toBe(ImprovErrorState.UNKNOWN_ERROR);

    // And a new RPC is allowed again.
    const next = improv.sendRPCWithResponse(
      ImprovRPCCommand.GET_DEVICE_INFO,
      new Uint8Array(),
    );
    rig.rpcResult.notify(encodeResult(ImprovRPCCommand.GET_DEVICE_INFO, []));
    await expect(next).resolves.toBeDefined();
  });

  it("does not reject the pending RPC on a NO_ERROR notification", async () => {
    const { rig, improv } = setup({ capabilities: 0 });
    await improv.initialize();
    const pending = improv.sendRPCWithResponse(
      ImprovRPCCommand.GET_DEVICE_INFO,
      new Uint8Array(),
    );

    rig.errorState.notify([ImprovErrorState.NO_ERROR]);
    rig.rpcResult.notify(
      encodeResult(ImprovRPCCommand.GET_DEVICE_INFO, ["ok"]),
    );

    await expect(pending).resolves.toMatchObject({ values: ["ok"] });
  });
});

describe("RPC result parsing", () => {
  it("parses multiple values, including multi-byte UTF-8 and empty strings", async () => {
    const { rig, logger, improv } = setup({ capabilities: 0 });
    await improv.initialize();

    rig.rpcResult.notify(
      encodeResult(ImprovRPCCommand.GET_WIFI_NETWORKS, ["café", "", "third"]),
    );

    expect(improv.RPCResult).toEqual({
      command: ImprovRPCCommand.GET_WIFI_NETWORKS,
      values: ["café", "", "third"],
    });
    expect(logger.debug).toHaveBeenCalledWith(
      "improv RPC result",
      expect.any(DataView),
    );
  });

  it("parses a result without values", async () => {
    const { rig, improv } = setup({ capabilities: 0 });
    await improv.initialize();

    rig.rpcResult.notify([ImprovRPCCommand.IDENTIFY, 0, 0]);

    expect(improv.RPCResult).toEqual({
      command: ImprovRPCCommand.IDENTIFY,
      values: [],
    });
  });

  it("logs an error but still resolves when the command mismatches", async () => {
    const { rig, logger, improv } = setup({ capabilities: 0 });
    await improv.initialize();
    const pending = improv.sendRPCWithResponse(
      ImprovRPCCommand.GET_DEVICE_INFO,
      new Uint8Array(),
    );

    rig.rpcResult.notify(
      encodeResult(ImprovRPCCommand.GET_WIFI_NETWORKS, ["z"]),
    );

    await expect(pending).resolves.toEqual({
      command: ImprovRPCCommand.GET_WIFI_NETWORKS,
      values: ["z"],
    });
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("does not log an error when the command matches", async () => {
    const { rig, logger, improv } = setup({ capabilities: 0 });
    await improv.initialize();
    const pending = improv.sendRPCWithResponse(
      ImprovRPCCommand.GET_DEVICE_INFO,
      new Uint8Array(),
    );

    rig.rpcResult.notify(encodeResult(ImprovRPCCommand.GET_DEVICE_INFO, ["z"]));
    await pending;

    expect(logger.error).not.toHaveBeenCalled();
  });

  it("just records the result when no RPC is waiting", async () => {
    const { rig, logger, improv } = setup({ capabilities: 0 });
    await improv.initialize();

    rig.rpcResult.notify(
      encodeResult(ImprovRPCCommand.SEND_WIFI_SETTINGS, ["http://x"]),
    );

    expect(improv.RPCResult?.values).toEqual(["http://x"]);
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe("provision", () => {
  const credentialsPayload = (ssid: string, password: string): number[] => {
    const s = [...encoder.encode(ssid)];
    const p = [...encoder.encode(password)];
    const body = [s.length, ...s, p.length, ...p];
    const head = [ImprovRPCCommand.SEND_WIFI_SETTINGS, body.length, ...body];
    return [...head, head.reduce((a, b) => a + b, 0) & 0xff];
  };

  it("sends encoded credentials and returns the next URL", async () => {
    const { rig, logger, improv } = setup({ capabilities: 0 });
    await improv.initialize();
    answer(rig, (command) =>
      rig.rpcResult.notify(encodeResult(command, ["http://device.local"])),
    );
    const onState = vi.fn();
    const onDisconnect = vi.fn();
    improv.addEventListener("state-changed", onState);
    improv.addEventListener("disconnect", onDisconnect);

    const url = await improv.provision("MyWifi", "päss");

    expect(url).toBe("http://device.local");
    expect(improv.nextUrl).toBe("http://device.local");
    expect(Array.from(rig.rpcCommand.written[0])).toEqual(
      credentialsPayload("MyWifi", "päss"),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      "Provisioned! Disconnecting gatt",
    );
    expect(improv.currentState).toBe(ImprovCurrentState.PROVISIONED);
    expect(onState).toHaveBeenCalledOnce();
    expect(rig.gatt.disconnect).toHaveBeenCalledOnce();
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it("returns undefined nextUrl when the result has no values", async () => {
    const { rig, improv } = setup({ capabilities: 0 });
    await improv.initialize();
    improv.nextUrl = "stale";
    answer(rig, (command) => rig.rpcResult.notify(encodeResult(command, [])));

    const url = await improv.provision("a", "b");

    expect(url).toBeUndefined();
    expect(improv.nextUrl).toBeUndefined();
    expect(improv.currentState).toBe(ImprovCurrentState.PROVISIONED);
    expect(rig.gatt.disconnect).toHaveBeenCalledOnce();
  });

  it("does not report a disconnect from gatt after provisioning", async () => {
    const { rig, improv } = setup({ capabilities: 0 });
    await improv.initialize();
    answer(rig, (command) => rig.rpcResult.notify(encodeResult(command, [])));
    await improv.provision("a", "b");
    const onDisconnect = vi.fn();
    improv.addEventListener("disconnect", onDisconnect);

    rig.device_.dispatchEvent(new Event("gattserverdisconnected"));

    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it("returns undefined and stays connected when provisioning fails", async () => {
    const { rig, improv } = setup({
      capabilities: 0,
      initialState: ImprovCurrentState.AUTHORIZED,
    });
    await improv.initialize();
    answer(rig, () =>
      rig.errorState.notify([ImprovErrorState.UNABLE_TO_CONNECT]),
    );
    const onDisconnect = vi.fn();
    improv.addEventListener("disconnect", onDisconnect);

    const url = await improv.provision("bad", "creds");

    expect(url).toBeUndefined();
    expect(improv.errorState).toBe(ImprovErrorState.UNABLE_TO_CONNECT);
    expect(improv.currentState).toBe(ImprovCurrentState.AUTHORIZED);
    expect(rig.gatt.disconnect).not.toHaveBeenCalled();
    expect(onDisconnect).not.toHaveBeenCalled();
  });
});
