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
import { humanFileSize } from "../../scripts/Helpers";
import { NgIf, NgOptimizedImage } from "@angular/common";
import { MatInput } from "@angular/material/input";
import {
  MatFormField,
  MatLabel,
  MatSuffix,
  MatHint,
  MatError,
} from "@angular/material/form-field";
import { MatIcon } from "@angular/material/icon";
import { MatMiniFabButton } from "@angular/material/button";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import {
  StorageFolder,
  StorageService,
} from "../services/firebase/storage.service";
import { SizedStorageSrc } from "../../db/models/Interfaces";

export interface Media {
  file: File;
  previewSrc: string;
  uploadProgress: number;
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
    NgIf,
    // MatHint,
    MatError,
    MatProgressBarModule,
    MatProgressSpinnerModule,
  ],
})
export class MediaUpload implements OnInit, ControlValueAccessor {
  @Input() required: boolean = false;
  @Input() multipleAllowed: boolean = false;
  @Input() storageFolder: StorageFolder | null = null;
  @Input() maximumSizeInBytes: number | null = null;
  @Input() allowedMimeTypes: string[] | null = null;
  @Input() acceptString: string | null = null;
  @Output() changed = new EventEmitter<void>();
  @Output() newMedia = new EventEmitter<{ url: SizedStorageSrc }>();

  private _storageService = inject(StorageService);

  showPreview = signal(true);

  mediaList = signal<Media[]>([]);
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
    if (this.storageFolder === null) {
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
      const _mediaList: Media[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];

        const newMedia: Media = {
          previewSrc: this.getFileImageSrc(file),
          file: file,
          uploadProgress: 0,
        };

        _mediaList.push(newMedia);
        this.uploadMedia(newMedia, i);
      }
      this.mediaList.set(_mediaList);
    }

    // if (!file) {
    //   return;
    // }
    // this.hasError = false;
    // let type = file.type;
    // if (this.allowedMimeTypes && this.allowedMimeTypes.includes(type)) {
    //   if (
    //     this.maximumSizeInBytes !== null &&
    //     file.size > this.maximumSizeInBytes
    //   ) {
    //     // The selected file is too large
    //     console.log(
    //       `The selected file was too big. (Max: ${humanFileSize(
    //         this.maximumSizeInBytes
    //       )})`
    //     );
    //     this._errorMessage = `The selected file was too big. (It needs to be less than ${humanFileSize(
    //       this.maximumSizeInBytes
    //     )})`;
    //     this.hasError = true;
    //     return;
    //   }
    // } else {
    //   console.log(
    //     "A file was selected, but its mimetype is not allowed. Please select a different file.\n" +
    //       "Mimetype of selected file is '" +
    //       type +
    //       "', allowed mime types are: " +
    //       (this.allowedMimeTypes
    //         ? this.allowedMimeTypes.join(", ")
    //         : "undefined") +
    //       "\n"
    //   );
    //   this._errorMessage = "The type of this file is not allowed";
    //   this.hasError = true;
    //   return;
    // }
    // this.uploadFile = file;
    // this.uploadFileName = this.uploadFile.name;
    // this.uploadFileSizeString = humanFileSize(this.uploadFile.size, true);
    // //console.log("File selected");
    // this.changed.emit(); // Emit changes
    // this.uploadMedia.emit(this.uploadFile);
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
      console.warn(
        "Cannot make image src file is",
        typeof file,
        "type:",
        file?.type
      );
      return "";
    }

    const src: string = URL.createObjectURL(file);
    console.log(file, "src", src);
    return src;
  }

  uploadMedia(media: Media, index: number) {
    console.log("Starting media upload", media);

    if (!this.storageFolder) {
      console.error("No storage folder specified for media upload");
      return;
    }

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
        }
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
        }
      );
  }

  mediaFinishedUploading(media: Media, imageLink: string) {
    this.newMedia.emit({ url: imageLink as SizedStorageSrc });
  }

  clear() {
    this.uploadFile = null;
    this.mediaList.set([]);
    this.changed.emit();
  }
}
