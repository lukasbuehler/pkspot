/**
 * Translation Analyzer for XLIFF files
 *
 * This script analyzes translation files to find:
 * 1. Untranslated strings (where target === source)
 * 2. Incorrect translations of "Spot" (should remain as "Spot")
 * 3. Summary statistics for each language
 */

const fs = require("fs");
const path = require("path");

const LOCALE_DIR = "src/locale";

const files = [
  { path: "src/locale/messages.de.xlf", lang: "German (DE)" },
  { path: "src/locale/messages.es.xlf", lang: "Spanish (ES)" },
  { path: "src/locale/messages.fr.xlf", lang: "French (FR)" },
  { path: "src/locale/messages.it.xlf", lang: "Italian (IT)" },
  { path: "src/locale/messages.nl.xlf", lang: "Dutch (NL)" },
];

// Words that indicate "Spot" was incorrectly translated
const INCORRECT_SPOT_TRANSLATIONS = {
  de: ["Ort", "Stelle", "Platz", "Fleck", "Punkt", "Standort"],
  es: ["Lugar", "Sitio", "Punto", "Mancha", "Sitio", "Ubicación"],
  fr: ["Lieu", "Endroit", "Place", "Point", "Tache"],
  it: ["Luogo", "Posto", "Punto", "Macchia", "Località"],
  nl: ["Plek", "Plaats", "Punt", "Vlek", "Locatie"],
};

// Patterns where source === target is ACCEPTABLE (e.g., proper nouns, technical terms)
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
  /^\s*$/, // empty strings
  /^[0-9]+$/, // just numbers
  /^<ph\s/, // placeholders only
  /^<pc\s/, // paired codes only
  /^[@#]/, // mentions/hashtags
  /^https?:\/\//, // URLs
  /^No$/i,
  /^Password$/i, // commonly kept in English
  /^OK$/i,
  /^Terms of Service$/i, // Legal terms often kept
  /^\{\{.*\}\}$/, // Angular interpolations
];

function extractLangCode(filePath) {
  const match = filePath.match(/messages\.([a-z]{2}(?:-[A-Z]{2})?)\./);
  return match ? match[1] : null;
}

function isAcceptableSame(source) {
  return ACCEPTABLE_SAME.some((pattern) => pattern.test(source));
}

function hasIncorrectSpotTranslation(source, target, langCode) {
  // Only check if source contains "Spot" or "spot"
  if (!/\bSpot\b/i.test(source)) {
    return false;
  }

  // Check if target translates "Spot" to something else
  const incorrectWords = INCORRECT_SPOT_TRANSLATIONS[langCode] || [];
  for (const word of incorrectWords) {
    // Look for the translated word where "Spot" should be
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(target) && !/\bSpot\b/i.test(target)) {
      return true;
    }
  }
  return false;
}

function extractSourceContent(line) {
  const match = line.match(/<source>(.*?)<\/source>/s);
  return match ? match[1] : null;
}

function extractTargetContent(line) {
  const match = line.match(/<target>(.*?)<\/target>/s);
  return match ? match[1] : null;
}

function analyzeFile(filePath, langName) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`File not found: ${filePath}`);
    return null;
  }

  const content = fs.readFileSync(absolutePath, "utf8");
  const lines = content.split("\n");
  const langCode = extractLangCode(filePath);

  const results = {
    file: filePath,
    language: langName,
    totalUnits: 0,
    untranslated: [],
    incorrectSpot: [],
  };

  let currentUnitId = null;
  let sourceLines = [];
  let targetLines = [];
  let inSource = false;
  let inTarget = false;
  let sourceStartLine = 0;
  let targetStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track unit ID
    if (trimmed.startsWith('<unit id="')) {
      currentUnitId = trimmed.match(/id="([^"]+)"/)?.[1];
      results.totalUnits++;
      sourceLines = [];
      targetLines = [];
      inSource = false;
      inTarget = false;
    }

    // Handle source tag (might be multi-line)
    if (trimmed.includes("<source>")) {
      inSource = true;
      sourceStartLine = i + 1;
      sourceLines = [line];
      if (trimmed.includes("</source>")) {
        inSource = false;
      }
    } else if (inSource) {
      sourceLines.push(line);
      if (trimmed.includes("</source>")) {
        inSource = false;
      }
    }

    // Handle target tag (might be multi-line)
    if (trimmed.includes("<target>")) {
      inTarget = true;
      targetStartLine = i + 1;
      targetLines = [line];
      if (trimmed.includes("</target>")) {
        inTarget = false;
      }
    } else if (inTarget) {
      targetLines.push(line);
      if (trimmed.includes("</target>")) {
        inTarget = false;
      }
    }

    // When we've collected both source and target, analyze
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

        // Check for untranslated (source === target)
        if (source === target && !isAcceptableSame(source.trim())) {
          results.untranslated.push({
            id: currentUnitId,
            line: targetStartLine,
            source: source.substring(0, 80) + (source.length > 80 ? "..." : ""),
          });
        }

        // Check for incorrect "Spot" translation
        if (hasIncorrectSpotTranslation(source, target, langCode)) {
          results.incorrectSpot.push({
            id: currentUnitId,
            line: targetStartLine,
            source: source.substring(0, 60),
            target: target.substring(0, 60),
          });
        }
      }

      // Reset for next unit
      sourceLines = [];
      targetLines = [];
    }
  }

  return results;
}

function printResults(results) {
  console.log("\n" + "=".repeat(80));
  console.log(`📁 ${results.language} - ${results.file}`);
  console.log("=".repeat(80));
  console.log(`Total translation units: ${results.totalUnits}`);

  if (results.untranslated.length > 0) {
    console.log(`\n❌ UNTRANSLATED STRINGS (${results.untranslated.length}):`);
    console.log("-".repeat(60));
    results.untranslated.forEach((item) => {
      console.log(`  Line ${item.line} | ID: ${item.id}`);
      console.log(`    "${item.source}"`);
    });
  } else {
    console.log("\n✅ No untranslated strings found!");
  }

  if (results.incorrectSpot.length > 0) {
    console.log(
      `\n⚠️  INCORRECT "Spot" TRANSLATIONS (${results.incorrectSpot.length}):`
    );
    console.log("-".repeat(60));
    results.incorrectSpot.forEach((item) => {
      console.log(`  Line ${item.line} | ID: ${item.id}`);
      console.log(`    Source: "${item.source}"`);
      console.log(`    Target: "${item.target}"`);
    });
  } else {
    console.log('\n✅ "Spot" translations are consistent!');
  }
}

function main() {
  console.log("🔍 Translation Analyzer for PK Spot XLIFF Files");
  console.log("================================================\n");

  let totalUntranslated = 0;
  let totalIncorrectSpot = 0;

  files.forEach((file) => {
    const results = analyzeFile(file.path, file.lang);
    if (results) {
      printResults(results);
      totalUntranslated += results.untranslated.length;
      totalIncorrectSpot += results.incorrectSpot.length;
    }
  });

  console.log("\n" + "=".repeat(80));
  console.log("📊 SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total untranslated strings: ${totalUntranslated}`);
  console.log(`Total incorrect "Spot" translations: ${totalIncorrectSpot}`);
  console.log(`Total issues: ${totalUntranslated + totalIncorrectSpot}`);
}

main();
