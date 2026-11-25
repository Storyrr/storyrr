import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { dataDirectory, loadOrCreateSecret } from "./secret";

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("generated secret", () => {
  it("is created once, private, then kept", async () => {
    dir = await mkdtemp(join(tmpdir(), "storyrr-secret-"));
    const file = join(dir, "auth-secret");
    const first = loadOrCreateSecret(file);
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(loadOrCreateSecret(file)).toBe(first);
  });

  it("keeps a secret already in the file", async () => {
    dir = await mkdtemp(join(tmpdir(), "storyrr-secret-"));
    const file = join(dir, "auth-secret");
    await writeFile(file, `${"k".repeat(40)}\n`);
    expect(loadOrCreateSecret(file)).toBe("k".repeat(40));
    expect(await readFile(file, "utf8")).toBe(`${"k".repeat(40)}\n`);
  });

  it("lives next to the database", () => {
    expect(dataDirectory("file:/data/storyrr.db")).toBe("/data");
  });
});
