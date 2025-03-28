import {
  AfterViewInit,
  Component,
  Input,
  CUSTOM_ELEMENTS_SCHEMA,
  Inject,
  PLATFORM_ID,
} from "@angular/core";
import { MatRippleModule } from "@angular/material/core";
import { MatButtonModule, MatIconButton } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import {
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
} from "@angular/material/dialog";
import { StorageService } from "../services/firebase/storage.service";

// Swiper
import Swiper from "swiper";
import { Navigation, Pagination } from "swiper/modules";
Swiper.use([Navigation, Pagination]);

import { isPlatformBrowser, NgOptimizedImage } from "@angular/common";
import { ExternalImage, StorageImage } from "../../db/models/Media";

@Component({
  selector: "app-img-carousel",
  imports: [MatRippleModule, NgOptimizedImage],
  templateUrl: "./img-carousel.component.html",
  styleUrl: "./img-carousel.component.scss",
})
export class ImgCarouselComponent {
  @Input() media: (ExternalImage | StorageImage)[] | undefined;

  constructor(
    public dialog: MatDialog,
    public storageService: StorageService
  ) {}

  imageClick(index: number) {
    this.openImageViewer(index);
  }

  openImageViewer(index: number = 0) {
    const dialogRef = this.dialog.open(SwiperDialogComponent, {
      data: { media: this.media, index: index },
      hasBackdrop: true,
      maxWidth: "95vw",
      maxHeight: "95vh",
      panelClass: "dialog",
    });

    // dialogRef.afterClosed().subscribe((result) => {
    //   console.log("The dialog was closed");
    // });
  }

  getSrc(mediaObj: ExternalImage | StorageImage): string {
    if (mediaObj instanceof StorageImage) {
      return mediaObj.getSrc(400);
    } else {
      return mediaObj.src;
    }
  }
}

@Component({
  selector: "swiper-dialog",
  template: `
    <div id="swiper" class="swiper w-100">
      <div class="swiper-wrapper">
        @for (mediaObj of data.media; track $index) { @if(mediaObj.type ===
        'image') {
        <div class="swiper-slide">
          <div class="swiper-img-container">
            <img ngSrc="{{ getSrc(mediaObj) }}" fill />
          </div>
        </div>
        } }
      </div>
      <!-- pagination -->
      <div class="swiper-pagination"></div>

      <!-- navigation buttons -->
      <div class="swiper-button-prev"></div>
      <div class="swiper-button-next"></div>

      <!-- scrollbar -->
      <!-- <div class="swiper-scrollbar"></div> -->

      <button
        mat-icon-button
        style="position: absolute; top: 10px; right: 10px; z-index: 1; background-color: #00000080;"
        (click)="onNoClick()"
      >
        <mat-icon>close</mat-icon>
      </button>
    </div>
  `,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconButton,
    MatIcon,
    NgOptimizedImage,
  ],
  styles: [
    `
      :host {
        display: flex;
        aspect-ratio: 1;
      }

      .swiper-img-container {
        position: relative;
        width: 100%;
        height: 100%;

        > img {
          object-fit: contain;
        }
      }
    `,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SwiperDialogComponent implements AfterViewInit {
  swiper: Swiper | null = null;
  isBroswer: boolean = false;

  constructor(
    public dialogRef: MatDialogRef<SwiperDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    @Inject(PLATFORM_ID) platformId: Object,
    public storageService: StorageService
  ) {
    dialogRef.disableClose = false;

    this.isBroswer = isPlatformBrowser(platformId);
  }

  getSrc(mediaObj: StorageImage | ExternalImage): string {
    if (mediaObj instanceof StorageImage) {
      return mediaObj.getSrc(800);
    } else {
      return mediaObj.src;
    }
  }

  ngAfterViewInit() {
    if (this.isBroswer) {
      // const swiperContainer = document.querySelector(".swiper");
      this.swiper = new Swiper(".swiper", {
        // configure Swiper to use modules
        modules: [Navigation, Pagination],

        // Optional parameters
        direction: "horizontal",
        loop: false,
        observer: true,
        observeParents: true,
        autoplay: false,

        // If we need pagination
        pagination: {
          el: ".swiper-pagination",
          clickable: true,
          dynamicBullets: false,
        },

        // Navigation arrows
        navigation: {
          nextEl: ".swiper-button-next",
          prevEl: ".swiper-button-prev",
          enabled: true,
        },

        // scrollbar
        // scrollbar: {
        //   el: ".swiper-scrollbar",
        // },
      });

      //   this.renderer.listen(swiperContainer, "touchstart", (event) => {
      //     event.stopPropagation();
      //   });
      //   this.renderer.listen(swiperContainer, "touchmove", (event) => {
      //     event.stopPropagation();
      //   });

      if (this.data.index && this.swiper) {
        const what: boolean = this.swiper.slideTo(this.data.index, 1, false);
        console.log(what);
      }
    }
  }

  onNoClick(): void {
    this.dialogRef.close();
  }
}
