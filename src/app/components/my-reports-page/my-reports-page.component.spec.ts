import {ComponentFixture, TestBed} from "@angular/core/testing";
import {provideRouter} from "@angular/router";
import type {OwnReportSummary} from "../../../db/schemas/ReportLifecycleSchema";
import {AuthenticationService} from "../../services/firebase/authentication.service";
import {ReporterReportsService} from "../../services/firebase/firestore/reporter-reports.service";
import {MyReportsPageComponent} from "./my-reports-page.component";

describe("MyReportsPageComponent", () => {
  let fixture: ComponentFixture<MyReportsPageComponent>;
  const auth = {isSignedIn: true};
  const reports: OwnReportSummary[] = [
    {
      id: "open-spot-report",
      kind: "spot",
      status: "open",
      reasons: ["private", "other"],
      comment: "The gate is closed.",
      spot: {id: "spot-1", name: "Central Station"},
    },
    {
      id: "withdrawn-media-report",
      kind: "media",
      status: "withdrawn",
      reasons: ["bad quality"],
      comment: "",
      media: {type: "image", src: "https://example.test/report.jpg"},
    },
  ];
  const reporterReports = {listMine: vi.fn()};

  beforeEach(async () => {
    vi.clearAllMocks();
    reporterReports.listMine.mockResolvedValue(reports);
    await TestBed.configureTestingModule({
      imports: [MyReportsPageComponent],
      providers: [
        provideRouter([]),
        {provide: AuthenticationService, useValue: auth},
        {provide: ReporterReportsService, useValue: reporterReports},
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MyReportsPageComponent);
    await fixture.whenStable();
  });

  it("separates the caller's open reports from terminal history", () => {
    const component = fixture.componentInstance;

    expect(reporterReports.listMine).toHaveBeenCalledOnce();
    expect(component.openReports()).toEqual([reports[0]]);
    expect(component.historyReports()).toEqual([reports[1]]);
  });
});
