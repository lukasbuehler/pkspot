import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface FieldOverride {
  collectionGroup?: string;
  fieldPath?: string;
  indexes?: { order?: string; queryScope?: string }[];
}

describe("Firestore index contracts", () => {
  it("supports listing a user's reports across Spot and media collections", () => {
    const config = JSON.parse(readFileSync("firestore.indexes.json", "utf8")) as {
      fieldOverrides: FieldOverride[];
    };
    const index = config.fieldOverrides.find(
      field => field.collectionGroup === "reports" && field.fieldPath === "user.uid",
    );
    expect(index?.indexes).toContainEqual({
      order: "ASCENDING",
      queryScope: "COLLECTION_GROUP",
    });
  });

  it.each(["registrations", "rsvps"])(
    "supports %s notification migration lookups by user",
    (collectionGroup) => {
      const config = JSON.parse(
        readFileSync("firestore.indexes.json", "utf8"),
      ) as { fieldOverrides?: FieldOverride[] };
      const override = config.fieldOverrides?.find(
        (candidate) =>
          candidate.collectionGroup === collectionGroup &&
          candidate.fieldPath === "user_id",
      );

      expect(override?.indexes).toContainEqual({
        order: "ASCENDING",
        queryScope: "COLLECTION_GROUP",
      });
    },
  );
});
