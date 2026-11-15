import { Injectable } from "@angular/core";
import { MatDatepickerIntl } from "@angular/material/datepicker";

/** Translates the date picker's built-in screen-reader labels. */
@Injectable()
export class LocalizedDatepickerIntl extends MatDatepickerIntl {
  override calendarLabel = $localize`:@@datepicker.calendar:Calendar`;
  override openCalendarLabel = $localize`:@@datepicker.open:Open calendar`;
  override closeCalendarLabel = $localize`:@@datepicker.close:Close calendar`;
  override prevMonthLabel = $localize`:@@datepicker.prev_month:Previous month`;
  override nextMonthLabel = $localize`:@@datepicker.next_month:Next month`;
  override prevYearLabel = $localize`:@@datepicker.prev_year:Previous year`;
  override nextYearLabel = $localize`:@@datepicker.next_year:Next year`;
  override prevMultiYearLabel = $localize`:@@datepicker.prev_multi_year:Previous 24 years`;
  override nextMultiYearLabel = $localize`:@@datepicker.next_multi_year:Next 24 years`;
  override switchToMonthViewLabel = $localize`:@@datepicker.choose_date:Choose date`;
  override switchToMultiYearViewLabel = $localize`:@@datepicker.choose_month_year:Choose month and year`;
  override startDateLabel = $localize`:@@datepicker.start_date:Start date`;
  override endDateLabel = $localize`:@@datepicker.end_date:End date`;
}
