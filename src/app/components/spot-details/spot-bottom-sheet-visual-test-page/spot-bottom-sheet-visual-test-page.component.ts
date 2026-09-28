import { SpotActivityService } from "../../../services/firebase/firestore/spot-activity.service";
import {ImageCropDialogComponent} from "../../crop-image/image-crop-dialog.component";
import {OPTIONAL_MEDIA_CROP_POLICY} from "../../crop-image/image-crop-policy";
import {
  AfterViewInit,
  afterNextRender,
  Injector,
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  ViewChild,
} from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
import { SpotReportDialogComponent } from "../../spot-report-dialog/spot-report-dialog.component";
import { SpotReportsService } from "../../../services/firebase/firestore/spot-reports.service";
import { ActivatedRoute } from "@angular/router";
import { Timestamp } from "firebase/firestore";
import { BottomSheetComponent } from "../../bottom-sheet/bottom-sheet.component";
import { MapSpotDetailsPanelComponent } from "../../map/map-spot-details-panel/map-spot-details-panel.component";
import { PendingSpotPanel } from "../../map/map-panel-view.model";
import { Spot } from "../../../../db/models/Spot";
import { MediaType } from "../../../../db/models/Interfaces";
import { SpotId, SpotSchema } from "../../../../db/schemas/SpotSchema";

const visualSpotData: SpotSchema = {
  name: {
    en: "Riverside Training Walls",
    de: "Riverside Training Walls",
  },
  description: {
    en: "A compact outdoor line with rails, precision walls, wall-run entries, and plenty of landing options. The lower ledges stay beginner-friendly while the upper wall rewards stronger jumps.",
    de: "A compact outdoor line with rails, precision walls, wall-run entries, and plenty of landing options. The lower ledges stay beginner-friendly while the upper wall rewards stronger jumps.",
  },
  location_raw: { lat: 47.3769, lng: 8.5417 },
  media: [
    {
      type: MediaType.Image,
      src: "/assets/swissjam/swissjam1.jpg",
      isInStorage: false,
      origin: "other",
      attribution_text: "Fixture image generated for visual tests.",
    },
    {
      type: MediaType.Image,
      src: "/assets/spot_placeholder.png",
      isInStorage: false,
      origin: "other",
      attribution_text: "Fixture image generated for visual tests.",
    },
  ],
  is_iconic: true,
  rating: 4.6,
  num_reviews: 24,
  rating_histogram: {
    1: 1,
    2: 1,
    3: 3,
    4: 7,
    5: 12,
  },
  address: {
    sublocality: "Kreis 5",
    sublocalityLocal: "Kreis 5",
    locality: "Zurich",
    localityLocal: "Zurich",
    region: { code: "ZH", name: "Zurich" },
    country: { code: "CH", name: "Switzerland" },
    formatted: "Limmatstrasse 271, 8005 Zurich, Switzerland",
    formattedLocal: "Limmatstrasse 271, 8005 Zurich, Switzerland",
  },
  type: "urban landscape",
  access: "public",
  amenities: {
    indoor: false,
    outdoor: true,
    covered: true,
    lighting: true,
    entry_fee: false,
    drinking_water: true,
    wc: true,
    parking_on_site: false,
    power_outlets: false,
    maybe_overgrown: true,
    water_feature: true,
  },
  bounds_raw: [
    { lat: 47.37708, lng: 8.54125 },
    { lat: 47.37712, lng: 8.54218 },
    { lat: 47.37658, lng: 8.54224 },
    { lat: 47.37652, lng: 8.5413 },
  ],
  hide_streetview: true,
  source: "https://example.test/riverside-training-walls",
  slug: "riverside-training-walls",
  stewardship: {
    organization_ids: ["fixture-org"],
    organizations: {
      "fixture-org": {
        status: "active",
        organization_id: "fixture-org",
        organization: {
          id: "fixture-org",
          name: "PK Spot Fixture Crew",
          slug: "fixture-crew",
        },
        stewarded_by_user_id: "fixture-admin",
        stewarded_at: Timestamp.fromDate(new Date("2026-01-15T12:00:00.000Z")),
      },
    },
  },
};

const visualPendingSpot: PendingSpotPanel = {
  id: "visual-riverside-training-walls",
  slug: "riverside-training-walls",
  name: "Riverside Training Walls",
  locality: "Zurich",
  imageSrc: "/assets/swissjam/swissjam1.jpg",
  rating: 4.6,
};

