import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { vi } from "vitest";

import { ProfilePictureDialogComponent } from "./profile-picture-dialog.component";

describe("ProfilePictureDialogComponent", () => {
  let component: ProfilePictureDialogComponent;
  let fixture: ComponentFixture<ProfilePictureDialogComponent>;
  const dialogRef = { close: vi.fn() };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfilePictureDialogComponent],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            src: "https://example.com/profile.jpg",
            alt: "Profile picture",
          },
        },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfilePictureDialogComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it("renders exactly one profile-picture slide", () => {
    expect(component).toBeTruthy();
    expect(
      fixture.nativeElement.querySelectorAll(".swiper-slide")
    ).toHaveLength(1);
  });

  it("closes from its close action", () => {
    component.close();

    expect(dialogRef.close).toHaveBeenCalledOnce();
  });
});
