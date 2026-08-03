import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { MatSelect } from "@angular/material/select";
import { SpotTypes } from "../../../db/schemas/SpotTypeAndAccess";

import { SpotTypePickerComponent } from "./spot-type-picker.component";

describe("SpotTypePickerComponent", () => {
  let component: SpotTypePickerComponent;
  let fixture: ComponentFixture<SpotTypePickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpotTypePickerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SpotTypePickerComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("shows the selected type icon, name, and description", async () => {
    fixture.componentRef.setInput("value", SpotTypes.PkPark);
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain("castle");
    expect(text).toContain("Parkour Park");
    expect(text).toContain("purpose-built outdoor Parkour area");
  });

  it("offers every spot type", () => {
    const select = fixture.debugElement.query(By.directive(MatSelect))
      .componentInstance as MatSelect;

    expect(select.options.length).toBe(Object.values(SpotTypes).length);
  });
});
