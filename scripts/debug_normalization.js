const fs = require("fs");

const content = fs.readFileSync("src/locale/messages.de.xlf", "utf8");
const unitId = "1200965830581356414";

// Extract the unit manually using regex
const unitRegex = new RegExp(
  `<unit id="${unitId}">[\\s\\S]*?<source>([\\s\\S]*?)<\/source>`,
  "m"
);
const match = content.match(unitRegex);

if (match) {
  const rawSource = match[1];
  console.log("--- Raw Source ---");
  console.log(rawSource);

  const normalize = (s) =>
    s.replace(/\s+/g, " ").replace(/"\s+>/g, '">').trim();

  const normalized = normalize(rawSource);
  console.log("\n--- Normalized ---");
  console.log(normalized);

  const expectedKey =
    '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">download</pc> Download the App ';
  const normalizedKey = normalize(expectedKey);

  console.log("\n--- Match? ---");
  console.log(normalized === normalizedKey);

  if (normalized !== normalizedKey) {
    console.log("Expected:", normalizedKey);
    console.log("Actual:  ", normalized);
  }
} else {
  console.log("Unit not found");
}
