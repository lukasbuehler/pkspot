import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outputPath = resolve("src/environments/environment.ci.generated.ts");
const apiKey =
  process.env["PKSPOT_CI_FIREBASE_API_KEY"] ?? "pkspot-ci-placeholder-api-key";

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
