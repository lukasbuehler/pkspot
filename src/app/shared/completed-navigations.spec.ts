import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { completedNavigations } from "./completed-navigations";

@Component({ template: "" })
class RouteFixture {}

describe("completedNavigations", () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([
        { path: "", component: RouteFixture },
        { path: "landing", component: RouteFixture },
        { path: "next", component: RouteFixture },
        { path: "redirect", redirectTo: "landing", pathMatch: "full" },
        { path: "blocked", component: RouteFixture, canActivate: [() => false] },
      ])],
    });
    router = TestBed.inject(Router);
  });

  it("recovers a landing page completed before analytics startup, without another navigation", async () => {
    await RouterTestingHarness.create("/landing?campaign=test");
    const capture = vi.fn();
    const subscription = completedNavigations(router).subscribe(capture);

    expect(capture).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      urlAfterRedirects: "/landing?campaign=test",
    }));
    subscription.unsubscribe();
  });

  it("captures the first navigation once when subscribed before routing starts", async () => {
    const capture = vi.fn();
    const subscription = completedNavigations(router).subscribe(capture);
    expect(capture).not.toHaveBeenCalled();

    await RouterTestingHarness.create("/landing");

    expect(capture).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      urlAfterRedirects: "/landing",
    }));
    subscription.unsubscribe();
  });

  it("reports the final redirect URL once", async () => {
    await RouterTestingHarness.create("/redirect");
    const capture = vi.fn();
    const subscription = completedNavigations(router).subscribe(capture);

    expect(capture).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      urlAfterRedirects: "/landing",
    }));
    subscription.unsubscribe();
  });

  it("keeps subsequent views, including revisits, but skips cancelled and unchanged navigation", async () => {
    const harness = await RouterTestingHarness.create("/landing");
    const paths: string[] = [];
    const subscription = completedNavigations(router).subscribe((nav) => paths.push(nav.urlAfterRedirects));

    await harness.navigateByUrl("/landing");
    await harness.navigateByUrl("/blocked");
    await harness.navigateByUrl("/next");
    await harness.navigateByUrl("/landing");
    expect(paths).toEqual(["/landing", "/next", "/landing"]);

    subscription.unsubscribe();
    await harness.navigateByUrl("/next");
    expect(paths).toHaveLength(3);
  });
});
