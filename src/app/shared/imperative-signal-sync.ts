import { effect, Signal, untracked } from "@angular/core";

/**
 * Synchronizes an external signal with an imperative API without subscribing
 * to signals that the imperative update happens to read internally.
 */
export function bindSignalToImperativeApi<T>(
  source: Signal<T>,
  apply: (value: T) => void,
): void {
  effect(() => {
    const value = source();
    untracked(() => apply(value));
  });
}
