const fs = require("fs");
const path = require("path");

const files = [
  "src/locale/messages.de.xlf",
  "src/locale/messages.es.xlf",
  "src/locale/messages.it.xlf",
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('<unit id="')) {
      currentUnitId = line.match(/id="([^"]+)"/)[1];
      source = null;
      target = null;
    } else if (line.startsWith("<source>")) {
      source = line.replace("<source>", "").replace("</source>", "").trim();
      sourceLine = i + 1;
    } else if (line.startsWith("<target>")) {
      target = line.replace("<target>", "").replace("</target>", "").trim();
      targetLine = i + 1;

      // Check if source and target are identical
      if (currentUnitId && source && target && source === target) {
        // Filter out trivial/empty strings if necessary, though user wants everything
        if (source.length > 0) {
          console.log(
            `[${filePath}:${targetLine}] ID: ${currentUnitId} | Text: "${source.substring(
              0,
              50
            )}${source.length > 50 ? "..." : ""}"`
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
