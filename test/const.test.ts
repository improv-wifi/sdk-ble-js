import { describe, expect, it } from "vitest";

import {
  hasGetDeviceInfoCapability,
  hasGetWifiNetworksCapability,
  hasIdentifyCapability,
} from "../src/const";

describe("capability helpers", () => {
  it("hasIdentifyCapability checks bit 0", () => {
    expect(hasIdentifyCapability(0)).toBe(false);
    expect(hasIdentifyCapability(1)).toBe(true);
    expect(hasIdentifyCapability(2 | 4)).toBe(false);
    expect(hasIdentifyCapability(1 | 2 | 4)).toBe(true);
  });

  it("hasGetDeviceInfoCapability checks bit 1", () => {
    expect(hasGetDeviceInfoCapability(0)).toBe(false);
    expect(hasGetDeviceInfoCapability(2)).toBe(true);
    expect(hasGetDeviceInfoCapability(1 | 4)).toBe(false);
    expect(hasGetDeviceInfoCapability(1 | 2 | 4)).toBe(true);
  });

  it("hasGetWifiNetworksCapability checks bit 2", () => {
    expect(hasGetWifiNetworksCapability(0)).toBe(false);
    expect(hasGetWifiNetworksCapability(4)).toBe(true);
    expect(hasGetWifiNetworksCapability(1 | 2)).toBe(false);
    expect(hasGetWifiNetworksCapability(1 | 2 | 4)).toBe(true);
  });
});
