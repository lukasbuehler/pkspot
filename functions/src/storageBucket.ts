const DEFAULT_PROJECT_ID = "parkour-base-project";

const getProjectId = (): string =>
  process.env.GCLOUD_PROJECT ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  DEFAULT_PROJECT_ID;

export const DEFAULT_STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ??
  process.env.STORAGE_BUCKET ??
  `${getProjectId()}.appspot.com`;
