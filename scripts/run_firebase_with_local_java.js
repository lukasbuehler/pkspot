const {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} = require("node:fs");
const { spawnSync } = require("node:child_process");
const net = require("node:net");
const os = require("node:os");
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
const firebaseConfigHome = path.join(os.tmpdir(), "pkspot-firebase-cli-config");

mkdirSync(firebaseConfigHome, { recursive: true });
env.XDG_CONFIG_HOME = firebaseConfigHome;

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

function canListenOnPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port);
  });
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);

    server.once("listening", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to resolve an available port.")));
        return;
      }

      server.close(() => {
        resolve(address.port);
      });
    });

    server.listen(0);
  });
}

function getRequestedFunctionsNodeMajor() {
  const functionsPackagePath = path.join(process.cwd(), "functions", "package.json");
  if (!existsSync(functionsPackagePath)) {
    return null;
  }

  const functionsPackage = JSON.parse(readFileSync(functionsPackagePath, "utf8"));
  const engine = functionsPackage.engines?.node;
  const match = typeof engine === "string" ? engine.match(/\d+/) : null;
  return match ? Number(match[0]) : null;
}

function compareVersionDirectories(left, right) {
  const leftParts = left.replace(/^v/, "").split(".").map(Number);
  const rightParts = right.replace(/^v/, "").split(".").map(Number);

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart !== rightPart) {
      return rightPart - leftPart;
    }
  }

  return 0;
}

function findNvmNodeForMajor(major) {
  const nvmDir = process.env.NVM_DIR || path.join(os.homedir(), ".nvm");
  const versionsDir = path.join(nvmDir, "versions", "node");

  if (!existsSync(versionsDir)) {
    return null;
  }

  const matchingVersion = readdirSync(versionsDir)
    .filter((version) => version.startsWith(`v${major}.`))
    .filter((version) => existsSync(path.join(versionsDir, version, "bin", "node")))
    .sort(compareVersionDirectories)[0];

  return matchingVersion
    ? path.join(versionsDir, matchingVersion, "bin", "node")
    : null;
}

function getFirebaseNodeBin() {
  const requestedMajor = getRequestedFunctionsNodeMajor();
  const currentMajor = Number(process.versions.node.split(".")[0]);

  if (!requestedMajor || requestedMajor === currentMajor) {
    return process.execPath;
  }

  return findNvmNodeForMajor(requestedMajor) || process.execPath;
}

async function withAvailableEmulatorPorts(args) {
  if (args[0] !== "emulators:exec" || args.includes("--config")) {
    return { args, cleanup: null };
  }

  const firebaseConfigPath = path.join(process.cwd(), "firebase.json");
  if (!existsSync(firebaseConfigPath)) {
    return { args, cleanup: null };
  }

  const config = JSON.parse(readFileSync(firebaseConfigPath, "utf8"));
  const emulators = config.emulators;
  if (!emulators || typeof emulators !== "object") {
    return { args, cleanup: null };
  }

  let changed = false;
  const reservedPorts = new Set();

  for (const emulatorConfig of Object.values(emulators)) {
    if (!emulatorConfig || typeof emulatorConfig !== "object") {
      continue;
    }

    const port = emulatorConfig.port;
    if (!Number.isInteger(port)) {
      continue;
    }

    if (!reservedPorts.has(port) && (await canListenOnPort(port))) {
      reservedPorts.add(port);
      continue;
    }

    let availablePort = await getAvailablePort();
    while (reservedPorts.has(availablePort)) {
      availablePort = await getAvailablePort();
    }

    emulatorConfig.port = availablePort;
    reservedPorts.add(availablePort);
    changed = true;
  }

  if (!changed) {
    return { args, cleanup: null };
  }

  const tempConfigPath = path.join(
    process.cwd(),
    `.firebase-emulators-${process.pid}.json`
  );
  writeFileSync(tempConfigPath, `${JSON.stringify(config, null, 2)}\n`);

  return {
    args: ["--config", tempConfigPath, ...args],
    cleanup: () => {
      try {
        unlinkSync(tempConfigPath);
      } catch (error) {
        if (error?.code !== "ENOENT") {
          console.warn(`Unable to remove temporary Firebase config: ${error.message}`);
        }
      }
    },
  };
}

async function main() {
  const { args, cleanup } = await withAvailableEmulatorPorts(firebaseArgs);
  const firebaseNodeBin = getFirebaseNodeBin();
  const firebaseNodeDir = path.dirname(firebaseNodeBin);

  if (firebaseNodeBin !== process.execPath) {
    env.PATH = `${firebaseNodeDir}:${env.PATH || ""}`;
  }

  const result = spawnSync(firebaseNodeBin, [firebaseBin, ...args], {
    stdio: "inherit",
    env,
  });

  cleanup?.();

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
