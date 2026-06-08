import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SCHEMA_DIR = join(process.cwd(), "src/db/schemas");
const TYPESENSE_DIR = join(process.cwd(), "typesense");

const legacyFirestoreFieldExceptions = new Set<string>([
  // Intentionally documented as legacy names; new persisted schema fields
  // should use snake_case.
  "CommunityGeographySchema.countryCode",
  "CommunityGeographySchema.countryName",
  "CommunityGeographySchema.countryLocalName",
  "CommunityGeographySchema.countrySlug",
  "CommunityGeographySchema.regionCode",
  "CommunityGeographySchema.regionName",
  "CommunityGeographySchema.regionLocalName",
  "CommunityGeographySchema.regionSlug",
  "CommunityGeographySchema.localityName",
  "CommunityGeographySchema.localityLocalName",
  "CommunityGeographySchema.localitySlug",
  "CommunityRelationshipsSchema.parentKeys",
  "CommunityRelationshipsSchema.childKeys",
  "CommunityRelationshipsSchema.relatedKeys",
  "CommunityInfoCardSchema.commercialDisclosure",
  "CommunityChildSummarySchema.communityKey",
  "CommunityChildSummarySchema.displayName",
  "CommunityChildSummarySchema.preferredSlug",
  "CommunityChildSummarySchema.canonicalPath",
  "CommunityChildSummarySchema.totalSpotCount",
  "CommunityChildSummarySchema.dryCount",
  "CommunityPageSchema.communityKey",
  "CommunityPageSchema.displayName",
  "CommunityPageSchema.preferredSlug",
  "CommunityPageSchema.allSlugs",
  "CommunityPageSchema.canonicalPath",
  "CommunityPageSchema.counts.totalSpots",
  "CommunityPageSchema.counts.topRated",
  "CommunityPageSchema.communityPicks",
  "CommunityPageSchema.topRatedSpots",
  "CommunityPageSchema.drySpots",
  "CommunityPageSchema.infoCards",
  "CommunityPageSchema.childCommunities",
  "CommunityPageSchema.eventPreviews",
  "CommunityPageSchema.generatedAt",
  "CommunityPageSchema.sourceMaxUpdatedAt",
  "CommunitySlugSchema.communityKey",
  "CommunitySlugSchema.isPreferred",
  "CommunitySlugSchema.createdAt",
  "ContactMessageSchema.createdAt",
  "MediaSchema.isInStorage",
  "MediaSchema.isReported",
  "MediaReportSchema.media.userId",
  "MediaReportSchema.media.spotId",
  "MediaReportSchema.spotId",
  "MediaReportSchema.targetId",
  "MediaReportSchema.createdAt",
  "MediaReportSchema.resolvedAt",
  "MediaReportSchema.resolvedBy",
  "MediaReportSchema.resolutionNote",
  "PolygonSchema.strokeColor",
  "PolygonSchema.strokeOpacity",
  "PolygonSchema.strokeWeight",
  "PolygonSchema.fillColor",
  "PolygonSchema.fillOpacity",
  "SpotEditSchema.prevData",
  "SpotLandingSchema.countryCode",
  "SpotLandingSchema.countryNameEn",
  "SpotLandingSchema.countrySlug",
  "SpotLandingSchema.regionCode",
  "SpotLandingSchema.regionName",
  "SpotLandingSchema.regionSlug",
  "SpotLandingSchema.localityName",
  "SpotLandingSchema.localitySlug",
  "SpotLandingSchema.isDry",
  "SpotLandingSchema.organizationVerified",
  "SpotReportSchema.duplicateOf",
  "SpotReportSchema.createdAt",
  "SpotReportSchema.resolvedAt",
  "SpotReportSchema.resolvedBy",
  "SpotReportSchema.resolutionNote",
  "SpotAddressSchema.sublocalityLocal",
  "SpotAddressSchema.localityLocal",
  "SpotAddressSchema.region.localName",
  "SpotAddressSchema.country.localName",
  "SpotAddressSchema.formattedLocal",
  "SpotSchema.isMiniSpot",
  "SpotSchema.address.formattedLocal",
  "SpotSchema.address.localityLocal",
  "SpotSchema.address.sublocalityLocal",
  "UserReportSchema.reportedUser",
  "UserReportSchema.createdAt",
  "UserReportSchema.sourcePath",
  "UserReportSchema.resolvedAt",
  "UserReportSchema.resolvedBy",
  "UserReportSchema.resolutionNote",
  "UserSchema.creationDate",
  "UserSettingsSchema.useGeoURI",
]);

