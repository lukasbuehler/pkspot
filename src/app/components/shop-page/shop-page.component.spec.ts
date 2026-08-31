import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { ShopPageComponent } from "./shop-page.component";

describe("ShopPageComponent", () => {
  let component: ShopPageComponent;
  let fixture: ComponentFixture<ShopPageComponent>;
  const metaTagService = { setStaticPageMetaTags: vi.fn() };

  beforeEach(async () => {
    metaTagService.setStaticPageMetaTags.mockReset();
    await TestBed.configureTestingModule({
      imports: [ShopPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthenticationService,
          useValue: { isAdmin: () => false },
        },
        { provide: MetaTagService, useValue: metaTagService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShopPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it("renders exactly the three current catalogue items", () => {
    expect(component.items.map((item) => item.name)).toEqual([
      "Support PK Spot",
      "Nice Spot Sticker Support Pack",
      "Super Secret Shirt",
    ]);
    expect(fixture.nativeElement.textContent).toContain(
      "Super Secret Shirt",
    );
    expect(metaTagService.setStaticPageMetaTags).toHaveBeenCalledWith(
      "PK Spot Shop",
      expect.any(String),
      undefined,
      "/shop",
    );
  });
});
