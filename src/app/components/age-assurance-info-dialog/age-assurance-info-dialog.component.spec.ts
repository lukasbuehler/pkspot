import { ComponentFixture, TestBed } from "@angular/core/testing";

import { AgeAssuranceInfoDialogComponent } from "./age-assurance-info-dialog.component";

describe("AgeAssuranceInfoDialogComponent", () => {
  let component: AgeAssuranceInfoDialogComponent;
  let fixture: ComponentFixture<AgeAssuranceInfoDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgeAssuranceInfoDialogComponent],
    })
      .compileComponents();

    fixture = TestBed.createComponent(AgeAssuranceInfoDialogComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it("explains the public-profile boundary without claiming exact age data", () => {
    expect(component).toBeTruthy();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? "";
    expect(text).toContain("Public identity needs a higher bar");
    expect(text).toContain("Core features remain available");
    expect(text).toContain("Sharing is separate from verification");
    expect(text).toContain("asks only for an age range");
    expect(text).toContain("does not ask Apple for your exact age or birthday");
    expect(text).toContain("Self-declared age alone");
  });
});
