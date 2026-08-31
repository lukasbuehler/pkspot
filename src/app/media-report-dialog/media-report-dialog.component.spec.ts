import { TestBed } from "@angular/core/testing";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { Subject } from "rxjs";
import type { AnyMedia } from "../../db/models/Media";
import { AuthenticationService } from "../services/firebase/authentication.service";
import { MediaReportsService } from "../services/firebase/firestore/media-reports.service";
import { UsersService } from "../services/firebase/firestore/users.service";
import { NotificationOptInService } from "../services/notification-opt-in.service";
import { MediaReportDialogComponent } from "./media-report-dialog.component";

describe("MediaReportDialogComponent", () => {
  const afterClosed = new Subject<boolean>();
  const maybePrompt = vi.fn().mockResolvedValue(undefined);
  const submitMediaReport = vi.fn().mockResolvedValue({reportId: "report-1", created: true});
  const getOwnMediaReport = vi.fn().mockResolvedValue(null);
  const dialogRef = {
    afterClosed: () => afterClosed.asObservable(),
    close: vi.fn((result: boolean) => afterClosed.next(result)),
    disableClose: false,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [MediaReportDialogComponent],
      providers: [
        {provide: MAT_DIALOG_DATA, useValue: {media: {} as AnyMedia, spotId: "spot-1"}},
        {provide: MatDialogRef, useValue: dialogRef},
        {provide: AuthenticationService, useValue: {authState$: new Subject()}},
        {provide: UsersService, useValue: {}},
        {provide: MediaReportsService, useValue: {submitMediaReport, getOwnMediaReport}},
        {provide: NotificationOptInService, useValue: {maybePrompt}},
      ],
    }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  it("prompts signed-in reporters after a new multi-reason report closes", async () => {
    const component = TestBed.createComponent(MediaReportDialogComponent).componentInstance;
    component.isAuthenticated.set(true);
    component.selectedReasons.set(["other", "bad quality"]);
    component.reportForm.setValue({comment: "Please review", duplicateMediaUrl: "", reporterEmail: ""});

    component.submitReport();
    await vi.waitFor(() => expect(dialogRef.close).toHaveBeenCalledWith(true));

    expect(submitMediaReport).toHaveBeenCalledWith(
      expect.anything(),
      ["other", "bad quality"],
      "Please review",
      undefined,
      expect.anything(),
      "spot-1",
      "spot",
      "spot-1",
      "",
    );
    expect(maybePrompt).toHaveBeenCalledWith("report_updates");
  });

  it("submits serious reports for signed-out users without prompting", async () => {
    const component = TestBed.createComponent(MediaReportDialogComponent).componentInstance;
    component.isAuthenticated.set(false);
    component.selectedReasons.set(["person did not consent"]);
    component.reportForm.setValue({comment: "Please review", duplicateMediaUrl: "", reporterEmail: "reporter@example.com"});

    component.submitReport();
    await vi.waitFor(() => expect(dialogRef.close).toHaveBeenCalledWith(true));

    expect(submitMediaReport).toHaveBeenCalledWith(
      expect.anything(),
      ["person did not consent"],
      "Please review",
      "reporter@example.com",
      expect.anything(),
      "spot-1",
      "spot",
      "spot-1",
      "",
    );
    expect(maybePrompt).not.toHaveBeenCalled();
  });

  it("does not submit quality reports for signed-out users", () => {
    const component = TestBed.createComponent(MediaReportDialogComponent).componentInstance;
    component.isAuthenticated.set(false);
    component.selectedReasons.set(["duplicate"]);
    component.reportForm.setValue({comment: "", duplicateMediaUrl: "", reporterEmail: ""});

    component.submitReport();

    expect(submitMediaReport).not.toHaveBeenCalled();
  });

  it("requires and submits the duplicate-media target", async () => {
    const component = TestBed.createComponent(MediaReportDialogComponent).componentInstance;
    component.isAuthenticated.set(true);
    component.selectedReasons.set(["duplicate"]);
    component.reportForm.setValue({comment: "", duplicateMediaUrl: "", reporterEmail: ""});

    component.submitReport();
    expect(submitMediaReport).not.toHaveBeenCalled();

    component.reportForm.controls["duplicateMediaUrl"].setValue("https://example.test/original.jpg");
    component.submitReport();
    await vi.waitFor(() => expect(dialogRef.close).toHaveBeenCalledWith(true));

    expect(submitMediaReport).toHaveBeenLastCalledWith(
      expect.anything(),
      ["duplicate"],
      "",
      undefined,
      expect.anything(),
      "spot-1",
      "spot",
      "spot-1",
      "https://example.test/original.jpg",
    );
  });
});
