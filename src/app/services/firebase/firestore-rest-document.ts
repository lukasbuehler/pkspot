import { FirebaseError } from "firebase/app";
import { Bytes, GeoPoint, Timestamp } from "firebase/firestore";

/** A value in the Firestore REST API's JSON document format. */
type FirestoreRestValue = Record<string, unknown>;

export interface FirestoreRestDocument {
  name: string;
  fields?: Record<string, FirestoreRestValue>;
}

/**
 * Builds an error with the code the web SDK reports, such as
 * `permission-denied`, because callers treat those codes as meaningful: rules
 * deny reads of events that do not exist, which must stay a not-found page.
 */
export async function firestoreRestError(
  response: Response,
): Promise<FirebaseError> {
  const body = (await response.json().catch(() => null)) as {
    error?: { status?: unknown };
  } | null;
  const status = body?.error?.status;
  const code =
    typeof status === "string"
      ? status.toLowerCase().replaceAll("_", "-")
      : "unknown";
  return new FirebaseError(
    code,
    `Firestore REST read failed: ${response.status} ${code}`,
  );
}

/**
 * Decodes a Firestore REST document's fields into the same value types the web
 * SDK returns, so server-rendered data serializes and hydrates identically.
 * `toReference` lets callers create references without loading an SDK client
 * for the documents that have none.
 */
export function decodeFirestoreRestFields(
  fields: Record<string, FirestoreRestValue> | undefined,
  toReference: (path: string) => unknown,
): Record<string, unknown> {
  const decoded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    decoded[key] = decodeValue(value, toReference);
  }
  return decoded;
}

function decodeValue(
  value: FirestoreRestValue,
  toReference: (path: string) => unknown,
): unknown {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value["booleanValue"];
  if ("stringValue" in value) return value["stringValue"];
  if ("integerValue" in value) return Number(value["integerValue"]);
  if ("doubleValue" in value) return Number(value["doubleValue"]);
  if ("timestampValue" in value) {
    return decodeTimestamp(value["timestampValue"] as string);
  }
  if ("geoPointValue" in value) {
    const point = value["geoPointValue"] as {
      latitude?: number;
      longitude?: number;
    };
    return new GeoPoint(point.latitude ?? 0, point.longitude ?? 0);
  }
  if ("bytesValue" in value) {
    return Bytes.fromBase64String(value["bytesValue"] as string);
  }
  if ("referenceValue" in value) {
    const name = value["referenceValue"] as string;
    return toReference(name.slice(name.indexOf("/documents/") + 11));
  }
  if ("arrayValue" in value) {
    const array = value["arrayValue"] as { values?: FirestoreRestValue[] };
    return (array.values ?? []).map((entry) =>
      decodeValue(entry, toReference),
    );
  }
  if ("mapValue" in value) {
    const map = value["mapValue"] as {
      fields?: Record<string, FirestoreRestValue>;
    };
    return decodeFirestoreRestFields(map.fields, toReference);
  }
  throw new Error(
    `Unsupported Firestore REST value: ${Object.keys(value).join(",")}`,
  );
}

function decodeTimestamp(value: string): Timestamp {
  const seconds = Math.floor(Date.parse(value) / 1000);
  // REST timestamps carry up to nanosecond precision, which Date would drop.
  const fraction = /\.(\d{1,9})/u.exec(value)?.[1] ?? "";
  return new Timestamp(seconds, Number(fraction.padEnd(9, "0") || 0));
}
