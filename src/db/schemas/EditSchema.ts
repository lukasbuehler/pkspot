export const EDIT_SCHEMA_VERSION = 1 as const;

export type EditTargetType = "spot" | "event" | "community";
export type EditVisibility = "public" | "private";

export interface EditTargetMetadata<
  TTargetType extends EditTargetType = EditTargetType,
> {
  target_type: TTargetType;
  target_id: string;
  schema_version: typeof EDIT_SCHEMA_VERSION;
}

/**
 * Existing spot edits predate the shared edit target contract. These fields
 * stay optional on reads until the maintenance backfill has covered every
 * deployed environment and older clients have aged out.
 */
export interface LegacyCompatibleEditTargetMetadata<
  TTargetType extends EditTargetType,
> {
  target_type?: TTargetType;
  target_id?: string;
  schema_version?: typeof EDIT_SCHEMA_VERSION;
}
