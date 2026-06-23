import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outputPath = resolve("src/environments/environment.ci.generated.ts");
const localEnv = {
  ...readLocalEnvFile(resolve(".env")),
  ...readLocalEnvFile(resolve(".env.local")),
};
const apiKey =
  process.env["PKSPOT_CI_FIREBASE_API_KEY"] ??
  localEnv["PKSPOT_CI_FIREBASE_API_KEY"];

if (!apiKey) {
  throw new Error(
    "Missing PKSPOT_CI_FIREBASE_API_KEY. Set it in CI secrets or a local ignored env file before generating the CI environment.",
  );
}

const content = `import { environment as ciEnvironment } from "./environment.ci";

export const environment = {
  ...ciEnvironment,
  keys: {
    ...ciEnvironment.keys,
    firebaseConfig: {
      ...ciEnvironment.keys.firebaseConfig,
      apiKey: ${JSON.stringify(apiKey)},
    },
  },
};
`;

writeFileSync(outputPath, content);

function readLocalEnvFile(path) {
  if (!existsSync(path)) return {};

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex === -1) return [line, ""];

        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        return [key, stripOptionalQuotes(value)];
      }),
  );
}

function stripOptionalQuotes(value) {
  const first = value.at(0);
  const last = value.at(-1);
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }

  return value;
}
