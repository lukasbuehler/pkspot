const fs = require("fs");
const path = require("path");

const files = [
  "src/locale/messages.de.xlf",
  "src/locale/messages.es.xlf",
  "src/locale/messages.fr.xlf",
  "src/locale/messages.it.xlf",
  "src/locale/messages.nl.xlf",
];

function findUntranslated(filePath) {
  const absolutPath = path.resolve(filePath);
  const content = fs.readFileSync(absolutPath, "utf8");
  const lines = content.split("\n");

  let currentUnitId = null;
  let source = null;
  let target = null;
  let sourceLine = 0;
  let targetLine = 0;

  console.log(`\nScanning ${filePath}...`);

  let buffer = [];
  let unitSource = null;
  let unitTarget = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('<unit id="')) {
      currentUnitId = line.match(/id="([^"]+)"/)[1];
      unitSource = null;
      unitTarget = null;
    } else if (line.startsWith("<source>")) {
      // Handle simple single line source
      const match = lines[i].match(/<source>([\s\S]*?)<\/source>/);
      if (match) {
        unitSource = match[1];
      } else {
        // handle multiline or complex case later if needed, but for now assuming single line for simplicity
        // or we can just join lines until </source>
        unitSource = line.replace("<source>", "").replace("</source>", "");
      }
    } else if (line.startsWith("<target>")) {
      const match = lines[i].match(/<target>([\s\S]*?)<\/target>/);
      if (match) {
        unitTarget = match[1];
      } else {
        unitTarget = line.replace("<target>", "").replace("</target>", "");
      }

      // Check if source and target are identical
      if (
        currentUnitId &&
        unitSource &&
        unitTarget &&
        unitSource === unitTarget
      ) {
        if (unitSource.trim().length > 0) {
          console.log(
            JSON.stringify(
              {
                file: filePath,
                line: i,
                id: currentUnitId,
                source: unitSource,
              },
              null,
              2
            ) + ","
          );
        }
      }
    }
  }
}

files.forEach((file) => {
  if (fs.existsSync(file)) {
    findUntranslated(file);
  } else {
    console.error(`File not found: ${file}`);
  }
});
