import { TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { signal } from "@angular/core";
import { ActivatedRoute, convertToParamMap } from "@angular/router";
import { BehaviorSubject, of } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { MediaUploadStatusService } from "../../services/firebase/firestore/media-upload-status.service";
import { OrganizationsService } from "../../services/firebase/firestore/organizations.service";
import { StorageService } from "../../services/firebase/storage.service";
import { OrganizationAdminPageComponent } from "./organization-admin-page.component";

describe("OrganizationAdminPageComponent", () => {
  const organization = {
    id: "pkspot",
    name: "PK Spot",
    slug: "pk-spot",
    logo_url: "https://example.com/logo.svg",
    logo_background_color: "transparent",
    active: true,
  };
  let organizationsService: {
    getOrganizations: ReturnType<typeof vi.fn>;
    createOrganization: ReturnType<typeof vi.fn>;
    updateOrganization: ReturnType<typeof vi.fn>;
    removeOrganizationLogo: ReturnType<typeof vi.fn>;
    upsertMemberByUserId: ReturnType<typeof vi.fn>;
  };
  let storageService: {
    setUploadToStorageWithResult: ReturnType<typeof vi.fn>;
  };
  let mediaUploadStatusService: {
    waitForPublishedUpload: ReturnType<typeof vi.fn>;
  };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let queryParamMap: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(() => {
    organizationsService = {
      getOrganizations: vi.fn().mockResolvedValue([organization]),
      createOrganization: vi.fn().mockResolvedValue(undefined),
      updateOrganization: vi.fn().mockResolvedValue(undefined),
      removeOrganizationLogo: vi.fn().mockResolvedValue(undefined),
      upsertMemberByUserId: vi.fn().mockResolvedValue(undefined),
    };
    storageService = {
      setUploadToStorageWithResult: vi.fn().mockResolvedValue({
        url: "https://firebasestorage.googleapis.com/v0/b/demo/o/organization_media%2Fnew-org.png?alt=media",
        uploadId: "upload-1",
      }),
    };
    mediaUploadStatusService = {
      waitForPublishedUpload: vi.fn().mockResolvedValue(
        "https://firebasestorage.googleapis.com/v0/b/demo/o/organization_media%2Fnew-org.png?alt=media",
      ),
    };
    dialog = {
      open: vi.fn(),
    };
    queryParamMap = new BehaviorSubject(convertToParamMap({}));
    const authState = new BehaviorSubject({ data: { isAdmin: true } });
    const authService = {
      authState$: authState,
      initialAuthStateResolved: signal(true),
      user: { uid: "admin-user", data: { isAdmin: true } },
    };

    TestBed.configureTestingModule({
      imports: [OrganizationAdminPageComponent],
      providers: [
        { provide: OrganizationsService, useValue: organizationsService },
        {
          provide: MediaUploadStatusService,
          useValue: mediaUploadStatusService,
        },
        { provide: StorageService, useValue: storageService },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: AuthenticationService, useValue: authService },
        { provide: ActivatedRoute, useValue: { queryParamMap } },
      ],
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:logo-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  async function createComponent(): Promise<OrganizationAdminPageComponent> {
    const fixture = TestBed.createComponent(OrganizationAdminPageComponent);
    await fixture.componentInstance.reload();
    return fixture.componentInstance;
  }

  it("loads an existing organization into the edit form", async () => {
    const component = await createComponent();

    component.selectOrganization("pkspot");

    expect(component.editOrgName()).toBe("PK Spot");
    expect(component.editOrgLogoMode()).toBe("external");
    expect(component.editOrgLogoPreview()).toBe(
      "https://example.com/logo.svg",
    );
  });

  it("selects an organization requested by the admin edit link", async () => {
    queryParamMap.next(convertToParamMap({ organization: "pkspot" }));

    const component = await createComponent();

    expect(component.selectedOrganizationId()).toBe("pkspot");
    expect(component.editOrgName()).toBe("PK Spot");
  });

  it("creates the organization before publishing a staged square logo URL", async () => {
    const component = await createComponent();
    const cropped = new File(["logo"], "new-org.png", { type: "image/png" });
    dialog.open.mockReturnValue({ afterClosed: () => of(cropped) });
    component.newOrgId.set("new-org");
    component.newOrgName.set("New Org");
    component.newOrgSlug.set("new-org");

    await component.chooseLogo(
      { target: { files: [cropped], value: "logo" } } as unknown as Event,
      "create",
    );
    await component.createOrganization();

    expect(organizationsService.createOrganization).toHaveBeenCalledWith(
      "new-org",
      expect.objectContaining({ name: "New Org", slug: "new-org" }),
    );
    expect(storageService.setUploadToStorageWithResult).toHaveBeenCalledWith(
      cropped,
      "organization_media",
      undefined,
      "new-org",
      "png",
      "public, max-age=31536000",
      "organization",
      "new-org",
    );
    expect(mediaUploadStatusService.waitForPublishedUpload).toHaveBeenCalledWith(
      "upload-1",
    );
    expect(organizationsService.updateOrganization).toHaveBeenCalledWith(
      "new-org",
      {
        logo_url:
          "https://firebasestorage.googleapis.com/v0/b/demo/o/organization_media%2Fnew-org_800x800.png?alt=media",
      },
    );
  });

  it("uses the configured logo background in the edit preview", async () => {
    const fixture = TestBed.createComponent(OrganizationAdminPageComponent);
    await fixture.componentInstance.reload();
    fixture.componentInstance.selectOrganization("pkspot");
    fixture.componentInstance.editOrgLogoBackgroundColor.set("#101010");
    await fixture.whenStable();

    const preview = fixture.nativeElement.querySelector(
      "img[alt='Organization logo preview']",
    ) as HTMLImageElement | null;
    expect(preview?.style.background).toBe("rgb(16, 16, 16)");
  });

  it("removes an existing logo when the edit mode is none", async () => {
    const component = await createComponent();
    component.selectOrganization("pkspot");
    component.setLogoMode("edit", "none");

    await component.saveOrganization();

    expect(organizationsService.removeOrganizationLogo).toHaveBeenCalledWith(
      "pkspot",
    );
  });

  it("keeps a server-rejected logo staged in the created organization editor", async () => {
    const component = await createComponent();
    const cropped = new File(["logo"], "retry.png", { type: "image/png" });
    dialog.open.mockReturnValue({ afterClosed: () => of(cropped) });
    mediaUploadStatusService.waitForPublishedUpload.mockRejectedValueOnce(
      new Error("media processing failed"),
    );
    organizationsService.getOrganizations.mockResolvedValue([
      organization,
      {
        id: "retry-org",
        name: "Retry Org",
        slug: "retry-org",
        active: true,
      },
    ]);
    component.newOrgId.set("retry-org");
    component.newOrgName.set("Retry Org");
    component.newOrgSlug.set("retry-org");

    await component.chooseLogo(
      { target: { files: [cropped], value: "logo" } } as unknown as Event,
      "create",
    );
    await component.createOrganization();

    expect(component.selectedOrganizationId()).toBe("retry-org");
    expect(component.editOrgLogoMode()).toBe("upload");
    expect(component.editOrgLogoFile()).toBe(cropped);
  });
});
