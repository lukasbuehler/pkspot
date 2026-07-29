import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatDialog } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIcon } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatSnackBar } from "@angular/material/snack-bar";
import { firstValueFrom, Subscription } from "rxjs";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  OrganizationDocument,
  OrganizationsService,
} from "../../services/firebase/firestore/organizations.service";
import { StorageService } from "../../services/firebase/storage.service";
import { StorageImage } from "../../../db/models/Media";
import { StorageBucket } from "../../../db/schemas/Media";
import { OrganizationRole } from "../../../db/schemas/OrganizationSchema";
import {
  ImageCropDialogComponent,
  type ImageCropDialogData,
} from "../crop-image/image-crop-dialog.component";
import { SQUARE_ICON_CROP_POLICY } from "../crop-image/image-crop-policy";

type LogoSourceMode = "upload" | "external" | "none";
type OrganizationFormTarget = "create" | "edit";

@Component({
  selector: "app-organization-admin-page",
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIcon,
    MatInputModule,
  ],
  templateUrl: "./organization-admin-page.component.html",
  styleUrl: "./organization-admin-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationAdminPageComponent implements OnDestroy {
  private readonly organizationsService = inject(OrganizationsService);
  private readonly storageService = inject(StorageService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  readonly authService = inject(AuthenticationService);

  readonly organizations = signal<OrganizationDocument[]>([]);
  readonly newOrgId = signal("");
  readonly newOrgName = signal("");
  readonly newOrgSlug = signal("");
  readonly newOrgLogoUrl = signal("");
  readonly newOrgLogoBackgroundColor = signal("");
  readonly newOrgLogoMode = signal<LogoSourceMode>("external");
  readonly newOrgLogoFile = signal<File | null>(null);
  readonly newOrgLogoPreview = signal("");

  readonly selectedOrganizationId = signal("");
  readonly editOrgName = signal("");
  readonly editOrgSlug = signal("");
  readonly editOrgLogoUrl = signal("");
  readonly editOrgLogoBackgroundColor = signal("");
  readonly editOrgLogoMode = signal<LogoSourceMode>("none");
  readonly editOrgLogoFile = signal<File | null>(null);
  readonly editOrgLogoPreview = signal("");

  readonly memberUserId = signal("");
  readonly memberRole = signal<OrganizationRole>("owner");
  readonly isAdmin = signal(false);
  readonly isSaving = signal(false);
  readonly authResolved = this.authService.initialAuthStateResolved;
  private readonly authSubscription: Subscription;
  private hasLoadedOrganizations = false;

  constructor() {
    this.authSubscription = this.authService.authState$.subscribe(() => {
      const isAdmin = this.authService.user.data?.isAdmin === true;
      this.isAdmin.set(isAdmin);
      if (isAdmin && !this.hasLoadedOrganizations) {
        this.hasLoadedOrganizations = true;
        void this.reload();
      }
    });
  }

  ngOnDestroy(): void {
    this.authSubscription.unsubscribe();
    this.revokePreview(this.newOrgLogoPreview());
    this.revokePreview(this.editOrgLogoPreview());
  }

  async reload(): Promise<void> {
    this.organizations.set(
      await this.organizationsService.getOrganizations(),
    );
  }

  async chooseLogo(event: Event, target: OrganizationFormTarget): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    const croppedFile = await firstValueFrom(
      this.dialog
        .open<
          ImageCropDialogComponent,
          ImageCropDialogData,
          File | undefined
        >(ImageCropDialogComponent, {
          data: {
            file,
            policy: SQUARE_ICON_CROP_POLICY,
            title: $localize`Crop organization logo`,
          },
          maxWidth: "100vw",
          maxHeight: "100dvh",
          panelClass: "image-crop-dialog-panel",
        })
        .afterClosed(),
      { defaultValue: undefined },
    );
    if (!croppedFile) return;

    if (target === "create") {
      this.revokePreview(this.newOrgLogoPreview());
      this.newOrgLogoFile.set(croppedFile);
      this.newOrgLogoPreview.set(URL.createObjectURL(croppedFile));
      this.newOrgLogoMode.set("upload");
      return;
    }
    this.revokePreview(this.editOrgLogoPreview());
    this.editOrgLogoFile.set(croppedFile);
    this.editOrgLogoPreview.set(URL.createObjectURL(croppedFile));
    this.editOrgLogoMode.set("upload");
  }

  setLogoMode(target: OrganizationFormTarget, mode: LogoSourceMode): void {
    if (target === "create") {
      if (mode !== "upload") {
        this.revokePreview(this.newOrgLogoPreview());
        this.newOrgLogoFile.set(null);
        this.newOrgLogoPreview.set("");
      }
      this.newOrgLogoMode.set(mode);
    } else {
      if (mode !== "upload") {
        this.revokePreview(this.editOrgLogoPreview());
        this.editOrgLogoFile.set(null);
        this.editOrgLogoPreview.set(
          mode === "external" ? this.editOrgLogoUrl() : "",
        );
      }
      this.editOrgLogoMode.set(mode);
    }
  }

  updateEditExternalLogoUrl(url: string): void {
    this.revokePreview(this.editOrgLogoPreview());
    this.editOrgLogoUrl.set(url);
    this.editOrgLogoPreview.set(url);
  }

  async createOrganization(): Promise<void> {
    const organizationId = this.newOrgId().trim();
    if (!this.isValidOrganizationId(organizationId)) {
      this.showError(
        $localize`Use only letters, numbers, underscores, or hyphens in the organization ID.`,
      );
      return;
    }
    if (!this.newOrgName().trim() || !this.newOrgSlug().trim()) {
      this.showError($localize`Organization name and slug are required.`);
      return;
    }

    this.isSaving.set(true);
    const stagedLogoFile =
      this.newOrgLogoMode() === "upload" ? this.newOrgLogoFile() : null;
    try {
      const externalLogo =
        this.newOrgLogoMode() === "external"
          ? this.newOrgLogoUrl().trim()
          : "";
      await this.organizationsService.createOrganization(organizationId, {
        name: this.newOrgName().trim(),
        slug: this.newOrgSlug().trim(),
        ...(externalLogo ? { logo_url: externalLogo } : {}),
        ...(this.newOrgLogoBackgroundColor().trim()
          ? {
              logo_background_color:
                this.newOrgLogoBackgroundColor().trim(),
            }
          : {}),
        active: true,
      });

      const logoFile = this.newOrgLogoFile();
      if (this.newOrgLogoMode() === "upload" && logoFile) {
        const logoUrl = await this.uploadOrganizationLogo(
          organizationId,
          logoFile,
        );
        await this.organizationsService.updateOrganization(organizationId, {
          logo_url: logoUrl,
        });
      }
      await this.reload();
      this.selectOrganization(organizationId);
      this.resetCreateForm();
      this.snackBar.open(
        $localize`Organization created.`,
        $localize`Dismiss`,
        { duration: 3000 },
      );
    } catch (error) {
      console.error("Failed to create organization:", error);
      this.showError(
        $localize`The organization was created or updated only partially. Review it and retry the logo if needed.`,
      );
      await this.reload();
      if (
        this.organizations().some(
          (organization) => organization.id === organizationId,
        )
      ) {
        this.selectOrganization(organizationId);
        if (stagedLogoFile) {
          this.revokePreview(this.editOrgLogoPreview());
          this.editOrgLogoFile.set(stagedLogoFile);
          this.editOrgLogoPreview.set(URL.createObjectURL(stagedLogoFile));
          this.editOrgLogoMode.set("upload");
        }
      }
    } finally {
      this.isSaving.set(false);
    }
  }

  selectOrganization(id: string): void {
    this.selectedOrganizationId.set(id);
    const organization = this.organizations().find((item) => item.id === id);
    if (!organization) {
      this.clearEditForm();
      return;
    }

    this.revokePreview(this.editOrgLogoPreview());
    this.editOrgName.set(organization.name);
    this.editOrgSlug.set(organization.slug);
    this.editOrgLogoUrl.set(organization.logo_url ?? "");
    this.editOrgLogoBackgroundColor.set(
      organization.logo_background_color ?? "",
    );
    this.editOrgLogoFile.set(null);
    this.editOrgLogoPreview.set(organization.logo_url ?? "");
    this.editOrgLogoMode.set(
      organization.logo_url
        ? this.isOrganizationStorageUrl(organization.logo_url)
          ? "upload"
          : "external"
        : "none",
    );
  }

  async saveOrganization(): Promise<void> {
    const id = this.selectedOrganizationId();
    if (!id) return;
    if (!this.editOrgName().trim() || !this.editOrgSlug().trim()) {
      this.showError($localize`Organization name and slug are required.`);
      return;
    }
    this.isSaving.set(true);
    try {
      let logoUrl: string | undefined;
      if (this.editOrgLogoMode() === "upload") {
        const file = this.editOrgLogoFile();
        logoUrl = file
          ? await this.uploadOrganizationLogo(id, file)
          : this.editOrgLogoUrl().trim() || undefined;
      } else if (this.editOrgLogoMode() === "external") {
        logoUrl = this.editOrgLogoUrl().trim() || undefined;
      }

      await this.organizationsService.updateOrganization(id, {
        name: this.editOrgName().trim(),
        slug: this.editOrgSlug().trim(),
        logo_background_color: this.editOrgLogoBackgroundColor().trim(),
        ...(logoUrl ? { logo_url: logoUrl } : {}),
      });
      if (this.editOrgLogoMode() === "none") {
        await this.organizationsService.removeOrganizationLogo(id);
      }
      await this.reload();
      this.selectOrganization(id);
      this.snackBar.open(
        $localize`Organization saved.`,
        $localize`Dismiss`,
        { duration: 3000 },
      );
    } catch (error) {
      console.error("Failed to save organization:", error);
      this.showError($localize`Organization changes could not be saved.`);
    } finally {
      this.isSaving.set(false);
    }
  }

  async addMember(): Promise<void> {
    const uid = this.memberUserId().trim() || this.authService.user.uid;
    if (!uid || !this.selectedOrganizationId()) return;
    await this.organizationsService.upsertMemberByUserId(
      this.selectedOrganizationId(),
      uid,
      this.memberRole(),
    );
  }

  private async uploadOrganizationLogo(
    organizationId: string,
    file: File,
  ): Promise<string> {
    const extension = file.name.split(".").pop();
    const result = await this.storageService.setUploadToStorageWithResult(
      file,
      StorageBucket.OrganizationMedia,
      undefined,
      organizationId,
      extension,
      "public, max-age=31536000",
      "organization",
      organizationId,
    );
    return new StorageImage(result.url).getSrc(800);
  }

  private resetCreateForm(): void {
    this.revokePreview(this.newOrgLogoPreview());
    this.newOrgId.set("");
    this.newOrgName.set("");
    this.newOrgSlug.set("");
    this.newOrgLogoUrl.set("");
    this.newOrgLogoBackgroundColor.set("");
    this.newOrgLogoMode.set("external");
    this.newOrgLogoFile.set(null);
    this.newOrgLogoPreview.set("");
  }

  private clearEditForm(): void {
    this.revokePreview(this.editOrgLogoPreview());
    this.editOrgName.set("");
    this.editOrgSlug.set("");
    this.editOrgLogoUrl.set("");
    this.editOrgLogoBackgroundColor.set("");
    this.editOrgLogoMode.set("none");
    this.editOrgLogoFile.set(null);
    this.editOrgLogoPreview.set("");
  }

  private isValidOrganizationId(id: string): boolean {
    return /^[A-Za-z0-9_-]+$/.test(id);
  }

  private isOrganizationStorageUrl(url: string): boolean {
    return url.includes("organization_media%2F") ||
      url.includes("organization_media/");
  }

  private revokePreview(preview: string): void {
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
  }

  private showError(message: string): void {
    this.snackBar.open(message, $localize`Dismiss`, { duration: 6000 });
  }
}