@Component({
  selector: "app-spot-bottom-sheet-visual-test-page",
  imports: [BottomSheetComponent, MapSpotDetailsPanelComponent],
  providers: [{provide: SpotActivityService, useFactory: () => {
    const route = inject(ActivatedRoute);
    return {get: async () => route.snapshot.queryParamMap.has("activity") ? {status: "recently_trained", bucket: "2–4", window_days: 30} : null};
  }}, {
    provide: SpotReportsService,
    useValue: {
      getOwnSpotReport: async () => ({
        id: "visual-report", kind: "spot", status: "open",
        reasons: ["torn down"], comment: "Die Trainingsmauer wurde entfernt.", comment_locale: "de",
      }),
    },
  }],
  templateUrl: "./spot-bottom-sheet-visual-test-page.component.html",
  styleUrl: "./spot-bottom-sheet-visual-test-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotBottomSheetVisualTestPageComponent implements AfterViewInit {
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);

  constructor() {
    afterNextRender(() => {
      if (this.route.snapshot.queryParamMap.has("crop")) void this.openCropFixture();
      if (this.route.snapshot.queryParamMap.has("mapdrafts")) void this.openMapDraftFixture();
      if (this.route.snapshot.queryParamMap.has("photos")) void this.openPhotoFixture();
      if (this.route.snapshot.queryParamMap.get("report") === "edit") {
        this.dialog.open(SpotReportDialogComponent, {
      width: "560px",
      maxWidth: "calc(100vw - 32px)",
      height: "min(780px, calc(100dvh - 32px))",
          injector: this.injector,
          data: {spotId: this.spot.id, spotName: this.spot.name()},
        });
      }
    });
  }

  private async openMapDraftFixture(): Promise<void> {
    const {SharedMapDraftsDialogComponent} = await import("../../shared-map-drafts-dialog/shared-map-drafts-dialog.component");
    const {NativeMapShareService} = await import("../../../services/native-map-share.service");
    const drafts = signal([
      {id: "new", text: "https://maps.apple.com/?ll=47.3,8.5", name: "Training walls by the river", location: {lat: 47.3, lng: 8.5}},
      {id: "known", text: "https://maps.apple.com/?ll=47.4,8.6", name: "Riverside Spot", spotId: "fixture", location: {lat: 47.4, lng: 8.6}},
    ]);
    const injector = Injector.create({parent: this.injector, providers: [{provide: NativeMapShareService, useValue: {
      drafts, reviewDraft: () => Promise.resolve(), removeDraft: (id: string) => drafts.update(items => items.filter(item => item.id !== id)),
    }}]});
    this.dialog.open(SharedMapDraftsDialogComponent, {injector, width: "560px", maxHeight: "80dvh"});
  }

  private async openPhotoFixture(): Promise<void> {
    if (this.route.snapshot.queryParamMap.get("photos") === "target") {
      const {SharedPhotoTargetDialogComponent} = await import("../../shared-photo-target-dialog/shared-photo-target-dialog.component");
      this.dialog.open(SharedPhotoTargetDialogComponent, {width: "560px"});
      return;
    }
    const {MediaUploadDialogComponent} = await import("../../media-upload-dialog/media-upload-dialog.component");
    const blob = await (await fetch("/assets/swissjam/swissjam1.jpg")).blob();
    this.dialog.open(MediaUploadDialogComponent, {
      width: "680px",
      data: {spotId: this.spot.id, initialFiles: [new File([blob], "shared-photo.jpg", {type: "image/jpeg"})]},
    });
  }

  private async openCropFixture(): Promise<void> {
    const blob = await (await fetch("/assets/swissjam/swissjam1.jpg")).blob();
    this.dialog.open(ImageCropDialogComponent, {
      data: {file: new File([blob], "training.jpg", {type: "image/jpeg"}), policy: OPTIONAL_MEDIA_CROP_POLICY},
      width: "720px", maxWidth: "100vw", maxHeight: "100dvh",
      panelClass: "image-crop-dialog-panel", autoFocus: "dialog",
    });
  }

  @ViewChild(BottomSheetComponent)
  private bottomSheet?: BottomSheetComponent;

  readonly openProgress = signal(1);
  readonly isLoading =
    this.route.snapshot.queryParamMap.get("state") === "loading";
  readonly pendingSpot = this.isLoading ? visualPendingSpot : null;
  readonly spot = new Spot(
    "visual-riverside-training-walls" as SpotId,
    this.route.snapshot.queryParamMap.has("report")
      ? {...visualSpotData, is_reported: true, report_reason: "torn down"}
      : {...visualSpotData, ...(this.route.snapshot.queryParamMap.has("shortTitle")
          ? {name: {en: "Lindenhof", de: "Lindenhof"}} : {})},
    "de",
  );

  ngAfterViewInit(): void {
    if (typeof requestAnimationFrame === "undefined") {
      return;
    }

    requestAnimationFrame(() => this.bottomSheet?.maximize());
  }
}
