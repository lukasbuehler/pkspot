export const appHtmlEntry = "src/index.html";

export const generatedOutputGlobs = [
  "android/**",
  "coverage/**",
  "dist/**",
  "ios/**",
  "playwright-report/**",
] as const;

export const testFileGlobs = [
  "src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
] as const;
