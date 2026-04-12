const fs = require("fs");
const path = require("path");

const sourcePath = "src/proxy-server.mjs";
const helperSourcePath = "src/proxy-server-helpers.mjs";
const destinationDir = "dist/pkspot/server";
const destinationFile = path.join(destinationDir, "server.mjs");
const helperDestinationFile = path.join(
  destinationDir,
  "proxy-server-helpers.mjs"
);
const buildInfoFile = path.join(destinationDir, "build-info.mjs");

// Function to extract supported languages from angular.json
function getSupportedLanguageCodes() {
  const angularJsonPath = path.resolve("angular.json");
  let supportedLanguageCodes = [];
  if (fs.existsSync(angularJsonPath)) {
    try {
      const angularConfig = JSON.parse(
        fs.readFileSync(angularJsonPath, "utf8")
      );
      // Pick the default project or the first project available
      const projectName =
        angularConfig.defaultProject || Object.keys(angularConfig.projects)[0];
      const project = angularConfig.projects[projectName];

      if (project && project.i18n) {
        // Use the source locale and locales defined in angular.json
        const { sourceLocale, locales } = project.i18n;
        if (sourceLocale) {
          // If sourceLocale is an object, extract its 'code' property; otherwise, use it as is
          if (
            typeof sourceLocale === "object" &&
            sourceLocale !== null &&
            sourceLocale.code
          ) {
            supportedLanguageCodes.push(sourceLocale.code);
          } else {
            supportedLanguageCodes.push(sourceLocale);
          }
        }
        if (locales && typeof locales === "object") {
          supportedLanguageCodes = supportedLanguageCodes.concat(
            Object.keys(locales)
          );
        }
      }
    } catch (error) {
      console.error("Error reading angular.json:", error);
    }
  } else {
    // Fallback to a default list
    supportedLanguageCodes = ["en"]; //["en", "de", "it", "de-CH", "fr", "es", "nl"];
  }
  // Remove duplicates
  return [...new Set(supportedLanguageCodes)];
}

// Check if the source file exists
if (fs.existsSync(sourcePath) && fs.existsSync(helperSourcePath)) {
  const sourceAbsolutePath = path.resolve(sourcePath);
  const helperSourceAbsolutePath = path.resolve(helperSourcePath);
  const destinationAbsolutePath = path.resolve(destinationFile);
  const helperDestinationAbsolutePath = path.resolve(helperDestinationFile);

  fs.mkdirSync(path.resolve(destinationDir), { recursive: true });

  // Copy the source file to the destination
  fs.copyFile(sourceAbsolutePath, destinationAbsolutePath, (err) => {
    if (err) {
      console.error("Error copying the file:", err);
    } else {
      console.log("File copied successfully.");

      // Generate LAST_MODIFIED string using current date in GMT format
      const lastModified = new Date().toUTCString();
      const supportedLanguageCodes = getSupportedLanguageCodes();

      const buildInfoContent = `
export const LAST_MODIFIED = "${lastModified}";
export const SUPPORTED_LANGUAGE_CODES = ${JSON.stringify(
        supportedLanguageCodes
      )};
`;

      // Write the build-info.mjs file
      fs.writeFile(buildInfoFile, buildInfoContent, (err) => {
        if (err) {
          console.error("Error writing build-info.mjs:", err);
        } else {
          console.log("build-info.mjs generated successfully.");
        }
      });
    }
  });

  fs.copyFile(
    helperSourceAbsolutePath,
    helperDestinationAbsolutePath,
    (err) => {
      if (err) {
        console.error("Error copying the proxy helper file:", err);
      } else {
        console.log("Proxy helper copied successfully.");
      }
    }
  );
} else {
  console.error("The proxy server source files do not exist.");
}
