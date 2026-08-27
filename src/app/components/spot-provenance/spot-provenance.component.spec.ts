import {PLATFORM_ID, signal} from "@angular/core";
import {TestBed} from "@angular/core/testing";
import type {PublicImportProvenance} from "../../../db/schemas/PublicImportProvenance";
import {LocalSpot, Spot} from "../../../db/models/Spot";
import {SpotId} from "../../../db/schemas/SpotSchema";
import {AnalyticsService} from "../../services/analytics.service";
import {ImportsService} from "../../services/firebase/firestore/imports.service";
import {SpotProvenanceComponent} from "./spot-provenance.component";

const spot = (
  projection: PublicImportProvenance | null | undefined,
): LocalSpot => ({
  source: signal("import-1"),
  publicImportProvenance: signal(projection),
} as unknown as LocalSpot);

const render = async (
  platformId: "browser" | "server",
  projection: PublicImportProvenance | null | undefined,
  spotOverride?: Spot | LocalSpot,
) => {
  const imports = {
    getPublicProvenanceById: vi.fn().mockResolvedValue({
      source_name: "Fallback source",
      attribution_text: "Fallback attribution",
    }),
  };
  TestBed.configureTestingModule({
    providers: [
      {provide: PLATFORM_ID, useValue: platformId},
      {provide: ImportsService, useValue: imports},
      {provide: AnalyticsService, useValue: {trackEvent: vi.fn()}},
    ],
  });
  const fixture = TestBed.createComponent(SpotProvenanceComponent);
  fixture.componentRef.setInput("spot", spotOverride ?? spot(projection));
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await fixture.whenStable();
  return {fixture, imports};
};

describe("SpotProvenanceComponent", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("never calls the compatibility Function during SSR", async () => {
    const {fixture, imports} = await render("server", undefined);
    expect(imports.getPublicProvenanceById).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain("import-1");
  });

  it("does not render projected attribution during SSR", async () => {
    const {fixture, imports} = await render("server", {
      source_name: "Projected source",
      attribution_text: "Projected attribution",
    });
    expect(imports.getPublicProvenanceById).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain("Projected source");
    expect(fixture.nativeElement.textContent).not.toContain(
      "Projected attribution",
    );
  });

  it("renders a projected value without a Function call", async () => {
    const {fixture, imports} = await render("browser", {
      source_name: "Projected source",
      attribution_text: "Projected attribution",
    });
    expect(imports.getPublicProvenanceById).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain("Projected source");
    expect(fixture.nativeElement.textContent).toContain("Projected attribution");
  });

  it("treats explicit null as evaluated and does not fall back", async () => {
    const {fixture, imports} = await render("browser", null);
    expect(imports.getPublicProvenanceById).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain("import-1");
  });

  it("falls back once for an unmigrated Spot in the browser", async () => {
    const {fixture, imports} = await render("browser", undefined);
    expect(imports.getPublicProvenanceById).toHaveBeenCalledOnce();
    expect(imports.getPublicProvenanceById).toHaveBeenCalledWith("import-1");
    expect(fixture.nativeElement.textContent).toContain("Fallback source");
  });

  it("updates projected attribution when an existing Spot refreshes", async () => {
    const existingSpot = new Spot(
      "spot-1" as SpotId,
      {
        name: {en: "Imported Spot"},
        location_raw: {lat: 47, lng: 8},
        address: null,
        source: "import-1",
        public_import_provenance: {
          source_name: "Original source",
        },
      },
      "en",
    );
    const {fixture} = await render("browser", undefined, existingSpot);

    existingSpot.applyFromSchema({
      name: {en: "Imported Spot"},
      location_raw: {lat: 47, lng: 8},
      address: null,
      source: "import-1",
      public_import_provenance: {
        source_name: "Updated source",
        attribution_text: "Updated attribution",
      },
    });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("Updated source");
    expect(fixture.nativeElement.textContent).toContain("Updated attribution");
    expect(fixture.nativeElement.textContent).not.toContain("Original source");
  });
});
