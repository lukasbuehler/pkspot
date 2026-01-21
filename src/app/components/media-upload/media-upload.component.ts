import { effect, inject, Optional, Self, signal } from "@angular/core";
import { Component, OnInit, Output, EventEmitter, Input } from "@angular/core";
import {
  ControlValueAccessor,
  UntypedFormControl,
  FormControlName,
  UntypedFormGroup,
  NgControl,
  Validators,
  FormsModule,
  ReactiveFormsModule,
} from "@angular/forms";
import { humanFileSize } from "../../../scripts/Helpers";
import { NgOptimizedImage } from "@angular/common";
import { MatInput } from "@angular/material/input";
import {
  MatFormField,
  MatLabel,
  MatSuffix,
  MatHint,
  MatError,
} from "@angular/material/form-field";
import { generateUUID } from "../../../scripts/Helpers";

import { MatIcon } from "@angular/material/icon";
import { MatMiniFabButton } from "@angular/material/button";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { StorageService } from "../../services/firebase/storage.service";
import { MediaType } from "../../../db/models/Interfaces";
import { StorageBucket } from "../../../db/schemas/Media";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";

export interface UploadMedia {
  file: File;
  previewSrc: string;
  icon: string;
  uploadProgress: number;
  type: MediaType;
}
@Component({
  selector: "app-media-upload",
  templateUrl: "./media-upload.component.html",
  styleUrls: ["./media-upload.component.scss"],
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatMiniFabButton,
    MatIcon,
    MatFormField,
    MatLabel,
    MatInput,
    MatSuffix,
    // MatHint,
    MatError,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
})
export class MediaUpload implements OnInit, ControlValueAccessor {
  private _snackbar: MatSnackBar = inject(MatSnackBar);

  @Input() required: boolean = false;
  @Input() multipleAllowed: boolean = false;
  @Input() storageFolder: StorageBucket | null = null;
  @Input() uploadToStorage: boolean = true;
  @Input() maximumSizeInBytes: number = 500 * 1024 * 1024; // 500 MB
  @Input() allowedMimeTypes: string[] | null = null;
  @Input() acceptString: string | null = null;
  @Output() changed = new EventEmitter<void>();
  @Output() newMedia = new EventEmitter<{
    src: string;
    is_sized: boolean;
    type: MediaType;
  }>();
  @Output() fileSelected = new EventEmitter<File>();

  private _storageService = inject(StorageService);

  showPreview = signal(true);

  mediaList = signal<UploadMedia[]>([]);
  uploadFile: File | null = null;

  formGroup: UntypedFormGroup;

  hasError: boolean = false;
  private _errorMessage: string = "";
  get errorMessage() {
    return this._errorMessage;
  }

  constructor() {
    this.formGroup = new UntypedFormGroup({
      input: new UntypedFormControl("", [Validators.required]),
    });
  }

  ngOnInit() {
    if (this.storageFolder === null && this.uploadToStorage) {
      console.error("No storage folder specified for media upload");
    }
  }

  writeValue() {}

  registerOnChange() {}

  registerOnTouched() {}

  setDisabledState?(isDisabled: boolean) {}

  public isImageSelected(): boolean {
    return this.uploadFile?.type.includes("image") ?? false;
  }

  onSelectFiles(eventTarget: EventTarget | null) {
    const fileList = (eventTarget as HTMLInputElement).files;

    if (fileList) {
      const _mediaList: UploadMedia[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];

        this.hasError = false;
        let type = file.type;
        console.debug("file type", type);
        if (!this.allowedMimeTypes || this.allowedMimeTypes.includes(type)) {
          if (
            this.maximumSizeInBytes !== null &&
            file.size > this.maximumSizeInBytes
          ) {
            // The selected file is too large
            console.log(
              `The selected file was too big. (Max: ${humanFileSize(
                this.maximumSizeInBytes
              )})`
            );
            this._errorMessage = `The selected file was too big. (It needs to be less than ${humanFileSize(
              this.maximumSizeInBytes
            )})`;
            this.hasError = true;
            return;
          }
        } else {
          this._snackbar.open($localize`File mimetype is not allowed!`);
          console.log(
            "A file was selected, but its mimetype is not allowed. Please select a different file.\n" +
              "Mimetype of selected file is '" +
              type +
              "', allowed mime types are: " +
              (this.allowedMimeTypes
                ? this.allowedMimeTypes.join(", ")
                : "undefined") +
              "\n"
          );
          this._errorMessage = "The type of this file is not allowed";
          this.hasError = true;
          return;
        }
        const newMedia: UploadMedia = {
          previewSrc: this.getFileImageSrc(file),
          file: file,
          uploadProgress: 0,
          icon: file.type.includes("image")
            ? "image"
            : file.type.includes("video")
            ? "movie"
            : "insert_drive_file",
          type: file.type.includes("image") ? MediaType.Image : MediaType.Video,
        };

        _mediaList.push(newMedia);

        if (this.uploadToStorage && this.storageFolder) {
          this.uploadMedia(newMedia, i);
        } else {
          // just emit the file
          this.fileSelected.emit(file);
          // mark as completed (or should we just not show progress?)
          this.mediaList.update((list) => {
            // add to list but completed
            newMedia.uploadProgress = 100;
            // list.push(newMedia); // handled by set below
            return list;
          });
        }
      }
      this.mediaList.set(_mediaList);
    }
  }

  fileIsImage(file: File): boolean {
    if (!file) {
      console.warn("file is ", typeof file);
      return false; // TODO this is a temporary fix for a bug
    }
    return file.type.includes("image");
  }

  getFileImageSrc(file: File): string {
    if (!file || !this.fileIsImage(file)) {
      return "";
    }

    const src: string = URL.createObjectURL(file);
    console.log(file, "src", src);
    return src;
  }

  uploadMedia(media: UploadMedia, index: number) {
    console.log("Starting media upload", media);

    if (!this.storageFolder) {
      console.error("No storage folder specified for media upload");
      return;
    }

    let fileEnding = media.file.name.split(".").pop();

    let filename = generateUUID();

    this._storageService
      .setUploadToStorage(
        media.file,
        this.storageFolder,
        (progress: number) => {
          this.mediaList.update((list) => {
            list[index] = {
              ...list[index],
              uploadProgress: progress,
            };
            return list;
          });
        },
        filename,
        fileEnding
      )
      .then(
        (imageLink) => {
          this.mediaFinishedUploading(media, imageLink);
          this.mediaList.update((list) => {
            list[index] = {
              ...list[index],
              uploadProgress: 100,
            };
            return list;
          });
        },
        (error) => {
          console.error("Error uploading media: ", error);
          this._snackbar.open(
            $localize`Error uploading media!`,
            $localize`OK`,
            {
              duration: 5000,
            }
          );
        }
      );
  }

  mediaFinishedUploading(media: UploadMedia, url: string) {
    let isSized = false;

    console.log("downloadUrl", url);

    if (
      [StorageBucket.SpotPictures, StorageBucket.ProfilePictures].includes(
        this.storageFolder!
      )
    ) {
      isSized = true;
    }
    this.newMedia.emit({ src: url, is_sized: isSized, type: media.type });
  }

  clear() {
    this.uploadFile = null;
    this.mediaList.set([]);
    this.changed.emit();
  }
}
