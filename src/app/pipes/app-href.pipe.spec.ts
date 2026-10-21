import { APP_BASE_HREF, LocationStrategy, PathLocationStrategy } from "@angular/common";
import { TestBed } from "@angular/core/testing";
import { AppHrefPipe } from "./app-href.pipe";

describe("AppHrefPipe", () => {
  function createPipe(baseHref: string): AppHrefPipe {
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_BASE_HREF, useValue: baseHref },
        { provide: LocationStrategy, useClass: PathLocationStrategy },
      ],
    });
    return TestBed.runInInjectionContext(() => new AppHrefPipe());
  }

  it("prefixes app paths with the localized base href", () => {
    const pipe = createPipe("/de/");

    expect(pipe.transform("/map/spots/rwi")).toBe("/de/map/spots/rwi");
    expect(pipe.transform("/map/communities/zuerich")).toBe(
      "/de/map/communities/zuerich",
    );
    expect(pipe.transform("/events/swissjam26")).toBe("/de/events/swissjam26");
  });

  it("leaves localized, external, and empty values unchanged", () => {
    const pipe = createPipe("/fr/");

    expect(pipe.transform("/fr/map/spots/rwi")).toBe("/fr/map/spots/rwi");
    expect(pipe.transform("/de/map")).toBe("/de/map");
    expect(pipe.transform("https://example.com/map")).toBe(
      "https://example.com/map",
    );
    expect(pipe.transform("//cdn.example.com/x")).toBe("//cdn.example.com/x");
    expect(pipe.transform(null)).toBeNull();
    expect(pipe.transform("")).toBeNull();
  });

  it("keeps paths unprefixed in unlocalized builds", () => {
    const pipe = createPipe("/");

    expect(pipe.transform("/map/spots/rwi")).toBe("/map/spots/rwi");
  });
});
