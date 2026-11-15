import { Observable, catchError, of, timeout } from "rxjs";

/**
 * Local screenshot and UI-review runs sign in a synthetic user that the real
 * backend does not know. Its private reads fail or never answer, which left
 * review screens showing load errors that real users do not see. This makes
 * such reads resolve as empty (the screen's real empty state) and turns writes
 * into local no-ops, so a review run can neither fail on nor change backend
 * data. Installed only when `isLocalScreenshotRun()` is true.
 */
const READ_EMPTY_AFTER_MS = 8_000;

type AnyFn = (...args: unknown[]) => unknown;

const PROMISE_READS: Record<string, () => unknown> = {
  getDocument: () => null,
  getCollection: () => [],
  getCollectionGroup: () => [],
  getCollectionWithMetadata: () => ({ data: [], lastDoc: null }),
  getCollectionGroupWithMetadata: () => ({ data: [], lastDoc: null }),
};

const OBSERVABLE_READS: Record<string, () => unknown> = {
  documentSnapshots: () => null,
  collectionSnapshots: () => [],
  collectionGroupSnapshots: () => [],
  collectionGroupSnapshotsWithMetadata: () => [],
};

const WRITES: Record<string, (...args: unknown[]) => unknown> = {
  setDocument: () => undefined,
  updateDocument: () => undefined,
  deleteDocument: () => undefined,
  addDocument: (collectionPath) =>
    `screenshot-${String(collectionPath).split("/").pop()}-${Date.now()}`,
};

export function installScreenshotFirestoreFallbacks(target: object): void {
  const host = target as Record<string, AnyFn>;

  for (const [name, empty] of Object.entries(PROMISE_READS)) {
    const original = host[name]?.bind(target);
    if (!original) continue;
    host[name] = (...args: unknown[]) =>
      Promise.race([
        Promise.resolve(original(...args)).catch(() => empty()),
        new Promise((resolve) =>
          setTimeout(() => resolve(empty()), READ_EMPTY_AFTER_MS),
        ),
      ]);
  }

  for (const [name, empty] of Object.entries(OBSERVABLE_READS)) {
    const original = host[name]?.bind(target);
    if (!original) continue;
    host[name] = (...args: unknown[]) =>
      (original(...args) as Observable<unknown>).pipe(
        timeout({ first: READ_EMPTY_AFTER_MS, with: () => of(empty()) }),
        catchError(() => of(empty())),
      );
  }

  for (const [name, result] of Object.entries(WRITES)) {
    if (!host[name]) continue;
    host[name] = async (...args: unknown[]) => result(...args);
  }
}
