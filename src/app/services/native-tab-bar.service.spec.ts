import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import {
  NATIVE_TAB_BAR_PLATFORM,
  NATIVE_TAB_BAR_PLUGIN,
  NativeTabBarService,
} from "./native-tab-bar.service";
import type { NativeTabBarState, NativeTabDestination } from "../features/native-tab-bar";

function setup(platform: string, available = true) {
  let tabListener: ((event: { id: string }) => void) | undefined;
  const plugin = {
    isAvailable: vi.fn(async () => ({ available })),
    configure: vi.fn(async () => undefined),
    addListener: vi.fn(async (_event: string, listener: (event: { id: string }) => void) => {
      tabListener = listener;
      return { remove: vi.fn(async () => undefined) };
    }),
  };
  const dialogs = { afterOpened: new Subject<void>(), afterAllClosed: new Subject<void>() };
  TestBed.configureTestingModule({
    providers: [
      { provide: NATIVE_TAB_BAR_PLUGIN, useValue: plugin },
      { provide: NATIVE_TAB_BAR_PLATFORM, useValue: platform },
      { provide: MatDialog, useValue: dialogs },
    ],
  });
  const service = TestBed.inject(NativeTabBarService);
  return { service, plugin, dialogs, tap: (id: string) => tabListener?.({ id }) };
}

const state: NativeTabBarState = {
  items: [{ id: "map", title: "Map", symbol: "map", badge: false }],
  overflow: [],
  selectedId: "map",
  hidden: false,
  colors: { selected: "#b4c5ff", unselected: "#c4c6d0", background: "#1d2024" },
};

describe("NativeTabBarService", () => {
  it.each(["web", "android"])("stays off on %s without asking native", async (platform) => {
    const { service, plugin } = setup(platform);
    await Promise.resolve();

    expect(service.available()).toBe(false);
    expect(plugin.isAvailable).not.toHaveBeenCalled();
    service.configure(state);
    expect(plugin.configure).not.toHaveBeenCalled();
  });

  it("stays off on iOS devices without the native bar (iPad, Mac)", async () => {
    const { service, plugin } = setup("ios", false);
    await vi.waitFor(() => expect(plugin.isAvailable).toHaveBeenCalled());
    await Promise.resolve();

    expect(service.available()).toBe(false);
    expect(plugin.addListener).not.toHaveBeenCalled();
  });

  it("forwards native tab taps and sends only changed state", async () => {
    const { service, plugin, tap } = setup("ios");
    await vi.waitFor(() => expect(service.available()).toBe(true));
    const selections: string[] = [];
    service.selections.subscribe((id) => selections.push(id));

    tap("events");
    expect(selections).toEqual(["events"]);

    service.configure(state);
    service.configure({ ...state });
    expect(plugin.configure).toHaveBeenCalledTimes(1);
    service.configure({ ...state, selectedId: null });
    expect(plugin.configure).toHaveBeenCalledTimes(2);
    expect(plugin.configure).toHaveBeenLastCalledWith({ ...state, selectedId: null });
  });

  it("hides the bar while dialogs or full-screen flows are open", async () => {
    const { service, dialogs } = setup("ios");
    expect(service.hidden()).toBe(false);

    dialogs.afterOpened.next();
    expect(service.hidden()).toBe(true);
    dialogs.afterAllClosed.next();
    expect(service.hidden()).toBe(false);

    const release = service.requestHidden();
    const second = service.requestHidden();
    expect(service.hidden()).toBe(true);
    release();
    release();
    expect(service.hidden()).toBe(true);
    second();
    expect(service.hidden()).toBe(false);
  });

  it("follows route changes and hides when another navigation owns the layout", async () => {
    const { service, plugin, dialogs } = setup("ios");
    await vi.waitFor(() => expect(service.available()).toBe(true));
    const url = signal("/map");
    const ownsNavigation = signal(true);
    const destinations = (): NativeTabDestination[] =>
      ["map", "events"].map((id) => ({
        id, name: id, icon: id, active: url().startsWith(`/${id}`),
      }));
    TestBed.runInInjectionContext(() =>
      service.bind({ destinations, ownsNavigation, moreTitle: () => "More" }),
    );
    const last = () => plugin.configure.mock.lastCall?.[0] as NativeTabBarState | undefined;

    TestBed.tick();
    expect(last()).toMatchObject({ selectedId: "map", hidden: false });

    url.set("/events/swissjam25");
    TestBed.tick();
    expect(last()).toMatchObject({ selectedId: "events", hidden: false });

    ownsNavigation.set(false); // e.g. the short Alain layout
    TestBed.tick();
    expect(last()).toMatchObject({ hidden: true });

    ownsNavigation.set(true);
    dialogs.afterOpened.next();
    TestBed.tick();
    expect(last()).toMatchObject({ hidden: true });
    dialogs.afterAllClosed.next();
    TestBed.tick();
    expect(last()).toMatchObject({ selectedId: "events", hidden: false });
  });

  it("never exposes the Capacitor proxy to DI lifecycle hooks", () => {
    // The proxy answers every property, so an injector would call its
    // "ngOnDestroy" and crash SSR with an unimplemented-plugin rejection.
    const plugin = TestBed.inject(NATIVE_TAB_BAR_PLUGIN) as unknown as Record<string, unknown>;
    expect(plugin["ngOnDestroy"]).toBeUndefined();
    expect(plugin["then"]).toBeUndefined();
  });
});
