const fs = require("fs");
const path = require("path");

const files = [
  "src/locale/messages.de.xlf",
  "src/locale/messages.es.xlf",
  "src/locale/messages.fr.xlf",
  "src/locale/messages.it.xlf",
  "src/locale/messages.nl.xlf",
];

// Patterns where source === target is ACCEPTABLE
const ACCEPTABLE_SAME = [
  /^Spot$/i,
  /^PK Spot$/i,
  /^Google$/i,
  /^Apple Maps$/i,
  /^Google Maps$/i,
  /^Creative Commons$/i,
  /^MIT License$/i,
  /^ASVZ$/i,
  /^Parkour$/i,
  /^\s*$/,
  /^[0-9]+$/,
  /^<ph\s/,
  /^<pc\s/,
  /^[@#]/,
  /^https?:\/\//,
  /^OK$/i,
  /^Terms of Service$/i,
  /^\{\{.*\}\}$/,
];

function isAcceptableSame(source) {
  return ACCEPTABLE_SAME.some((pattern) => pattern.test(source));
}

const uniqueSources = new Set();

files.forEach((file) => {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split("\n");
  let inSource = false;
  let inTarget = false;
  let sourceLines = [];
  let targetLines = [];

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (trimmed.includes("<source>")) {
      inSource = true;
      sourceLines = [line];
      if (trimmed.includes("</source>")) inSource = false;
    } else if (inSource) {
      sourceLines.push(line);
      if (trimmed.includes("</source>")) inSource = false;
    }

    if (trimmed.includes("<target>")) {
      inTarget = true;
      targetLines = [line];
      if (trimmed.includes("</target>")) inTarget = false;
    } else if (inTarget) {
      targetLines.push(line);
      if (trimmed.includes("</target>")) inTarget = false;
    }

    if (
      sourceLines.length > 0 &&
      targetLines.length > 0 &&
      !inSource &&
      !inTarget
    ) {
      const sourceText = sourceLines.join("\n");
      const targetText = targetLines.join("\n");

      const sourceMatch = sourceText.match(/<source>([\s\S]*?)<\/source>/);
      const targetMatch = targetText.match(/<target>([\s\S]*?)<\/target>/);

      if (sourceMatch && targetMatch) {
        const source = sourceMatch[1];
        const target = targetMatch[1];

        if (source === target && !isAcceptableSame(source.trim())) {
          uniqueSources.add(source);
        }
      }
      sourceLines = [];
      targetLines = [];
    }
  });
});

const sortedSources = Array.from(uniqueSources).sort();
console.log(JSON.stringify(sortedSources, null, 2));
