import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from "@angular/router";
import { MatSnackBar } from "@angular/material/snack-bar";
import { BehaviorSubject } from "rxjs";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { FeatureTelemetryService } from "../../services/feature-telemetry.service";
import { ModerationMediaService, ModerationMediaItem } from "../../services/firebase/firestore/moderation-media.service";
import { ModerationMediaPageComponent } from "./moderation-media-page.component";

describe("ModerationMediaPageComponent linked review", () => {
  let fixture: ComponentFixture<ModerationMediaPageComponent>;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const media = {
    getReview: vi.fn(), getUploadStream: vi.fn(),
    getQuarantinedPreview: vi.fn(), markSafe: vi.fn(),
    markFalsePositive: vi.fn(), createIncident: vi.fn(),
  };
  const item: ModerationMediaItem = {
    id: "old-review", status: "needs_review", createdAtMillis: 0,
    labelEntries: [], isApproved: false, isVideo: false, isRestricted: false,
    canReveal: true, canMarkSafe: true,
    statusLabel: "Needs review", isFalsePositive: false,
    canMarkFalsePositive: true, canEscalate: true,
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    params = new BehaviorSubject(convertToParamMap({ review: item.id }));
    media.getReview.mockResolvedValue([item]);
    media.getUploadStream.mockResolvedValue([]);
    media.getQuarantinedPreview.mockResolvedValue("https://example.test/preview.jpg");
    await TestBed.configureTestingModule({
      imports: [ModerationMediaPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: params } },
        { provide: AuthenticationService, useValue: {
          authState$: new BehaviorSubject(null), isAdmin: () => true,
          initialAuthStateResolved: signal(true),
        } },
        { provide: ModerationMediaService, useValue: media },
        { provide: FeatureTelemetryService, useValue: { failure: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ModerationMediaPageComponent);
    await fixture.whenStable();
  });

  afterEach(() => vi.restoreAllMocks());

  it("opens the exact review and requires preview plus confirmation before release", async () => {
    const component = fixture.componentInstance;
    const text = () => (fixture.nativeElement as HTMLElement).textContent;
    expect(media.getReview).toHaveBeenCalledWith(item.id);
    expect(media.getUploadStream).not.toHaveBeenCalled();
    expect(text()).not.toContain("Mark safe and release");
    await component.markSafe(item);
    expect(media.markSafe).not.toHaveBeenCalled();

    const confirm = vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    await component.reveal(item);
    await fixture.whenStable();
    expect(text()).toContain("Mark safe and release");
    confirm.mockReturnValue(false);
    await component.markSafe(item);
    expect(media.markSafe).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await component.markSafe(item);
    expect(media.markSafe).toHaveBeenCalledWith(item.id);
  });

  it("does not replace a newly selected review with an older in-flight response", async () => {
    let resolveOld!: (items: ModerationMediaItem[]) => void;
    media.getReview.mockImplementationOnce(() => new Promise<ModerationMediaItem[]>((resolve) => {
      resolveOld = resolve;
    }));
    params.next(convertToParamMap({ review: "slow-review" }));
    const nextItem = { ...item, id: "next-review" };
    media.getReview.mockResolvedValueOnce([nextItem]);
    params.next(convertToParamMap({ review: nextItem.id }));
    await fixture.whenStable();
    resolveOld([{ ...item, id: "slow-review" }]);
    await fixture.whenStable();
    expect(fixture.componentInstance.media()).toEqual([nextItem]);

    params.next(convertToParamMap({}));
    await fixture.whenStable();
    expect(media.getUploadStream).toHaveBeenCalledOnce();
  });

  it("shows a missing review without falling back to unrelated uploads", async () => {
    media.getReview.mockResolvedValueOnce([]);
    params.next(convertToParamMap({ review: "missing-review" }));
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain("Media review not found.");
    expect(media.getUploadStream).not.toHaveBeenCalled();
  });

  it("records a false positive through the non-publishing action only", async () => {
    const component = fixture.componentInstance;
    const confirm = vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    await component.markFalsePositive(item);
    expect(media.markFalsePositive).not.toHaveBeenCalled();
    component.previewUrls.set({ [item.id]: "https://example.test/preview" });
    confirm.mockReturnValue(false);
    await component.markFalsePositive(item);
    expect(media.markFalsePositive).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await component.markFalsePositive(item);
    expect(media.markFalsePositive).toHaveBeenCalledWith(item.id);
    expect(media.markSafe).not.toHaveBeenCalled();
  });

  it("can escalate restricted media without previewing or publishing it", async () => {
    const restricted = { ...item, isRestricted: true, canReveal: false, canMarkSafe: false, canMarkFalsePositive: false };
    fixture.componentInstance.media.set([restricted]);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain("Escalate to incident");
    expect(text).not.toContain("Reveal to review");
    expect(text).not.toContain("Mark as false positive without publishing");
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    const navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
    media.createIncident.mockResolvedValue("safety_incidents/incident-1");
    await fixture.componentInstance.openIncident(restricted);
    expect(navigate).toHaveBeenCalledWith(["/moderation/incidents", "incident-1"]);
    expect(media.getQuarantinedPreview).not.toHaveBeenCalled();
    expect(media.markSafe).not.toHaveBeenCalled();
  });
});
