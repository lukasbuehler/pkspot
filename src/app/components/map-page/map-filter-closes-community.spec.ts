import { describe, expect, it, vi } from "vitest";
import { MapPageComponent } from "./map-page.component";

describe("map filter chips while a community is open", () => {
  it("closes the community panel and applies the filter to the current area", () => {
    const page = { closeCommunityPanel: vi.fn(), filterChipChanged: vi.fn(), eventFilterChanged: vi.fn() };
    MapPageComponent.prototype.onFilterChipSelected.call(page as unknown as MapPageComponent, "dry");
    expect(page.closeCommunityPanel).toHaveBeenCalledOnce();
    expect(page.filterChipChanged).toHaveBeenCalledWith("dry");

    MapPageComponent.prototype.onEventFilterChipSelected.call(page as unknown as MapPageComponent, "jam");
    expect(page.closeCommunityPanel).toHaveBeenCalledTimes(2);
    expect(page.eventFilterChanged).toHaveBeenCalledWith("jam");
  });

  it("keeps the community open when a filter is cleared", () => {
    const page = { closeCommunityPanel: vi.fn(), filterChipChanged: vi.fn() };
    MapPageComponent.prototype.onFilterChipSelected.call(page as unknown as MapPageComponent, "");
    expect(page.closeCommunityPanel).not.toHaveBeenCalled();
    expect(page.filterChipChanged).toHaveBeenCalledWith("");
  });
});
