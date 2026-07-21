import { Pipe, PipeTransform, inject } from "@angular/core";
import {
  DateTimeFormatService,
  SystemDateFormat,
} from "../services/date-time-format.service";

@Pipe({ name: "systemDate" })
export class SystemDatePipe implements PipeTransform {
  private readonly dateTime = inject(DateTimeFormatService);

  transform(
    value: Date | number | string | null | undefined,
    format: SystemDateFormat = "mediumDate",
  ): string | null {
    return value === null || value === undefined
      ? null
      : this.dateTime.formatPreset(value, format);
  }
}
