import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
  output,
  signal,
  type WritableSignal,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import type { EventTicketOption } from "../../../db/models/Event";
import type { LocaleCode } from "../../../db/models/Interfaces";
import { ResizeObserverDirective } from "../../directives/resize-observer.directive";

type TicketActionKind = "get_ticket" | "view_details" | null;

interface TicketViewModel {
  ticket: EventTicketOption;
  descriptionId: string;
  priceLabel: string;
  originalPriceLabel: string;
  discountPercentageLabel: string;
  availabilityLabel: string;
  badgeLabel: string;
  actionKind: TicketActionKind;
}

@Component({
  selector: "app-event-ticket-list",
  imports: [MatButtonModule, MatIconModule, ResizeObserverDirective],
  templateUrl: "./event-ticket-list.component.html",
  styleUrl: "./event-ticket-list.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventTicketListComponent {
  private readonly _locale = inject<LocaleCode>(LOCALE_ID);
  private readonly _expandedTicketIds = signal<ReadonlySet<string>>(new Set());
  private readonly _overflowingTicketIds = signal<ReadonlySet<string>>(
    new Set(),
  );

  readonly tickets = input.required<readonly EventTicketOption[]>();
  readonly ticketOpened = output<EventTicketOption>();

  readonly ticketViewModels = computed<TicketViewModel[]>(() =>
    this.tickets().map((ticket, index) => {
      const discount = this._ticketDiscount(ticket);
      return {
        ticket,
        descriptionId: `event-ticket-description-${index}`,
        priceLabel: this._formatTicketPrice(ticket),
        originalPriceLabel: discount?.originalPriceLabel ?? "",
        discountPercentageLabel: discount?.percentageLabel ?? "",
        availabilityLabel: this._ticketAvailabilityLabel(ticket),
        badgeLabel: discount ? "" : this._ticketBadgeLabel(ticket),
        actionKind: this._ticketActionKind(ticket),
      };
    }),
  );

  isDescriptionExpanded(ticketId: string): boolean {
    return this._expandedTicketIds().has(ticketId);
  }

  isDescriptionOverflowing(ticketId: string): boolean {
    return this._overflowingTicketIds().has(ticketId);
  }

  syncDescriptionOverflow(ticketId: string, element: HTMLElement): void {
    if (this.isDescriptionExpanded(ticketId)) return;
    this._setMembership(
      this._overflowingTicketIds,
      ticketId,
      element.scrollHeight > element.clientHeight + 1,
    );
  }

  toggleDescription(ticketId: string): void {
    this._setMembership(
      this._expandedTicketIds,
      ticketId,
      !this.isDescriptionExpanded(ticketId),
    );
  }

  openTicket(ticket: EventTicketOption): void {
    this.ticketOpened.emit(ticket);
  }

  private _formatTicketPrice(ticket: EventTicketOption): string {
    const price = ticket.price;
    if (!price) {
      return $localize`:@@event_tickets.price_unknown:Price TBA`;
    }
    if ("amount" in price) {
      return this._formatCurrency(price.amount, price.currency);
    }
    return `${this._formatCurrency(
      price.min_amount,
      price.currency,
    )} – ${this._formatCurrency(price.max_amount, price.currency)}`;
  }

  private _formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat(this._locale, {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  }

  private _ticketDiscount(ticket: EventTicketOption):
    | { originalPriceLabel: string; percentageLabel: string }
    | undefined {
    const currentPrice = ticket.price;
    const originalPrice = ticket.originalPrice;
    if (
      !currentPrice ||
      !("amount" in currentPrice) ||
      !originalPrice ||
      currentPrice.currency !== originalPrice.currency ||
      !Number.isFinite(currentPrice.amount) ||
      !Number.isFinite(originalPrice.amount) ||
      currentPrice.amount < 0 ||
      originalPrice.amount <= currentPrice.amount
    ) {
      return undefined;
    }

    const percentage = Math.round(
      ((originalPrice.amount - currentPrice.amount) / originalPrice.amount) *
        100,
    );
    if (percentage < 1) return undefined;

    return {
      originalPriceLabel: this._formatCurrency(
        originalPrice.amount,
        originalPrice.currency,
      ),
      percentageLabel: `−${percentage}%`,
    };
  }

  private _ticketAvailabilityLabel(ticket: EventTicketOption): string {
    switch (ticket.availability) {
      case "coming_soon":
        return $localize`:@@event_tickets.availability.coming_soon:Coming soon`;
      case "sold_out":
        return $localize`:@@event_tickets.availability.sold_out:Sold out`;
      case "waitlist":
        return $localize`:@@event_tickets.availability.waitlist:Waitlist`;
      case "ended":
        return $localize`:@@event_tickets.availability.ended:Ended`;
      case "available":
      default:
        return "";
    }
  }

  private _ticketBadgeLabel(ticket: EventTicketOption): string {
    switch (ticket.badge) {
      case "early_bird":
        return $localize`:@@event_tickets.badge.early_bird:Early bird`;
      case "discount":
        return $localize`:@@event_tickets.badge.discount:Discount`;
      case "regular":
        return $localize`:@@event_tickets.badge.regular:Regular`;
      case "late":
        return $localize`:@@event_tickets.badge.late:Late`;
      case "member":
        return $localize`:@@event_tickets.badge.member:Member`;
      default:
        return "";
    }
  }

  private _ticketActionKind(ticket: EventTicketOption): TicketActionKind {
    if (!ticket.url) return null;
    return !ticket.availability || ticket.availability === "available"
      ? "get_ticket"
      : "view_details";
  }

  private _setMembership(
    target: WritableSignal<ReadonlySet<string>>,
    ticketId: string,
    included: boolean,
  ): void {
    target.update((current) => {
      if (current.has(ticketId) === included) return current;
      const next = new Set(current);
      if (included) {
        next.add(ticketId);
      } else {
        next.delete(ticketId);
      }
      return next;
    });
  }
}
