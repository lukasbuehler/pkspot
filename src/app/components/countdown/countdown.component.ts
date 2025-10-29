import {
  Component,
  input,
  InputSignal,
  signal,
  WritableSignal,
  AfterViewInit,
} from "@angular/core";
import { FancyCounterComponent } from "../fancy-counter/fancy-counter.component";

@Component({
  selector: "app-countdown",
  imports: [FancyCounterComponent],
  templateUrl: "./countdown.component.html",
  styleUrl: "./countdown.component.scss",
})
export class CountdownComponent implements AfterViewInit {
  timestamp: InputSignal<Date> = input<Date>(new Date());
  days: WritableSignal<number> = signal<number>(0);
  hours: WritableSignal<number> = signal<number>(0);
  minutes: WritableSignal<number> = signal<number>(0);
  seconds: WritableSignal<number> = signal<number>(0);

  private intervalId: NodeJS.Timeout | undefined;

  ngAfterViewInit() {
    this.startCountdown();
  }

  ngOnDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private startCountdown() {
    // this.updateRemainingTime();
    // const now = new Date();
    // const initialDelay =
    //   now.getMilliseconds() < 100 ? 0 : 1000 - now.getMilliseconds() - 100;

    // setTimeout(() => {
    //   this.updateRemainingTime();
    this.intervalId = setInterval(() => {
      this.updateRemainingTime();
    }, 1000);
    // }, initialDelay);
  }

  private updateRemainingTime() {
    const now = new Date().getTime();
    const target = this.timestamp().getTime();
    const difference = target - now;

    if (difference <= 0) {
      this.days.set(0);
      this.hours.set(0);
      this.minutes.set(0);
      this.seconds.set(0);
      clearInterval(this.intervalId);
    } else {
      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);
      this.days.set(days);
      this.hours.set(hours);
      this.minutes.set(minutes);
      this.seconds.set(seconds);
    }
  }
}
