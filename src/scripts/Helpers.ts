import { MediaType } from "../db/models/Interfaces";
import {
  AnyMedia,
  ExternalImage,
  ExternalVideo,
  StorageImage,
  StorageVideo,
} from "../db/models/Media";
import { MediaSchema } from "../db/schemas/Media";
import { UserReferenceSchema } from "../db/schemas/UserSchema";
import { User } from "../db/models/User";

export function getValueFromEventTarget(
  eventTarget: EventTarget | null | undefined
): string | undefined {
  if (!eventTarget) return undefined;

  return (eventTarget as HTMLInputElement).value;
}

export function transformFirestoreData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;

  if ("fields" in data) {
    data = data.fields;
  }

  // Assume data is an object of key -> FirestoreValue
  const result: any = {};
  for (const key of Object.keys(data)) {
    result[key] = transformFirestoreField(data[key]);
  }
  return result;
}

function transformFirestoreField(field: any): any {
  if (field === null || field === undefined) return field;

  if ("stringValue" in field) {
    return field.stringValue;
  }
  if ("integerValue" in field) {
    return parseInt(field.integerValue, 10);
  }
  if ("doubleValue" in field) {
    return field.doubleValue;
  }
  if ("booleanValue" in field) {
    return field.booleanValue;
  }
  if ("geoPointValue" in field) {
    return {
      latitude: field.geoPointValue.latitude,
      longitude: field.geoPointValue.longitude,
    };
  }
  if ("arrayValue" in field) {
    const values = field.arrayValue.values || [];
    // Build a new array from scratch
    const arr: any[] = [];
    for (const item of values) {
      arr.push(transformFirestoreField(item));
    }
    return arr;
  }
  if ("mapValue" in field) {
    const fields = field.mapValue.fields || {};
    // Build a new object from scratch
    const obj: any = {};
    for (const subKey of Object.keys(fields)) {
      obj[subKey] = transformFirestoreField(fields[subKey]);
    }
    return obj;
  }
  // If none of the above keys are present, return the field as is.
  return field;
}

export function humanTimeSince(date: Date): string {
  var seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  var interval = seconds / 31536000;

  if (interval > 1) {
    return Math.floor(interval) + " years";
  }
  interval = seconds / 2592000;
  if (interval > 1) {
    return Math.floor(interval) + " months";
  }
  interval = seconds / 86400;
  if (interval > 1) {
    return Math.floor(interval) + " days";
  }
  interval = seconds / 3600;
  if (interval > 1) {
    return Math.floor(interval) + " hours";
  }
  interval = seconds / 60;
  if (interval > 1) {
    return Math.floor(interval) + " minutes";
  }
  return Math.floor(seconds) + " seconds";
}

export function humanFileSize(bytes: number, si?: boolean): string {
  var thresh = si ? 1000 : 1024;
  if (Math.abs(bytes) < thresh) {
    return bytes + " B";
  }
  var units = si
    ? ["kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]
    : ["KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
  var u = -1;
  do {
    bytes /= thresh;
    ++u;
  } while (Math.abs(bytes) >= thresh && u < units.length - 1);
  return bytes.toFixed(1) + " " + units[u];
}

export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const emailVerificationRegex =
  /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;

export function isEmailValid(email: string): boolean {
  return RegExp(emailVerificationRegex).test(email);
}

export function isoCountryCodeToFlagEmoji(country: string) {
  return String.fromCodePoint(
    ...[...country.toUpperCase()].map((c) => c.charCodeAt(0) + 0x1f1a5)
  );
}

export function isMobileDevice() {
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
    navigator.userAgent.toLowerCase()
  );
}

export function isBot(): boolean {
  if (typeof navigator === "undefined") return false;
  return /bot|googlebot|crawler|spider|robot|crawling/i.test(
    navigator.userAgent
  );
}

export function makeAnyMediaFromMediaSchema(
  mediaSchema: MediaSchema
): AnyMedia {
  if (!mediaSchema) {
    throw new Error("mediaSchema is null");
  }
  if (mediaSchema.isInStorage ?? true) {
    if (mediaSchema.type === MediaType.Image) {
      return new StorageImage(
        mediaSchema.src,
        mediaSchema.uid,
        (mediaSchema.origin as "user" | "other") ?? "other"
      );
    } else if (mediaSchema.type === MediaType.Video) {
      return new StorageVideo(
        mediaSchema.src,
        mediaSchema.uid,
        (mediaSchema.origin as "user" | "other") ?? "other"
      );
    } else {
      throw new Error("Unknown media type for storage media");
    }
  } else {
    if (mediaSchema.type === MediaType.Image) {
      return new ExternalImage(
        mediaSchema.src,
        mediaSchema.uid,
        mediaSchema.origin
      );
    } else if (mediaSchema.type === MediaType.Video) {
      return new ExternalVideo(
        mediaSchema.src,
        mediaSchema.uid,
        mediaSchema.origin
      );
    } else {
      throw new Error("Unknown media type for external media");
    }
  }
}

export function removeUndefinedProperties<T>(obj: object): object {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => value !== undefined)
  );
}

