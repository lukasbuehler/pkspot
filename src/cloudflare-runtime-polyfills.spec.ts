import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { installBlobUrlStubs } from "./cloudflare-runtime-polyfills";

describe("Cloudflare runtime polyfills", () => {
  it("replaces blob URL functions that throw, as they do in Workers", () => {
    const api = {
      createObjectURL: (): string => {
        throw new Error("URL.createObjectURL() is not implemented");
      },
      revokeObjectURL: (): void => {
        throw new Error("URL.revokeObjectURL() is not implemented");
      },
    };

    expect(installBlobUrlStubs(api)).toBe(true);
    const first = api.createObjectURL();
    expect(first).toMatch(/^blob:/u);
    expect(api.createObjectURL()).not.toBe(first);
    expect(() => api.revokeObjectURL()).not.toThrow();
  });

  it("keeps working blob URL functions", () => {
    const createObjectURL = (): string => "blob:native";
    const revokeObjectURL = (): void => undefined;
    const api = { createObjectURL, revokeObjectURL };

    expect(installBlobUrlStubs(api)).toBe(false);
    expect(api.createObjectURL).toBe(createObjectURL);
    expect(api.revokeObjectURL).toBe(revokeObjectURL);
  });

  it("installs before the Worker loads Angular", () => {
    const server = readFileSync(resolve(process.cwd(), "server.cloudflare.ts"), "utf8");
    const imports = [...server.matchAll(/^import .*$/gmu)].map(([line]) => line);

    expect(imports[0]).toBe('import "./src/cloudflare-runtime-polyfills";');
  });
});
