import { describe, expect, it, vi } from "vitest";
import { createLazyDialogOpener } from "./create-lazy-dialog-opener";

describe("createLazyDialogOpener", () => {
  it("loads only on interaction and coalesces clicks during loading", async () => {
    const pending = Promise.withResolvers<string>();
    const load = vi.fn(() => pending.promise);
    const open = vi.fn();
    const trigger = createLazyDialogOpener(load, open, { destroyed: false });
    expect(load).not.toHaveBeenCalled();
    const first = trigger();
    await trigger();
    expect(load).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    pending.resolve("dialog");
    await first;
    expect(open).toHaveBeenCalledExactlyOnceWith("dialog");
  });

  it("does not open a dialog when its page disappears during loading", async () => {
    const pending = Promise.withResolvers<string>();
    const owner = { destroyed: false };
    const open = vi.fn();
    const trigger = createLazyDialogOpener(() => pending.promise, open, owner);
    const result = trigger();
    owner.destroyed = true;
    pending.resolve("dialog");
    await result;
    expect(open).not.toHaveBeenCalled();
  });

  it("does not request code for an already destroyed page", async () => {
    const load = vi.fn(async () => "dialog");
    await createLazyDialogOpener(load, vi.fn(), { destroyed: true })();
    expect(load).not.toHaveBeenCalled();
  });

  it("propagates a loading failure and allows a retry", async () => {
    const load = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("dialog");
    const open = vi.fn();
    const trigger = createLazyDialogOpener(load, open, { destroyed: false });
    await expect(trigger()).rejects.toThrow("offline");
    await trigger();
    expect(open).toHaveBeenCalledExactlyOnceWith("dialog");
  });
});
