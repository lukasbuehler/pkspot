import {
  Component,
  Inject,
  LOCALE_ID,
  WritableSignal,
  signal,
  ChangeDetectionStrategy
} from "@angular/core";
import { SpotReviewSchema } from "../../../db/schemas/SpotReviewSchema";
import {
  MatButtonModule,
  MatButton,
  MatIconButton,
} from "@angular/material/button";
import {
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
  MatDialogClose,
} from "@angular/material/dialog";
import { MatIconModule, MatIcon } from "@angular/material/icon";
import { SpotReviewsService } from "../../services/firebase/firestore/spot-reviews.service";
import { MatFormField, MatFormFieldModule } from "@angular/material/form-field";
import { FormsModule } from "@angular/forms";
import { MatInput, MatInputModule } from "@angular/material/input";
import { LocaleCode } from "../../../db/models/Interfaces";
import { AnalyticsService } from "../../services/analytics.service";

@Component({
  selector: "app-spot-review-dialog",
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatButtonModule,
    MatIconModule,
    MatIconButton,
    MatIcon,
    MatButton,
    MatFormFieldModule,
    MatFormField,
    MatInputModule,
    MatInput,
    FormsModule,
  ],
  templateUrl: "./spot-review-dialog.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: "./spot-review-dialog.component.scss",
})
export class SpotReviewDialogComponent {
  hoverRating: number = 0;
  isHovering: boolean = false;
  review: SpotReviewSchema;
  isUpdate: boolean;

  reviewComment: WritableSignal<string>;

  addReviewText = $localize`:add review button label@@add_review_label:Add Review`;
  updateReviewText = $localize`:update review button label@@update_review_label:Update Review`;

  constructor(
    public dialogref: MatDialogRef<SpotReviewDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: { review: SpotReviewSchema; isUpdate: boolean },
    @Inject(LOCALE_ID) public locale: LocaleCode,
    private _spotReviewsService: SpotReviewsService,
    private _analytics: AnalyticsService
  ) {
    this.review = data.review;
    this.isUpdate = data.isUpdate;
    this.hoverRating = this.review.rating;

    this.reviewComment = signal<string>(this.review.comment?.text ?? "");
  }

  onNoClick(): void {
    this.dialogref.close();
  }

  submitReview() {
    this.review.comment = {
      text: this.reviewComment(),
      locale: this.locale,
    };

    this._analytics.trackEvent("spot_review_submit_clicked", {
      spot_id: this.review.spot.id,
      rating: this.review.rating,
      is_update: this.isUpdate,
      has_comment: this.reviewComment().trim().length > 0,
      comment_length: this.reviewComment().trim().length,
    });
    this._spotReviewsService
      .updateSpotReview(this.review)
      .then(() => {
        this._analytics.trackEvent("spot_review_submitted", {
          spot_id: this.review.spot.id,
          rating: this.review.rating,
          is_update: this.isUpdate,
          has_comment: this.reviewComment().trim().length > 0,
        });
        // this.dialogref.close();
      })
      .catch((err) => {
        console.error(err);
        this._analytics.trackEvent("spot_review_submit_failed", {
          spot_id: this.review.spot.id,
          rating: this.review.rating,
          is_update: this.isUpdate,
        });
      });
  }
}
