import type { DestroyRef } from "@angular/core";

/** Loads dialog code on interaction, without opening duplicates or stale dialogs. */
export function createLazyDialogOpener<T>(
  load: () => Promise<T>,
  open: (component: T) => void,
  owner: Pick<DestroyRef, "destroyed">,
): () => Promise<void> {
  let loading = false;
  return async () => {
    if (loading || owner.destroyed) return;
    loading = true;
    try {
      const component = await load();
      if (!owner.destroyed) open(component);
    } finally {
      // A failed chunk request must allow a subsequent click to retry.
      loading = false;
    }
  };
}
