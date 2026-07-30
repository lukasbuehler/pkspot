import { computed, Injectable, LOCALE_ID, inject, signal } from "@angular/core";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { AppSettingsService } from "./app-settings.service";

export type HourCycle = "h11" | "h12" | "h23" | "h24";

interface NativeDateTimePreferences {
  locale: string;
  hourCycle: HourCycle;
}

interface DateTimePreferencesPlugin {
  getPreferences(): Promise<NativeDateTimePreferences>;
}

type LocaleWithTimeZones = Intl.Locale & {
  readonly timeZones?: readonly string[];
  getTimeZones?: () => readonly string[];
};

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
  private readonly appSettings = inject(AppSettingsService);
  private readonly detectedPreferences = signal<ResolvedDateTimePreferences>(
    this.browserPreferences(),
  );

  readonly preferences = computed(() => {
    const detected = this.detectedPreferences();
    const preference = this.appSettings.timeFormat();
    return {
      ...detected,
      hourCycle:
        preference === "12-hour"
          ? "h12"
          : preference === "24-hour"
            ? "h23"
            : detected.hourCycle,
    } satisfies ResolvedDateTimePreferences;
  });

  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
      const preferences = await nativeDateTimePreferences.getPreferences();
      this.detectedPreferences.set({
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
    return createDateTimeFormatter(this.preferences(), options).format(
      toDateTimeValue(value),
    );
  }

  formatPreset(value: Date | number | string, format: SystemDateFormat): string {
    return this.format(value, presetOptions(format));
  }

  formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    return createDateTimeFormatter(this.preferences(), options);
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
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hourCycle = resolveHourCycle(locale, timeZone);
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
      hourCycle: system.hourCycle,
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

export function resolveHourCycle(
  locale?: string,
  timeZone?: string,
  systemHourCycle = resolveLocaleHourCycle(),
): HourCycle {
  const explicitHourCycle = localeHourCycle(locale);
  if (explicitHourCycle) return explicitHourCycle;

  if (systemHourCycle === "h23" || systemHourCycle === "h24") {
    return systemHourCycle;
  }

  const region = inferRegionFromTimeZone(timeZone);
  if (!region) return systemHourCycle;

  const regionalHourCycle = resolveLocaleHourCycle(
    localeWithRegion(locale, region),
  );
  return regionalHourCycle === "h23" || regionalHourCycle === "h24"
    ? regionalHourCycle
    : systemHourCycle;
}

export function inferRegionFromTimeZone(
  timeZone?: string,
): string | undefined {
  if (!timeZone || !supportsLocaleTimeZones) return undefined;

  const canonicalTimeZone = canonicalizeTimeZone(timeZone);
  if (timeZoneRegionCache.has(canonicalTimeZone)) {
    return timeZoneRegionCache.get(canonicalTimeZone) ?? undefined;
  }

  for (const region of TIME_ZONE_REGIONS) {
    if (timeZonesForRegion(region)?.includes(canonicalTimeZone)) {
      timeZoneRegionCache.set(canonicalTimeZone, region);
      return region;
    }
  }

  timeZoneRegionCache.set(canonicalTimeZone, null);
  return undefined;
}

function resolveLocaleHourCycle(locale?: string): HourCycle {
  return (
    new Intl.DateTimeFormat(locale, {
      hour: "numeric",
    }).resolvedOptions().hourCycle ?? "h23"
  );
}

function localeHourCycle(locale?: string): HourCycle | undefined {
  if (!locale) return undefined;

  try {
    const hourCycle = new Intl.Locale(locale).hourCycle;
    return isHourCycle(hourCycle) ? hourCycle : undefined;
  } catch {
    return undefined;
  }
}

function isHourCycle(value: string | undefined): value is HourCycle {
  return (
    value === "h11" ||
    value === "h12" ||
    value === "h23" ||
    value === "h24"
  );
}

function localeWithRegion(locale: string | undefined, region: string): string {
  try {
    const base = new Intl.Locale(locale ?? "und");
    return new Intl.Locale(base.baseName, { region }).toString();
  } catch {
    return `und-${region}`;
  }
}

function canonicalizeTimeZone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en", { timeZone }).resolvedOptions()
      .timeZone;
  } catch {
    return timeZone;
  }
}

function timeZonesForRegion(region: string): readonly string[] | undefined {
  try {
    const locale = new Intl.Locale(`und-${region}`) as LocaleWithTimeZones;
    return locale.getTimeZones?.() ?? locale.timeZones;
  } catch {
    return undefined;
  }
}

const timeZoneRegionCache = new Map<string, string | null>();
const supportsLocaleTimeZones = (() => {
  const locale = new Intl.Locale("und-US") as LocaleWithTimeZones;
  return (
    typeof locale.getTimeZones === "function" || Array.isArray(locale.timeZones)
  );
})();

// ISO regions to which IANA assigns at least one time zone. This is only the
// candidate territory list; hour-cycle rules come from the runtime's CLDR data.
const TIME_ZONE_REGIONS =
  "AD,AE,AF,AG,AI,AL,AM,AO,AQ,AR,AS,AT,AU,AW,AX,AZ,BA,BB,BD,BE,BF,BG,BH,BI,BJ,BL,BM,BN,BO,BQ,BR,BS,BT,BW,BY,BZ,CA,CC,CD,CF,CG,CH,CI,CK,CL,CM,CN,CO,CR,CU,CV,CW,CX,CY,CZ,DE,DJ,DK,DM,DO,DZ,EC,EE,EG,EH,ER,ES,ET,FI,FJ,FK,FM,FO,FR,GA,GB,GD,GE,GF,GG,GH,GI,GL,GM,GN,GP,GQ,GR,GS,GT,GU,GW,GY,HK,HN,HR,HT,HU,ID,IE,IL,IM,IN,IO,IQ,IR,IS,IT,JE,JM,JO,JP,KE,KG,KH,KI,KM,KN,KP,KR,KW,KY,KZ,LA,LB,LC,LI,LK,LR,LS,LT,LU,LV,LY,MA,MC,MD,ME,MF,MG,MH,MK,ML,MM,MN,MO,MP,MQ,MR,MS,MT,MU,MV,MW,MX,MY,MZ,NA,NC,NE,NF,NG,NI,NL,NO,NP,NR,NU,NZ,OM,PA,PE,PF,PG,PH,PK,PL,PM,PN,PR,PS,PT,PW,PY,QA,RE,RO,RS,RU,RW,SA,SB,SC,SD,SE,SG,SH,SI,SJ,SK,SL,SM,SN,SO,SR,SS,ST,SV,SX,SY,SZ,TC,TD,TF,TG,TH,TJ,TK,TL,TM,TN,TO,TR,TT,TV,TW,TZ,UA,UG,UM,US,UY,UZ,VA,VC,VE,VG,VI,VN,VU,WF,WS,YE,YT,ZA,ZM,ZW".split(
    ",",
  );

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
