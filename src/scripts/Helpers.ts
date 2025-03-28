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
