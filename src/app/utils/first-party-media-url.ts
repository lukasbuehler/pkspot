import { environment } from "../../environments/environment";

const FALLBACK_FIRST_PARTY_STORAGE_BUCKETS = ["parkour-base-project.appspot.com"];

function firstPartyStorageBuckets(): Set<string> {
  return new Set(
    [
      environment.keys.firebaseConfig.storageBucket,
      ...FALLBACK_FIRST_PARTY_STORAGE_BUCKETS,
    ].filter((bucket): bucket is string => Boolean(bucket)),
  );
}

export function isFirstPartyStorageUrl(src: string | null | undefined): boolean {
  if (!src) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }

  const buckets = firstPartyStorageBuckets();
  if (url.hostname === "firebasestorage.googleapis.com") {
    const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o(?:\/|$)/);
    return match ? buckets.has(decodeURIComponent(match[1])) : false;
  }

  if (url.hostname === "storage.googleapis.com") {
    const bucket = url.pathname.split("/").filter(Boolean)[0];
    return bucket ? buckets.has(decodeURIComponent(bucket)) : false;
  }

  return false;
}
