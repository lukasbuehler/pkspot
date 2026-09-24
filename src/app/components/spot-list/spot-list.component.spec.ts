import { NO_ERRORS_SCHEMA } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, RouterLink } from "@angular/router";
import { describe, it, expect, vi } from "vitest";
import { SpotListComponent } from "./spot-list.component";

describe("delegated spot card activation", () => {
  for (const button of [0, -1]) {
    it(`handles primary activation with button ${button} without a document navigation`, () => {
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
      TestBed.overrideComponent(SpotListComponent, {
        set: { imports: [RouterLink], schemas: [NO_ERRORS_SCHEMA] },
      });
      const fixture = TestBed.createComponent(SpotListComponent);
      fixture.componentRef.setInput("withHrefLink", false);
      fixture.componentRef.setInput("highlightedSpots", [{ id: "example", name: "Example" }]);
      fixture.detectChanges();
      const selected = vi.fn();
      fixture.componentInstance.spotClick.subscribe(selected);
      const event = new MouseEvent("click", { button, bubbles: true, cancelable: true });
      fixture.nativeElement.querySelector("a").dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(selected).toHaveBeenCalledOnce();
      fixture.destroy();
    });
  }
});
