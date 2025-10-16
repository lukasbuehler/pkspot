/**
 * Spot Transformer
 *
 * Transforms Horizn app data format into PK Spot schema format.
 * This ensures type safety and schema compliance.
 */

import { GeoPoint, Timestamp } from "firebase-admin/firestore";
import { SpotSchema } from "../../src/db/schemas/SpotSchema";
import { HoriznSpotData, ImportConfig } from "./types";

/**
 * Maps Horizn area tags to PK Spot types
 */
const HORIZN_TAG_TO_SPOT_TYPE: Record<string, string> = {
  parkour_park: "parkour-park",
  parkour_gym: "parkour-gym",
  gym: "parkour-gym",
  trampoline_park: "trampoline-park",
  playground: "playground",
  school: "school",
  university: "university-campus",
  park: "park",
  rooftop: "rooftop",
  art: "art",
};

/**
 * Determines spot type from Horizn tags
 * Checks moves, area, and warning tags for type indicators
 */
function determineSpotType(horiznSpot: HoriznSpotData): string {
  const allTags = [
    ...(horiznSpot.tags_area || []),
    ...(horiznSpot.tags_moves || []),
    ...(horiznSpot.tags_warnings || []),
  ];

  // Check for specific type matches
  for (const tag of allTags) {
    if (HORIZN_TAG_TO_SPOT_TYPE[tag]) {
      return HORIZN_TAG_TO_SPOT_TYPE[tag];
    }
  }

  // Default to urban-landscape for parkour spots without specific type
  return "urban-landscape";
}

/**
 * Builds a rich description from Horizn data
 * Combines description with categorized tags
 */
function buildDescription(
  horiznSpot: HoriznSpotData,
  defaultLocale: string
): SpotSchema["description"] | undefined {
  const parts: string[] = [];

  if (horiznSpot.description) {
    parts.push(horiznSpot.description);
  }

  // Add moves as comma-separated list
  const moves = horiznSpot.tags_moves || [];
  if (moves.length > 0) {
    parts.push(`\n\nPossible moves: ${moves.join(", ")}`);
  }

  // Add area features
  const area = horiznSpot.tags_area || [];
  if (area.length > 0) {
    parts.push(`\n\nArea features: ${area.join(", ")}`);
  }

  // Add warnings with emoji
  const warnings = horiznSpot.tags_warnings || [];
  if (warnings.length > 0) {
    parts.push(`\n\n⚠️ Warnings: ${warnings.join(", ")}`);
  }

  const fullDescription = parts.join("").trim();

  if (!fullDescription) {
    return undefined;
  }

  return { [defaultLocale]: fullDescription };
}

/**
 * Calculates tile coordinates for map clustering at multiple zoom levels
 * Required for efficient map rendering
 */
function calculateTileCoordinates(
  lat: number,
  lng: number
): SpotSchema["tile_coordinates"] {
  const tiles: any = {};
  const zoomLevels = [2, 4, 6, 8, 10, 12, 14, 16];

  zoomLevels.forEach((zoom) => {
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lng + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
        n
    );
    tiles[`z${zoom}`] = { x, y };
  });

  return tiles;
}

/**
 * Transforms Horizn spot data to PK Spot schema
 *
 * This is the main transformation function that converts Horizn's format
 * into our SpotSchema with all required fields and proper typing.
 *
 * @param horiznSpot - Raw spot data from Horizn export
 * @param config - Import configuration
 * @returns SpotSchema object ready for Firestore
 * @throws Error if required fields are missing
 */
export function transformHoriznSpot(
  horiznSpot: HoriznSpotData,
  config: ImportConfig
): Omit<SpotSchema, "media"> {
  const { latitude, longitude, name } = horiznSpot;

  // Validate required fields
  if (!latitude || !longitude || !name) {
    throw new Error("Missing required fields: name, latitude, or longitude");
  }

  // Build the base spot document with required fields
  const spotDoc: any = {
    name: { [config.defaultLocale]: name },
    location: new GeoPoint(latitude, longitude),
    tile_coordinates: calculateTileCoordinates(latitude, longitude),
    time_created: Timestamp.now(),
    time_updated: Timestamp.now(),
  };

  // Add optional description
  const description = buildDescription(horiznSpot, config.defaultLocale);
  if (description) {
    spotDoc.description = description;
  }

  // Determine and set spot type
  const type = determineSpotType(horiznSpot);
  if (type) {
    spotDoc.type = type;
  }

  // Default to public access
  spotDoc.access = "public";

  // Preserve original Horizn metadata in external_references
  // This allows us to trace back to original data if needed
  if (
    horiznSpot.tags_moves?.length ||
    horiznSpot.tags_area?.length ||
    horiznSpot.tags_warnings?.length
  ) {
    spotDoc.external_references = {
      ...spotDoc.external_references,
      horizn_tags: {
        moves: horiznSpot.tags_moves || [],
        area: horiznSpot.tags_area || [],
        warnings: horiznSpot.tags_warnings || [],
      } as any,
    };
  }

  return spotDoc;
}

/**
 * Extracts image filenames from Horizn spot data
 * Removes the 'spots_pics/' prefix to get just the filename
 *
 * @param horiznSpot - Horizn spot data
 * @returns Array of image filenames
 */
export function getHoriznImages(horiznSpot: HoriznSpotData): string[] {
  if (!horiznSpot.pictures || !Array.isArray(horiznSpot.pictures)) {
    return [];
  }

  return horiznSpot.pictures.map((path) => path.replace("spots_pics/", ""));
}
