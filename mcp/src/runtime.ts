// Small structural interfaces keep the domain code portable and tests independent
// of Cloudflare globals. Only the Worker and quota adapter use these bindings.
export interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  transaction<T>(callback: (storage: Storage) => Promise<T>): Promise<T>;
  setAlarm(time: number): Promise<void>;
  deleteAll(): Promise<void>;
}
export interface Environment {
  PUBLIC_ORIGIN: string;
  TYPESENSE_ORIGIN: string;
  TYPESENSE_SEARCH_KEY: string;
  FIRESTORE_PROJECT_ID: string;
  QUOTA_SECRET: string;
  POSTHOG_API_KEY?: string;
  POSTHOG_HOST?: string;
  QUOTAS: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
}
export interface Execution {
  waitUntil(task: Promise<unknown>): void;
}
export class ServiceError extends Error {
  constructor(public readonly code: "unavailable" | "invalid_area" | "invalid_dates") {
    super(code);
  }
}
