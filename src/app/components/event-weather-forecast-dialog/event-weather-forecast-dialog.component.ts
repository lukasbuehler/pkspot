import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from "@angular/core";
import { MatIconButton } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogClose,
  type MatDialogConfig,
  MatDialogContent,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatIcon } from "@angular/material/icon";
import type { EventWeatherSelection } from "../../weather/event-weather";
import type { WeatherResponse } from "../../weather/weather.models";
import { EventWeatherDaysComponent } from "../event-weather-days/event-weather-days.component";
import { EventWeatherHoursComponent } from "../event-weather-hours/event-weather-hours.component";

export interface EventWeatherForecastDialogData {
  eventName: string;
  eventStart: Date;
  eventEnd: Date;
  timeZone?: string;
  response: WeatherResponse;
  selection: EventWeatherSelection;
}

export const EVENT_WEATHER_DIALOG_CONFIG = {
  width: "960px",
  maxWidth: "calc(100vw - 24px)",
  maxHeight: "calc(100dvh - 24px)",
  autoFocus: "dialog",
  restoreFocus: true,
} satisfies MatDialogConfig;

@Component({
  selector: "app-event-weather-forecast-dialog",
  imports: [
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    EventWeatherDaysComponent,
    EventWeatherHoursComponent,
    MatIcon,
    MatIconButton,
  ],
  templateUrl: "./event-weather-forecast-dialog.component.html",
  styleUrl: "./event-weather-forecast-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventWeatherForecastDialogComponent {
  protected readonly data = inject<EventWeatherForecastDialogData>(MAT_DIALOG_DATA);
  private readonly selectedTime = signal(this.data.selection.time);

  protected readonly selectedDate = signal(this.data.selection.date);
  protected readonly highlightedTime = this.selectedTime.asReadonly();

  protected selectDate(date: string): void {
    this.selectedDate.set(date);
    this.selectedTime.set(undefined);
  }
}
