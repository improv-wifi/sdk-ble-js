import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { rollup, type OutputChunk } from "rollup";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error plain JS module
import baseConfig from "../rollup.config.mjs";

const exec = promisify(execFile);
const root = path.resolve(__dirname, "..");
let tscDir: string;
let chunks: OutputChunk[];

beforeAll(async () => {
  tscDir = await fs.mkdtemp(path.join(os.tmpdir(), "improv-ble-tsc-"));
  await exec("npx", ["tsc", "--outDir", tscDir], { cwd: root });
  // Let module resolution find the dependencies from the temp dir.
  await fs.symlink(
    path.join(root, "node_modules"),
    path.join(tscDir, "node_modules"),
  );
  const { output, ...rest } = baseConfig;
  const bundle = await rollup({
    ...rest,
    input: path.join(tscDir, "launch-button.js"),
  });
  try {
    const result = await bundle.generate(output);
    chunks = result.output.filter((o): o is OutputChunk => o.type === "chunk");
  } finally {
    await bundle.close();
  }
}, 180_000);

afterAll(async () => {
  await fs.rm(tscDir, { recursive: true, force: true });
});

describe("rollup build", () => {
  it("keeps the entry a single self-contained file", () => {
    const entries = chunks.filter((c) => c.isEntry);
    expect(entries).toHaveLength(1);
    expect(entries[0].fileName).toBe("launch-button.js");
    expect(entries[0].imports).toEqual([]);
  });

  it("loads the provisioning code through lazy chunks", () => {
    const entry = chunks.find((c) => c.isEntry)!;
    expect(entry.dynamicImports.length).toBeGreaterThan(0);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("keeps lazy chunks from importing the entry chunk", () => {
    const entry = chunks.find((c) => c.isEntry)!;
    for (const chunk of chunks.filter((c) => !c.isEntry)) {
      expect([...chunk.imports, ...chunk.dynamicImports]).not.toContain(
        entry.fileName,
      );
    }
  });
});
