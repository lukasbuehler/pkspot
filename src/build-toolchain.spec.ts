import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("keeps Angular's pinned Vite dependency aligned with its development-server adapter", () => {
  const require = createRequire(resolve("package.json"));
  const builderPath = require.resolve("@angular/build/package.json");
  const builder = require(builderPath) as { dependencies: { vite: string } };
  const builderRequire = createRequire(builderPath);
  const vite = builderRequire("vite/package.json") as { version: string };

  // A Vite 7 override silently ignored Angular 22's Vite 8 SSR prebundle
  // defines, enabling browser event replay in Node and crashing ng serve.
  expect(vite.version).toBe(builder.dependencies.vite);
});
