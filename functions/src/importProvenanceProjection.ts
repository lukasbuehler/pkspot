import type {PublicImportProvenance} from "../../src/db/schemas/PublicImportProvenance";
export type PublicImportProvenanceProjection = PublicImportProvenance;

const MAX_PUBLIC_TEXT_LENGTH = 2_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const publicText = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, MAX_PUBLIC_TEXT_LENGTH) : undefined;
};

/** Builds the complete public allowlist from a private import document. */
export const buildPublicImportProvenance = (
  importData: unknown,
): PublicImportProvenanceProjection | null => {
  if (!isRecord(importData)) return null;
  const credits = isRecord(importData["credits"]) ? importData["credits"] : null;
  const sourceName = publicText(credits?.["source_name"]);
  if (!sourceName) return null;

  const attributionText = publicText(credits?.["attribution_text"]);
  const websiteUrl = publicText(credits?.["website_url"]);
  const instagramUrl = publicText(credits?.["instagram_url"]);
  const sourceUrl = publicText(importData["source_url"]);
  const viewerUrl = publicText(importData["viewer_url"]);

  return {
    source_name: sourceName,
    ...(attributionText ? {attribution_text: attributionText} : {}),
    ...(websiteUrl ? {website_url: websiteUrl} : {}),
    ...(instagramUrl ? {instagram_url: instagramUrl} : {}),
    ...(sourceUrl ? {source_url: sourceUrl} : {}),
    ...(viewerUrl ? {viewer_url: viewerUrl} : {}),
  };
};

/** Resolves a Spot's import link, preferring the current field over legacy data. */
export const spotLinksToImport = (
  spotData: unknown,
  importId: string,
): boolean => {
  if (!isRecord(spotData)) return false;
  const currentImportId = spotData["import_id"];
  return typeof currentImportId === "string"
    ? currentImportId === importId
    : spotData["source"] === importId;
};

export const publicImportProvenanceEqual = (
  left: PublicImportProvenanceProjection | null | undefined,
  right: PublicImportProvenanceProjection | null | undefined,
): boolean => {
  if (left == null || right == null) return left === right;

  const fields = [
    "source_name",
    "attribution_text",
    "website_url",
    "instagram_url",
    "source_url",
    "viewer_url",
  ] as const;
  const allowedFields = new Set<string>(fields);
  if (
    Object.keys(left).some((field) => !allowedFields.has(field)) ||
    Object.keys(right).some((field) => !allowedFields.has(field))
  ) {
    return false;
  }

  return fields.every((field) => left[field] === right[field]);
};
