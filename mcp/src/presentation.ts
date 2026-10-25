import { record, type Document } from "./data";

/** Retain the typed API contract while explaining tri-state fields to the model. */
export function describeResult(result: Document): string {
  const readable = (value: unknown): Document => {
    const item = { ...record(value) };
    if (item.amenity_status) {
      item.amenities = item.amenity_status;
      delete item.amenity_status;
      item.amenity_note =
        "Listed information: yes means listed present, no means listed absent, not specified means unknown. Do not infer missing amenities.";
    }
    if (record(item.timing).mode === "date_only") {
      delete item.start;
      delete item.end;
    }
    return item;
  };
  if (result.item === null)
    return "No publicly available record was found for this ID.";
  return JSON.stringify({
    ...result,
    ...(result.item ? { item: readable(result.item) } : {}),
    ...(Array.isArray(result.items)
      ? {
          items: result.items.map(readable),
          ...(result.items.length
            ? {}
            : { message: "No matches in this bounded search." }),
        }
      : {}),
  });
}
