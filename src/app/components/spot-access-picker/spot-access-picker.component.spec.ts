import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { MatSelect } from "@angular/material/select";
import { SpotAccess } from "../../../db/schemas/SpotTypeAndAccess";

import { SpotAccessPickerComponent } from "./spot-access-picker.component";

describe("SpotAccessPickerComponent", () => {
  let component: SpotAccessPickerComponent;
  let fixture: ComponentFixture<SpotAccessPickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpotAccessPickerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SpotAccessPickerComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("shows the selected access icon, name, and description", async () => {
    fixture.componentRef.setInput("value", SpotAccess.Private);
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain("lock");
    expect(text).toContain("Private");
    expect(text).toContain("Ask for permission before training here");
  });

  it("offers every access level", () => {
    const select = fixture.debugElement.query(By.directive(MatSelect))
      .componentInstance as MatSelect;

    expect(select.options.length).toBe(Object.values(SpotAccess).length);
  });
});
