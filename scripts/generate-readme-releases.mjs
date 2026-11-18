#!/usr/bin/env node
/**
 * Rewrites the "Release Notes" section of README.md from
 * src/app/releases/release-notes.ts, the single source of release notes.
 * Pass --check to fail instead of writing when the README is out of date.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { replaceReadmeReleaseNotes } from "../src/app/releases/release-notes.ts";

const readmePath = fileURLToPath(new URL("../README.md", import.meta.url));
const current = readFileSync(readmePath, "utf8");
const next = replaceReadmeReleaseNotes(current);

if (process.argv.includes("--check")) {
  if (current !== next) {
    console.error("README.md release notes are out of date. Run `npm run releases:readme`.");
    process.exit(1);
  }
  console.log("README.md release notes are up to date.");
} else if (current === next) {
  console.log("README.md release notes are already up to date.");
} else {
  writeFileSync(readmePath, next);
  console.log("Updated the release notes in README.md.");
}
