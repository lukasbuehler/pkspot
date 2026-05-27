import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchService } from "../../services/search.service";
import { SearchFieldComponent } from "./search-field.component";

describe("SearchFieldComponent", () => {
  let fixture: ComponentFixture<SearchFieldComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SearchFieldComponent],
      providers: [
        {
          provide: SearchService,
          useValue: {
            searchCommunities: vi.fn().mockResolvedValue([]),
            searchEvents: vi.fn().mockResolvedValue([]),
            searchPlaces: vi.fn().mockResolvedValue([]),
            searchSpots: vi.fn().mockResolvedValue({ hits: [], found: 0 }),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(SearchFieldComponent);
  });

  it("shows the default search affordance when no map context is active", () => {
    fixture.detectChanges();

    const input = fixture.debugElement.query(By.css("input"))
      .nativeElement as HTMLInputElement;

    expect(input.placeholder).toBe("Find spots and more");
    expect(
      fixture.debugElement.query(By.css("mat-icon")).nativeElement.textContent,
    ).toContain("search");
    expect(fixture.debugElement.query(By.css("button"))).toBeNull();
  });

  it("shows active map context and emits when clearing it", () => {
    const clears: void[] = [];
    fixture.componentInstance.contextClear.subscribe((value) =>
      clears.push(value),
    );
    fixture.componentRef.setInput("contextLabel", "Spots For Parkour");

    fixture.detectChanges();
    const input = fixture.debugElement.query(By.css("input"))
      .nativeElement as HTMLInputElement;
    const button = fixture.debugElement.query(By.css("button"));

    expect(input.placeholder).toBe("Spots For Parkour");
    expect(button.nativeElement.getAttribute("aria-label")).toBe(
      "Clear search filters",
    );

    button.nativeElement.click();

    expect(clears.length).toBe(1);
  });
});
