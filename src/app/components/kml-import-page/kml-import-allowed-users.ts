export const KML_IMPORT_ALLOWED_USER_IDS: string[] = [
  "rh6V9SoyxpWJ1axNAiyfzkPptsy2",
];

export function isKmlImportUserAllowed(uid: string | null | undefined): boolean {
  if (!uid) {
    return false;
  }
  return KML_IMPORT_ALLOWED_USER_IDS.includes(uid);
}

