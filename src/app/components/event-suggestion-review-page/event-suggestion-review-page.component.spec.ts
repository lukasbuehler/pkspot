import {signal} from "@angular/core";
import {ComponentFixture, TestBed} from "@angular/core/testing";
import {provideRouter} from "@angular/router";
import {provideNoopAnimations} from "@angular/platform-browser/animations";
import {MatSnackBar} from "@angular/material/snack-bar";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {EventSuggestionReviewPageComponent} from "./event-suggestion-review-page.component";
import {EventSuggestionsService} from "../../services/event-suggestions.service";
import {AuthenticationService} from "../../services/firebase/authentication.service";
import {DateTimeFormatService} from "../../services/date-time-format.service";
import type {EventSuggestionQueueItem} from "../../../db/schemas/EventSuggestionSchema";

const item: EventSuggestionQueueItem = {id: "suggestion-1", name: "Community Jam", submitter_id: "athlete", status: "submitted",
  start: "2026-11-01T12:00:00Z", end: "2026-11-01T14:00:00Z", time_zone: "Europe/Zurich",
  locality_string: "Zürich", country_code: "CH", source_url: "https://example.test/jam",
  time_created: "2026-10-28T12:00:00Z", time_updated: "2026-10-28T12:00:00Z"};

describe("event suggestion review", () => {
  let fixture: ComponentFixture<EventSuggestionReviewPageComponent>;
  const isAdmin = signal(true);
  const list = vi.fn();
  const review = vi.fn();
  beforeEach(async () => {
    isAdmin.set(true);
    list.mockReset().mockResolvedValue({items: [item], nextCursor: null});
    review.mockReset().mockResolvedValue({ok: true, eventId: "new-event"});
    await TestBed.configureTestingModule({
      imports: [EventSuggestionReviewPageComponent],
      providers: [provideRouter([]), provideNoopAnimations(),
        {provide: AuthenticationService, useValue: {isAdmin, initialAuthStateResolved: signal(true)}},
        {provide: EventSuggestionsService, useValue: {list, review}},
        {provide: DateTimeFormatService, useValue: {format: (value: string) => value, formatPreset: (value: string) => value}},
        {provide: MatSnackBar, useValue: {open: vi.fn()}},
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EventSuggestionReviewPageComponent);
  });
  async function load() { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); }

  it("loads pending proposals with source and publication controls", async () => {
    await load();
    expect(list).toHaveBeenCalledWith("submitted");
    expect(fixture.nativeElement.textContent).toContain("Community Jam");
    expect(fixture.nativeElement.querySelector(".suggestion-location").textContent).toContain("Zürich, CH");
    expect(fixture.nativeElement.querySelector('a[href="https://example.test/jam"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain("Approve and publish");
  });
  it("never loads the private queue for a non-admin", async () => {
    isAdmin.set(false); await load();
    expect(list).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain("Admin access required");
  });
  it("submits review notes and removes an approved item from pending", async () => {
    await load();
    fixture.componentInstance.setNote(item.id, "Source checked");
    await fixture.componentInstance.review(item, "approved");
    expect(review).toHaveBeenCalledWith(item.id, "approved", "Source checked");
    expect(fixture.componentInstance.items()).toEqual([]);
  });
  it("does not double-submit a review", async () => {
    await load();
    let finish!: () => void;
    review.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    const pending = fixture.componentInstance.review(item, "rejected");
    await fixture.componentInstance.review(item, "approved");
    expect(review).toHaveBeenCalledOnce();
    finish(); await pending;
  });
  it("shows a retryable load error instead of an empty queue", async () => {
    list.mockRejectedValueOnce(new Error("offline")); await load();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain("Could not load");
  });
  it("loads review history and links the published event without approval buttons", async () => {
    list.mockResolvedValue({items: [{...item, status: "approved", review: {outcome: "approved", reviewer_id: "admin", reviewed_at: item.time_updated, event_id: "new-event"}}], nextCursor: null});
    fixture.componentInstance.setStatus("approved"); await load();
    expect(list).toHaveBeenCalledWith("approved");
    expect(fixture.nativeElement.querySelector('a[href="/events/new-event"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain("Approve and publish");
  });
  it("keeps pagination available after every loaded item has been reviewed", async () => {
    list.mockResolvedValueOnce({items: [item], nextCursor: item.id});
    await load();
    await fixture.componentInstance.review(item, "rejected");
    fixture.detectChanges();
    expect(fixture.componentInstance.items()).toEqual([]);
    const buttons = [...fixture.nativeElement.querySelectorAll("button")] as HTMLButtonElement[];
    expect(buttons.some((button) => button.textContent?.includes("Show more"))).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain("No event suggestions");
  });
  it("appends the next page without losing the first page", async () => {
    list.mockResolvedValueOnce({items: [item], nextCursor: item.id}).mockResolvedValueOnce({items: [{...item,id: "suggestion-2"}], nextCursor: null});
    await load(); await fixture.componentInstance.loadMore();
    expect(list).toHaveBeenLastCalledWith("submitted",item.id);
    expect(fixture.componentInstance.items()).toHaveLength(2);
  });
});
