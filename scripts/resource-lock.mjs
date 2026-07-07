import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const lockRoot = ".angular/pkspot-locks";

export function withHeavyCommandLock(repoRoot, commandName, run) {
  const lockDir = path.join(repoRoot, lockRoot, "heavy-command");
  const metadataPath = path.join(lockDir, "metadata.json");

  acquireLock(lockDir, metadataPath, commandName);

  let released = false;
  const releaseLock = () => {
    if (released) {
      return;
    }

    released = true;
    rmSync(lockDir, { force: true, recursive: true });
  };

  process.once("exit", releaseLock);
  process.once("SIGINT", () => {
    releaseLock();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    releaseLock();
    process.exit(143);
  });

  try {
    return run();
  } finally {
    releaseLock();
  }
}

function acquireLock(lockDir, metadataPath, commandName) {
  mkdirSync(path.dirname(lockDir), { recursive: true });

  try {
    mkdirSync(lockDir);
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }

    if (isStaleLock(metadataPath)) {
      rmSync(lockDir, { force: true, recursive: true });
      mkdirSync(lockDir);
    } else {
      throw new Error(
        `Another resource-heavy PK Spot command is already running: ${describeLock(metadataPath)}`
      );
    }
  }

  writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        command: commandName,
        pid: process.pid,
        startedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

function isStaleLock(metadataPath) {
  if (!existsSync(metadataPath)) {
    return true;
  }

  const metadata = readLockMetadata(metadataPath);
  if (!metadata || !Number.isInteger(metadata.pid)) {
    return true;
  }

  try {
    process.kill(metadata.pid, 0);
    return false;
  } catch (error) {
    return error?.code === "ESRCH";
  }
}

function describeLock(metadataPath) {
  const metadata = readLockMetadata(metadataPath);
  if (!metadata) {
    return "unknown command";
  }

  return `${metadata.command || "unknown command"} (pid ${metadata.pid || "unknown"}, started ${metadata.startedAt || "unknown"})`;
}

function readLockMetadata(metadataPath) {
  try {
    return JSON.parse(readFileSync(metadataPath, "utf8"));
  } catch {
    return null;
  }
}
