import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  viewChild,
} from "@angular/core";
import { NgOptimizedImage } from "@angular/common";
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
} from "@angular/material/dialog";
import { MatIconButton } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import Swiper from "swiper";
import { Zoom } from "swiper/modules";

export interface ProfilePictureDialogData {
  src: string;
  alt: string;
}

@Component({
  selector: "app-profile-picture-dialog",
  imports: [NgOptimizedImage, MatIconButton, MatIcon],
  templateUrl: "./profile-picture-dialog.component.html",
  styleUrl: "./profile-picture-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePictureDialogComponent implements OnDestroy {
  readonly data = inject<ProfilePictureDialogData>(MAT_DIALOG_DATA);
  private readonly _dialogRef = inject(
    MatDialogRef<ProfilePictureDialogComponent>
  );
  private readonly _swiperElement =
    viewChild.required<ElementRef<HTMLElement>>("swiper");
  private _swiper?: Swiper;

  constructor() {
    afterNextRender(() => {
      this._swiper = new Swiper(this._swiperElement().nativeElement, {
        modules: [Zoom],
        centeredSlides: true,
        slidesPerView: 1,
        zoom: {
          maxRatio: 3,
          minRatio: 1,
          toggle: true,
        },
      });
    });
  }

  close(): void {
    this._dialogRef.close();
  }

  ngOnDestroy(): void {
    this._swiper?.destroy(true, true);
  }
}
