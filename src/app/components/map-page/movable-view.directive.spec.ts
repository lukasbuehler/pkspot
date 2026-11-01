import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  signal,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { NgTemplateOutlet } from "@angular/common";
import { MatSidenavModule } from "@angular/material/sidenav";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { describe, expect, it } from "vitest";
import type { MapPanelLayout } from "../../features/navigation-layout";
import {
  MovableViewHostDirective,
  MovableViewOutletDirective,
} from "./movable-view.directive";

let created = { map: 0, panel: 0 };
let destroyed = { map: 0, panel: 0 };

@Component({
  selector: "app-test-map",
  template: "map",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestMapComponent implements OnDestroy {
  constructor() {
    created.map++;
  }
  ngOnDestroy(): void {
    destroyed.map++;
  }
}

@Component({
  selector: "app-test-panel",
  template: "panel",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestPanelComponent implements OnDestroy {
  constructor() {
    created.panel++;
  }
  ngOnDestroy(): void {
    destroyed.panel++;
  }
}

/**
 * Mirrors the map page structure: one drawer container that always hosts the
 * map, a drawer only in drawer layouts, a bottom sheet stand-in otherwise,
 * and one shared panel view moved between them.
 */
@Component({
  imports: [
    MatSidenavModule,
    NgTemplateOutlet,
    MovableViewHostDirective,
    MovableViewOutletDirective,
    TestMapComponent,
    TestPanelComponent,
  ],
  template: `
    <ng-template #panelContent>
      <app-test-panel></app-test-panel>
      @switch (panelKind()) {
        @case ("spot") {
          <p class="panel-kind">spot</p>
        }
        @default {
          <p class="panel-kind">list</p>
        }
      }
    </ng-template>
    <div class="home" hidden>
      <ng-container
        [appMovableViewHost]="panelContent"
        #panelView="movableViewHost"
      ></ng-container>
    </div>
    <ng-template #panelOutlet>
      <div class="outlet" [appMovableViewOutlet]="panelView"></div>
    </ng-template>

    <mat-drawer-container [hasBackdrop]="false">
      @if (layout() !== "bottom-sheet") {
        <mat-drawer
          class="drawer"
          opened
          [mode]="layout() === 'drawer-side' ? 'side' : 'over'"
        >
          <ng-container *ngTemplateOutlet="panelOutlet"></ng-container>
        </mat-drawer>
      }
      <div class="canvas">
        <app-test-map></app-test-map>
        @if (layout() === "bottom-sheet") {
          <div class="sheet">
            <ng-container *ngTemplateOutlet="panelOutlet"></ng-container>
          </div>
        }
      </div>
    </mat-drawer-container>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestMapPageComponent {
  readonly layout = signal<MapPanelLayout>("drawer-side");
  readonly panelKind = signal<"spot" | "list">("list");
}

describe("MovableViewOutletDirective", () => {
  async function setup() {
    created = { map: 0, panel: 0 };
    destroyed = { map: 0, panel: 0 };
    TestBed.configureTestingModule({ imports: [NoopAnimationsModule] });
    const fixture = TestBed.createComponent(TestMapPageComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const panelHost = () =>
      root.querySelector("app-test-panel")?.parentElement?.closest(
        ".drawer, .sheet, .home",
      );
    return { fixture, root, panelHost };
  }

  it("keeps the map and the panel components across every layout switch", async () => {
    const { fixture, root, panelHost } = await setup();
    const map = root.querySelector("app-test-map");
    expect(panelHost()?.classList.contains("drawer")).toBe(true);

    for (const layout of [
      "bottom-sheet",
      "drawer-overlay",
      "bottom-sheet",
      "drawer-side",
    ] as const) {
      fixture.componentInstance.layout.set(layout);
      await fixture.whenStable();
      expect(panelHost()?.classList.contains(
        layout === "bottom-sheet" ? "sheet" : "drawer",
      )).toBe(true);
    }

    expect(root.querySelector("app-test-map")).toBe(map);
    expect(created).toEqual({ map: 1, panel: 1 });
    expect(destroyed).toEqual({ map: 0, panel: 0 });
    expect(root.querySelectorAll("app-test-panel")).toHaveLength(1);
  });

  it("renders later panel changes inside the current host", async () => {
    const { fixture, root } = await setup();
    fixture.componentInstance.layout.set("bottom-sheet");
    await fixture.whenStable();

    fixture.componentInstance.panelKind.set("spot");
    await fixture.whenStable();

    const kinds = root.querySelectorAll(".panel-kind");
    expect(kinds).toHaveLength(1);
    expect(kinds[0].textContent).toBe("spot");
    expect(kinds[0].closest(".sheet")).not.toBeNull();

    fixture.componentInstance.layout.set("drawer-side");
    await fixture.whenStable();
    expect(root.querySelector(".panel-kind")?.closest(".drawer")).not.toBeNull();
  });

  it("destroys the shared view with its page", async () => {
    const { fixture } = await setup();
    fixture.destroy();
    expect(destroyed).toEqual({ map: 1, panel: 1 });
  });
});