/**
 * Returns the locale prefix from the current pathname if it matches a supported locale,
 * e.g. "/en" or "/de-CH". Returns an empty string when no locale prefix is present.
 * Note: Keep this list in sync with the app's supported languages.
 */
export function detectLocalePrefixFromPath(): string {
  if (typeof window === "undefined") return "";
  const segments = window.location.pathname.split("/");
  const maybeLocale = segments[1];
  // Supported locales in this app
  const supported = new Set(["en", "de", "de-CH", "fr", "it", "es", "nl"]);
  if (supported.has(maybeLocale)) {
    return `/${maybeLocale}`;
  }
  return "";
}

/**
 * Builds an absolute URL for the app that is domain-agnostic and preserves the
 * current locale prefix (when present). Path can be with or without leading slash.
 */
export function buildAppUrl(path: string): string {
  if (typeof window === "undefined") {
    // Fallback: return path as-is to avoid hardcoding domains during SSR
    return path.startsWith("/") ? path : `/${path}`;
  }
  const origin = window.location.origin;
  const localePrefix = detectLocalePrefixFromPath();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${localePrefix}${normalizedPath}`;
}

/**
 * Builds an absolute URL for sharing that is domain-agnostic and intentionally
 * omits any locale prefix so the receiver's browser/app chooses the language.
 */
export function buildAbsoluteUrlNoLocale(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (typeof window === "undefined") {
    // On SSR return a root-relative path; caller can prepend origin if needed.
    return normalizedPath;
  }

  // In Capacitor, window.location.origin is "capacitor://localhost" - use production domain
  const origin = window.location.origin;
  const isCapacitor =
    origin.startsWith("capacitor://") || origin.includes("localhost");
  const shareOrigin = isCapacitor ? "https://pkspot.app" : origin;

  return `${shareOrigin}${normalizedPath}`;
}

/**
 * Clean data for Firestore by:
 * 1. Removing forbidden fields (those that should not be user-editable)
 * 2. Removing undefined values (Firestore doesn't accept them)
 * 3. Converting class instances to plain objects
 *
 * @param data - The data to clean
 * @param forbiddenFields - Array of field names to remove
 * @returns Cleaned data suitable for Firestore
 */
export function cleanDataForFirestore(
  data: any,
  forbiddenFields?: string[]
): any {
  if (data === null || data === undefined) {
    return data;
  }

  // First pass: remove forbidden fields if specified
  if (forbiddenFields && forbiddenFields.length > 0) {
    const cleaned: any = { ...data };
    for (const field of forbiddenFields) {
      delete cleaned[field];
    }
    data = cleaned;
  }

  // Second pass: clean for Firestore (remove undefined, convert instances)
  return _cleanObjectForFirestore(data);
}

/**
 * Recursively clean an object for Firestore serialization.
 * Removes undefined values and converts class instances to plain objects.
 * Filters out functions, getters, and Signal properties.
 * Preserves special Firestore types like GeoPoint and Timestamp.
 *
 * @param data - The data to clean
 * @returns Cleaned data
 */
function _cleanObjectForFirestore(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  // Leave Firestore special types as-is (check for common ones)
  // GeoPoint and Timestamp are from firebase/firestore
  if (
    data._type === "GeoPoint" ||
    data._type === "Timestamp" ||
    data instanceof Date
  ) {
    return data;
  }

  if (typeof data === "object") {
    // Handle objects with toJSON method
    if (data.toJSON && typeof data.toJSON === "function") {
      return _cleanObjectForFirestore(data.toJSON());
    }

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map((item) => _cleanObjectForFirestore(item));
    }

    // Handle plain objects and class instances
    const cleaned: any = {};

    // Get all properties from the object (including inherited ones)
    for (const key of Object.keys(data)) {
      const value = data[key];

      // Skip undefined values - Firestore doesn't accept them
      if (value === undefined) {
        continue;
      }

      // Skip functions (including methods and getters that return functions)
      if (typeof value === "function") {
        continue;
      }

      // Skip Signal objects (they have a specific structure)
      // Signals are Angular reactive values and should not be serialized
      if (
        value &&
        typeof value === "object" &&
        (value._value !== undefined ||
          value._signal !== undefined ||
          value.isSignal === true)
      ) {
        continue;
      }

      cleaned[key] = _cleanObjectForFirestore(value);
    }

    return cleaned;
  }

  return data;
}

/**
 * Create a UserReferenceSchema from a User object.
 * Properly formats the profile picture URL with the 200x200 size.
 *
 * @param user - The User object to create a reference from
 * @returns UserReferenceSchema with uid, display_name, and profile_picture (if available)
 */
export function createUserReference(user: User): UserReferenceSchema {
  const reference: UserReferenceSchema = {
    uid: user.uid,
    display_name: user.displayName || "",
  };

  // Add profile picture if available
  if (user.data?.profile_picture) {
    try {
      // Create a StorageImage to properly format the profile picture URL with size
      const profileImage = new StorageImage(user.data.profile_picture);
      reference.profile_picture = profileImage.getSrc(200); // 200x200 size for profile pictures
    } catch (error) {
      // If profile picture URL is invalid for StorageImage, use as-is
      console.warn("Invalid profile picture URL format:", error);
      reference.profile_picture = user.data.profile_picture;
    }
  }

  return reference;
}
