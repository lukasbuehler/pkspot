const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const candidateJavaHomes = [
  process.env.JAVA_HOME,
  "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home",
  "/usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home",
].filter(Boolean);

const resolvedJavaHome = candidateJavaHomes.find((candidate) =>
  existsSync(path.join(candidate, "bin", "java"))
);

const env = { ...process.env };

if (resolvedJavaHome) {
  env.JAVA_HOME = resolvedJavaHome;
  env.PATH = `${path.join(resolvedJavaHome, "bin")}:${env.PATH || ""}`;
}

const firebaseBin = require.resolve("firebase-tools/lib/bin/firebase.js");
const firebaseArgs = process.argv.slice(2);

if (firebaseArgs.length === 0) {
  console.error("Expected Firebase CLI arguments.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [firebaseBin, ...firebaseArgs], {
  stdio: "inherit",
  env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
