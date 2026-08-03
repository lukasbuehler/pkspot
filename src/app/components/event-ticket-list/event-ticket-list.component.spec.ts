import { LOCALE_ID } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventTicketOption } from "../../../db/models/Event";
import { EventTicketListComponent } from "./event-ticket-list.component";

const tickets: EventTicketOption[] = [
  {
    id: "regular",
    label: "Regular pass",
    description: "Access to the full event program.",
    url: "https://tickets.example/regular",
    price: { amount: 25, currency: "CHF" },
    availability: "available",
    badge: "regular",
  },
  {
    id: "discount",
    label: "Promotional pass",
    url: "https://tickets.example/discount",
    price: { amount: 90, currency: "CHF" },
    originalPrice: { amount: 120, currency: "CHF" },
    availability: "available",
    badge: "discount",
  },
  {
    id: "range",
    label: "Supporter pass",
    url: "https://tickets.example/supporter",
    price: { min_amount: 30, max_amount: 50, currency: "CHF" },
    availability: "waitlist",
  },
  {
    id: "sold-out",
    label: "Team pass",
    url: "https://tickets.example/team",
    availability: "sold_out",
  },
  {
    id: "coming-soon",
    label: "Day pass",
    availability: "coming_soon",
    price: { amount: 15, currency: "CHF" },
  },
  {
    id: "ended",
    label: "Early bird",
    url: "https://tickets.example/early",
    availability: "ended",
    badge: "early_bird",
    price: { amount: 10, currency: "CHF" },
  },
];

describe("EventTicketListComponent", () => {
  let fixture: ComponentFixture<EventTicketListComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideNoopAnimations(),
        { provide: LOCALE_ID, useValue: "en" },
      ],
    });
    fixture = TestBed.createComponent(EventTicketListComponent);
    fixture.componentRef.setInput("tickets", tickets);
  });

  it("prioritizes prices and hides the normal available status", async () => {
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("CHF");
    expect(text).toContain("25");
    expect(text).toContain("30");
    expect(text).toContain("50");
    expect(text).toContain("Price TBA");
    expect(text).not.toContain("Available");
  });

  it("shows every exceptional availability state", async () => {
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("Coming soon");
    expect(text).toContain("Waitlist");
    expect(text).toContain("Sold out");
    expect(text).toContain("Ended");
  });

  it("uses purchase actions only for tickets currently available", async () => {
    await fixture.whenStable();

    const primaryActions = fixture.nativeElement.querySelectorAll(
      'a.ticket-action:not(.ticket-action--details)',
    ) as NodeListOf<HTMLAnchorElement>;
    const detailActions = fixture.nativeElement.querySelectorAll(
      "a.ticket-action--details",
    ) as NodeListOf<HTMLAnchorElement>;

    expect(primaryActions).toHaveLength(2);
    expect(primaryActions[0].textContent).toContain("Get ticket");
    expect(detailActions).toHaveLength(3);
    expect(
      [...detailActions].every((link) =>
        link.textContent?.includes("View details"),
      ),
    ).toBe(true);
    expect(
      fixture.nativeElement.querySelectorAll("a.ticket-action"),
    ).toHaveLength(5);
  });

  it("treats an omitted availability as purchasable", async () => {
    fixture.componentRef.setInput("tickets", [
      {
        id: "general",
        label: "General admission",
        url: "https://tickets.example/general",
        price: { amount: 20, currency: "CHF" },
      },
    ] satisfies EventTicketOption[]);
    await fixture.whenStable();

    const action = fixture.nativeElement.querySelector(
      "a.ticket-action",
    ) as HTMLAnchorElement;
    expect(action.textContent).toContain("Get ticket");
    expect(action.classList.contains("ticket-action--details")).toBe(false);
  });

  it("keeps external links safe and emits the selected ticket", async () => {
    const opened = vi.fn();
    fixture.componentInstance.ticketOpened.subscribe(opened);
    await fixture.whenStable();

    const link = fixture.nativeElement.querySelector(
      'a[href="https://tickets.example/regular"]',
    ) as HTMLAnchorElement;
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");

    link.click();
    expect(opened).toHaveBeenCalledWith(tickets[0]);
  });

  it("shows an accessible toggle only when a description overflows", async () => {
    await fixture.whenStable();
    const description = fixture.nativeElement.querySelector(
      ".ticket-description",
    ) as HTMLElement;
    Object.defineProperties(description, {
      scrollHeight: { configurable: true, value: 60 },
      clientHeight: { configurable: true, value: 40 },
    });

    fixture.componentInstance.syncDescriptionOverflow("regular", description);
    await fixture.whenStable();

    const toggle = fixture.nativeElement.querySelector(
      ".ticket-description-toggle",
    ) as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe(description.id);
    expect(toggle.textContent).toContain("Show more");

    toggle.click();
    await fixture.whenStable();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toContain("Show less");
    expect(description.classList.contains("ticket-description--collapsed")).toBe(
      false,
    );
  });

  it("renders neutral badge labels", async () => {
    await fixture.whenStable();
    const badges = [...fixture.nativeElement.querySelectorAll(".ticket-badge")]
      .map((badge) => badge.textContent?.trim());
    expect(badges).toEqual(["Regular", "Early bird"]);
  });

  it("shows a valid discount with the original price and calculated percentage", async () => {
    await fixture.whenStable();

    const row = fixture.nativeElement.querySelector(
      '[data-discounted="true"]',
    ) as HTMLElement;
    expect(row.querySelector(".ticket-original-price")?.textContent).toContain(
      "120",
    );
    expect(row.querySelector(".ticket-price")?.textContent).toContain("90");
    expect(row.querySelector(".ticket-discount")?.textContent).toContain(
      "−25%",
    );
    expect(row.querySelector(".ticket-badge")).toBeNull();
  });

  it("does not claim a discount when the original price is invalid", async () => {
    fixture.componentRef.setInput("tickets", [
      {
        id: "invalid-discount",
        label: "Discount pass",
        price: { amount: 100, currency: "CHF" },
        originalPrice: { amount: 80, currency: "CHF" },
        badge: "discount",
      },
    ] satisfies EventTicketOption[]);
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelector(".ticket-original-price"),
    ).toBeNull();
    expect(fixture.nativeElement.textContent).toContain("Discount");
  });
});
