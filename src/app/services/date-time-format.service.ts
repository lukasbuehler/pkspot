import { Injectable, LOCALE_ID, inject, signal } from "@angular/core";
import { Capacitor, registerPlugin } from "@capacitor/core";

export type HourCycle = "h11" | "h12" | "h23" | "h24";

interface NativeDateTimePreferences {
  locale: string;
  hourCycle: HourCycle;
}

interface DateTimePreferencesPlugin {
  getPreferences(): Promise<NativeDateTimePreferences>;
}

const nativeDateTimePreferences = registerPlugin<DateTimePreferencesPlugin>(
  "DateTimePreferences",
);

export type SystemDateFormat =
  | "short"
  | "medium"
  | "shortTime"
  | "shortDate"
  | "mediumDate"
  | "longDate";

export interface ResolvedDateTimePreferences {
  readonly locale: string;
  readonly hourCycle: HourCycle;
}

@Injectable({ providedIn: "root" })
export class DateTimeFormatService {
  private readonly uiLocale = inject(LOCALE_ID);
  private readonly preferencesState = signal<ResolvedDateTimePreferences>(
    this.browserPreferences(),
  );

  readonly preferences = this.preferencesState.asReadonly();

  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
      const preferences = await nativeDateTimePreferences.getPreferences();
      this.preferencesState.set({
        ...preferences,
        locale: regionalizeLocale(this.uiLocale, preferences.locale),
      });
    } catch (error) {
      console.warn(
        "Could not read the native date and time preferences; using the web fallback.",
        error,
      );
    }
  }

  format(
    value: Date | number | string,
    options: Intl.DateTimeFormatOptions,
  ): string {
    return createDateTimeFormatter(this.preferencesState(), options).format(
      toDateTimeValue(value),
    );
  }

  formatPreset(value: Date | number | string, format: SystemDateFormat): string {
    return this.format(value, presetOptions(format));
  }

  formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    return createDateTimeFormatter(this.preferencesState(), options);
  }

  formatDateRange(
    start: Date,
    end: Date,
    dateStyle: "short" | "long" = "short",
    timeZone?: string,
  ): string {
    return this.formatter({ dateStyle, timeZone }).formatRange(start, end);
  }

  private browserPreferences(): ResolvedDateTimePreferences {
    const runtimeLocale =
      typeof navigator === "undefined" ? this.uiLocale : navigator.language;
    const locale = regionalizeLocale(this.uiLocale, runtimeLocale);
    // A browser's default formatter may expose an OS-level hour-cycle
    // override even when the language tag itself defaults differently.
    const hourCycle = resolveHourCycle();
    return { locale, hourCycle };
  }
}

export function regionalizeLocale(uiLocale: string, systemLocale: string): string {
  try {
    const ui = new Intl.Locale(uiLocale);
    if (ui.region) return ui.toString();

    const system = new Intl.Locale(systemLocale).maximize();
    return new Intl.Locale(ui.language, {
      region: system.region,
      calendar: system.calendar,
      numberingSystem: system.numberingSystem,
    }).toString();
  } catch {
    return uiLocale;
  }
}

export function createDateTimeFormatter(
  preferences: ResolvedDateTimePreferences,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(
    preferences.locale,
    includesTime(options)
      ? { ...options, hourCycle: preferences.hourCycle }
      : options,
  );
}

function resolveHourCycle(locale?: string): HourCycle {
  const resolved = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
  }).resolvedOptions().hourCycle;
  return resolved ?? "h23";
}

function includesTime(options: Intl.DateTimeFormatOptions): boolean {
  return Boolean(
    options.timeStyle ||
      options.hour ||
      options.minute ||
      options.second ||
      options.fractionalSecondDigits,
  );
}

function toDateTimeValue(value: Date | number | string): Date | number {
  return typeof value === "string" ? new Date(value) : value;
}

function presetOptions(format: SystemDateFormat): Intl.DateTimeFormatOptions {
  switch (format) {
    case "short":
      return { dateStyle: "short", timeStyle: "short" };
    case "medium":
      return { dateStyle: "medium", timeStyle: "medium" };
    case "shortTime":
      return { timeStyle: "short" };
    case "shortDate":
      return { dateStyle: "short" };
    case "mediumDate":
      return { dateStyle: "medium" };
    case "longDate":
      return { dateStyle: "long" };
  }
}
