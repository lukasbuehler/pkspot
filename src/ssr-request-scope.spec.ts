import { describe, expect, it, vi } from "vitest";
import { SsrRequestScope } from "./ssr-request-scope";

describe("SSR request cleanup", () => {
  it("awaits all cleanup and closes only its own resources, once", async () => {
    const first = new SsrRequestScope();
    const second = new SsrRequestScope();
    const otherCleanup = vi.fn(() => Promise.resolve());
    let release!: () => void;
    const cleanup = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    first.onClose(cleanup);
    second.onClose(otherCleanup);
    let closed = false;
    const closing = first.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    release();
    await closing;
    await first.close();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(otherCleanup).not.toHaveBeenCalled();
    await second.close();
    expect(otherCleanup).toHaveBeenCalledOnce();
  });

  it("still closes the remaining resources when one cleanup fails", async () => {
    const scope = new SsrRequestScope();
    const cleanup = vi.fn(() => Promise.resolve());
    scope.onClose(async () => {
      throw new Error("cleanup failed");
    });
    scope.onClose(cleanup);
    await expect(scope.close()).rejects.toThrow("SSR cleanup failed");
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
