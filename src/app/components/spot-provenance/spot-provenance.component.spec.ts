import {PLATFORM_ID, signal} from "@angular/core";
import {TestBed} from "@angular/core/testing";
import type {PublicImportProvenance} from "../../../db/schemas/PublicImportProvenance";
import {LocalSpot} from "../../../db/models/Spot";
import {AnalyticsService} from "../../services/analytics.service";
import {ImportsService} from "../../services/firebase/firestore/imports.service";
import {SpotProvenanceComponent} from "./spot-provenance.component";

const spot = (
  projection: PublicImportProvenance | null | undefined,
): LocalSpot => ({
  source: signal("import-1"),
  publicImportProvenance: projection,
} as unknown as LocalSpot);

const render = async (
  platformId: "browser" | "server",
  projection: PublicImportProvenance | null | undefined,
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
  fixture.componentRef.setInput("spot", spot(projection));
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
    expect(fixture.nativeElement.textContent).toContain("import-1");
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
});
