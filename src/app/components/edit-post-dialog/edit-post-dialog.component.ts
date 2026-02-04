import {
  Component,
  OnInit,
  Input,
  ViewChild,
  Inject,
  AfterViewInit,
  LOCALE_ID,
} from "@angular/core";
import {
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
  MatDialogClose,
} from "@angular/material/dialog";

import { Post } from "../../../db/models/Post";
import { Spot } from "../../../db/models/Spot";
import { SpotId } from "../../../db/schemas/SpotSchema";

import { StorageService } from "../../services/firebase/storage.service";
import { PostsService } from "../../services/firebase/firestore/posts.service";

import {
  UntypedFormControl,
  FormsModule,
  ReactiveFormsModule,
} from "@angular/forms";
import {
  MatAutocomplete,
  MatAutocompleteTrigger,
} from "@angular/material/autocomplete";
import { LocaleCode, MediaType } from "../../../db/models/Interfaces";
import { Observable } from "rxjs";
import { MatButton } from "@angular/material/button";
import { MatOption } from "@angular/material/core";
import { MatIcon } from "@angular/material/icon";
import { MediaUpload } from "../media-upload/media-upload.component";
import { MatTabGroup, MatTab } from "@angular/material/tabs";
import { MatInput } from "@angular/material/input";
import {
  MatFormField,
  MatLabel,
  MatSuffix,
  MatHint,
  MatError,
} from "@angular/material/form-field";
import { getValueFromEventTarget } from "../../../scripts/Helpers";
import { StorageBucket } from "../../../db/schemas/Media";

export interface PostDialogData {
  isCreating: string;
}

@Component({
  selector: "app-edit-post-dialog",
  templateUrl: "./edit-post-dialog.component.html",
  styleUrls: ["./edit-post-dialog.component.scss"],
  imports: [
    MatDialogTitle,
    MatDialogContent,
    FormsModule,
    MatFormField,
    MatLabel,
    MatInput,
    MatTabGroup,
    MatTab,
    MediaUpload,
    ReactiveFormsModule,
    MatIcon,
    MatSuffix,
    MatHint,
    MatError,
    MatAutocompleteTrigger,
    MatAutocomplete,
    MatOption,
    MatDialogActions,
    MatButton,
    MatDialogClose,
  ],
})
export class EditPostDialogComponent implements AfterViewInit {
  constructor(
    @Inject(LOCALE_ID) public locale: LocaleCode,
    @Inject(MAT_DIALOG_DATA) public data: PostDialogData,
    public dialogRef: MatDialogRef<EditPostDialogComponent>,
    private _storageService: StorageService,
    private _postsService: PostsService
  ) {
    this.isCreating = Boolean(data.isCreating);
  }

  isCreating: boolean = false;

  getValueFromEventTarget = getValueFromEventTarget;

  uploadFile: File | null = null;

  hasChanged = false;

  filteredSpots: Spot[] = [];

  postTitle = "";
  postBody = "";
  postImageSrc = "";
  postLocation = "";
  postSpot: Spot | null = null;

  // If this is false, then link is selected
  isUploadSelected = true;

  mediaLink = {
    text: "",
    platform: "",
    id: "",
  };

  linkInputFormControl = new UntypedFormControl("");

  ngAfterViewInit() {
    // TODO Remove in later:
    // this._databaseService.getTestSpots(true).subscribe(
    //   (spots) => {
    //     spots.forEach((spot) => {
    //       this.filteredSpots.push(spot);
    //     });
    //     console.log(
    //       "Added " + spots.length + " spots to the autocomplete array"
    //     );
    //   },
    //   (error) => {
    //     console.error(error);
    //   }
    // );
  }

  tabChanged(index: number) {
    if (index === 0) {
      this.isUploadSelected = true;
    } else if (index === 1) {
      this.isUploadSelected = false;
    }
    console.log("isUploadSelected " + this.isUploadSelected);
  }

  onLinkUpdate(str: string) {
    this.mediaLink.text = str;
    this.hasChanged = true;

    if (str) {
      if (str.includes("youtube") || str.includes("youtu.be")) {
        // It's a youtube video
        this.mediaLink.platform = "YouTube";

        // get the youtube video id
        let videoIdRegEx =
          /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/gi;
        let videoIdMatch = videoIdRegEx.exec(str);
        if (videoIdMatch) {
          let id = videoIdMatch[1];
          this.mediaLink.id = id;
          let embedLink = `https://www.youtube.com/embed/${id}`;

          this.linkInputFormControl.setErrors(null);
        } else {
          this.linkInputFormControl.setErrors({
            invalid: true,
          });
        }
      } else if (str.includes("vimeo")) {
        // vimeo video
      } else {
        this.linkInputFormControl.setErrors({ invalid: true });
      }
    } else {
      this.linkInputFormControl.setErrors({ invalid: true });
    }
  }

  onUploadMediaSelect(file: File) {
    this.uploadFile = file;
  }

  makePostToReturn(): {
    title: string;
    body?: string;
    spot?: Spot;
    location?: google.maps.LatLngLiteral | null;
    mediaType?: MediaType;
  } {
    let isImage = false;
    let mediaType: MediaType | null = null;
    if (this.uploadFile) {
      let fileEnding = this.uploadFile.name.split(".").pop();

      // Get the media type
      if (this.uploadFile.type.includes("image")) {
        mediaType = MediaType.Image;
      } else if (this.uploadFile.type.includes("video")) {
        mediaType = MediaType.Video;
      } else {
        // The media type could not be distinguished.
        // It is not supported.
        console.error("This media type is not supported.");

        return {
          title: this.postTitle,
          body: this.postBody,
          spot: this.postSpot ?? undefined,
        };
      }

      // Upload file to storage
      this._storageService.setUploadToStorage(
        this.uploadFile,
        StorageBucket.PostMedia,
        (percent) => {
          console.log("Upload progress", percent);
        },
        undefined,
        fileEnding,
        "public, max-age=31536000"
      );
    }

    return {
      title: this.postTitle,
      body: this.postBody,
      spot: this.postSpot ?? undefined,
      mediaType: mediaType ?? undefined,
    };
  }

  close() {
    this.dialogRef.close();
  }

  selectSpot(value: string) {
    if (value) {
      let findSpot = this.filteredSpots.find((spot) => {
        return spot.id === value;
      });
      if (findSpot) {
        this.postSpot = findSpot;
        return;
      }
    }
    this.postSpot = null;
  }

  getSpotNameFromId = (spotId: SpotId) => {
    if (this.filteredSpots && this.filteredSpots.length > 0) {
      let findSpot = this.filteredSpots.find((spot) => {
        return spot.id === spotId;
      });
      if (findSpot) {
        return findSpot.name();
      }
    }

    return "";
  };
}
