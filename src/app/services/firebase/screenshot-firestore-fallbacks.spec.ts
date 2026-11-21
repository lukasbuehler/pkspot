import { NEVER, Observable, firstValueFrom, throwError } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installScreenshotFirestoreFallbacks } from "./screenshot-firestore-fallbacks";

class FakeAdapter {
  writes = 0;
  async getDocument(): Promise<unknown> {
    throw new Error("permission-denied");
  }
  async getCollection(): Promise<unknown[]> {
    return [{ id: "real" }];
  }
  collectionSnapshots(): Observable<unknown[]> {
    return NEVER;
  }
  documentSnapshots(): Observable<unknown> {
    return throwError(() => new Error("permission-denied"));
  }
  async setDocument(): Promise<void> {
    this.writes++;
  }
}

describe("installScreenshotFirestoreFallbacks", () => {
  afterEach(() => vi.useRealTimers());

  it("turns failed reads into empty results and keeps successful ones", async () => {
    const adapter = new FakeAdapter();
    installScreenshotFirestoreFallbacks(adapter);

    await expect(adapter.getDocument()).resolves.toBeNull();
    await expect(adapter.getCollection()).resolves.toEqual([{ id: "real" }]);
    await expect(firstValueFrom(adapter.documentSnapshots())).resolves.toBeNull();
  });

  it("answers a silent listener with an empty list", async () => {
    vi.useFakeTimers();
    const adapter = new FakeAdapter();
    installScreenshotFirestoreFallbacks(adapter);

    const result = firstValueFrom(adapter.collectionSnapshots());
    await vi.advanceTimersByTimeAsync(8_000);

    await expect(result).resolves.toEqual([]);
  });

  it("keeps writes local", async () => {
    const adapter = new FakeAdapter();
    installScreenshotFirestoreFallbacks(adapter);

    await adapter.setDocument();

    expect(adapter.writes).toBe(0);
  });
});
