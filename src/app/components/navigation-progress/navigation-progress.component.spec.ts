import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { describe, expect, it } from "vitest";
import { NavigationProgressComponent } from "./navigation-progress.component";

describe("NavigationProgressComponent", () => {
  it("shows the bar only while a navigation is in progress", () => {
    const currentNavigation = signal<unknown>(null);
    TestBed.configureTestingModule({
      imports: [NavigationProgressComponent],
      providers: [{ provide: Router, useValue: { currentNavigation } }],
    });
    const fixture = TestBed.createComponent(NavigationProgressComponent);
    fixture.detectChanges();
    const bar = () => fixture.nativeElement.querySelector("mat-progress-bar");
    expect(bar()).toBeNull();

    currentNavigation.set({ id: 1 });
    fixture.detectChanges();
    expect(bar()).not.toBeNull();

    currentNavigation.set(null);
    fixture.detectChanges();
    expect(bar()).toBeNull();
  });
});