const legacyTypesenseFieldExceptions = new Set<string>([
  // Legacy Typesense collection fields. New Typesense fields should use
  // snake_case unless this list is extended with a migration note.
  "typesense_communities_v1_schema.json.communityKey",
  "typesense_communities_v1_schema.json.displayName",
  "typesense_communities_v1_schema.json.preferredSlug",
  "typesense_communities_v1_schema.json.allSlugs",
  "typesense_communities_v1_schema.json.canonicalPath",
  "typesense_communities_v1_schema.json.geography.countryCode",
  "typesense_communities_v1_schema.json.geography.countryName",
  "typesense_communities_v1_schema.json.geography.countryLocalName",
  "typesense_communities_v1_schema.json.geography.regionCode",
  "typesense_communities_v1_schema.json.geography.regionName",
  "typesense_communities_v1_schema.json.geography.regionLocalName",
  "typesense_communities_v1_schema.json.geography.localityName",
  "typesense_communities_v1_schema.json.geography.localityLocalName",
  "typesense_communities_v1_schema.json.relationships.parentKeys",
  "typesense_communities_v1_schema.json.counts.totalSpots",
  "typesense_communities_v1_schema.json.counts.topRated",
]);

function isSnakeCaseFieldName(name: string): boolean {
  return /^_?[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(name);
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }
  return null;
}

function collectPropertiesFromTypeNode(
  ownerName: string,
  node: ts.TypeNode | undefined,
  prefix: string,
  output: string[],
): void {
  if (!node || !ts.isTypeLiteralNode(node)) return;

  for (const member of node.members) {
    if (!ts.isPropertySignature(member)) continue;
    const fieldName = propertyNameText(member.name);
    if (!fieldName) continue;

    const fieldPath = prefix ? `${prefix}.${fieldName}` : fieldName;
    output.push(`${ownerName}.${fieldPath}`);
    collectPropertiesFromTypeNode(ownerName, member.type, fieldPath, output);
  }
}

function collectFirestoreSchemaFieldPaths(fileName: string): string[] {
  const sourcePath = join(SCHEMA_DIR, fileName);
  const sourceFile = ts.createSourceFile(
    sourcePath,
    readFileSync(sourcePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const fieldPaths: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text.endsWith("Schema")) {
      for (const member of node.members) {
        if (!ts.isPropertySignature(member)) continue;
        const fieldName = propertyNameText(member.name);
        if (!fieldName) continue;

        fieldPaths.push(`${node.name.text}.${fieldName}`);
        collectPropertiesFromTypeNode(
          node.name.text,
          member.type,
          fieldName,
          fieldPaths,
        );
      }
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return fieldPaths;
}

function schemaTypeScriptFiles(): string[] {
  return readdirSync(SCHEMA_DIR)
    .filter((file) => file.endsWith(".ts"))
    .filter((file) => !file.endsWith(".spec.ts"))
    .filter((file) => !file.endsWith(".testing.ts"))
    .sort();
}

function typesenseSchemaFiles(): string[] {
  return readdirSync(TYPESENSE_DIR)
    .filter((file) => file.endsWith("_schema.json"))
    .sort();
}

describe("Persisted schema field naming", () => {
  it("Firestore schema fields use snake_case", () => {
    const problems = schemaTypeScriptFiles()
      .flatMap((file) => collectFirestoreSchemaFieldPaths(file))
      .filter((fieldPath) => !legacyFirestoreFieldExceptions.has(fieldPath))
      .filter((fieldPath) => {
        const [, ...pathParts] = fieldPath.split(".");
        return pathParts.some((part) => !isSnakeCaseFieldName(part));
      });

    expect(problems).toEqual([]);
  });

  it("Typesense schema fields use snake_case", () => {
    const problems = typesenseSchemaFiles().flatMap((file) => {
      const schema = JSON.parse(
        readFileSync(join(TYPESENSE_DIR, file), "utf8"),
      ) as { fields?: Array<{ name?: unknown }> };

      return (schema.fields ?? [])
        .map((field) => String(field.name ?? ""))
        .filter((fieldName) =>
          fieldName.split(".").some((part) => !isSnakeCaseFieldName(part)),
        )
        .map((fieldName) => `${basename(file)}.${fieldName}`)
        .filter((fieldPath) => !legacyTypesenseFieldExceptions.has(fieldPath));
    });

    expect(problems).toEqual([]);
  });
});
