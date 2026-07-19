import {
  DestroyRef,
  Injectable,
  InjectionToken,
  LOCALE_ID,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { isPlatformBrowser } from "@angular/common";
import { catchError, of, switchMap } from "rxjs";
import { AuthenticationService } from "./firebase/authentication.service";
import { UsersService } from "./firebase/firestore/users.service";
import {
  getDefaultTemperatureUnit,
  getExplicitTemperatureUnit,
  type TemperatureUnit,
} from "../weather/weather-temperature";

export const BROWSER_PREFERRED_LOCALES = new InjectionToken<readonly string[]>(
  "Browser preferred locales",
  {
    providedIn: "root",
    factory: () => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) {
        return [];
      }
      return globalThis.navigator?.languages?.length
        ? globalThis.navigator.languages
        : globalThis.navigator?.language
          ? [globalThis.navigator.language]
          : [];
    },
  },
);

@Injectable({
  providedIn: "root",
})
export class AccountPreferencesService {
  private readonly auth = inject(AuthenticationService);
  private readonly users = inject(UsersService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly browserLocales = inject(BROWSER_PREFERRED_LOCALES);
  private readonly browserTemperatureUnit = this.browserLocales
    .map((locale) => getExplicitTemperatureUnit(locale))
    .find((unit) => unit !== undefined);
  private readonly defaultTemperatureUnit = getDefaultTemperatureUnit(
    this.browserLocales[0] ?? inject(LOCALE_ID),
  );
  private readonly storedTemperatureUnit = signal<
    TemperatureUnit | undefined
  >(undefined);

  readonly temperatureUnit = computed(
    () =>
      this.storedTemperatureUnit() ??
      this.browserTemperatureUnit ??
      this.defaultTemperatureUnit,
  );

  constructor() {
    this.auth.authState$
      .pipe(
        switchMap((user) => {
          this.storedTemperatureUnit.set(undefined);
          return user?.uid
            ? this.users.getPrivateData(user.uid).pipe(
                catchError((error: unknown) => {
                  console.warn("Failed to load account preferences", error);
                  return of(null);
                }),
              )
            : of(null);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((privateData) => {
        const unit = privateData?.settings?.temperature_unit;
        this.storedTemperatureUnit.set(
          unit === "celsius" || unit === "fahrenheit" ? unit : undefined,
        );
      });
  }

  async setTemperatureUnit(unit: TemperatureUnit): Promise<void> {
    const userId = this.auth.user.uid;
    if (!userId) {
      return;
    }

    const previous = this.storedTemperatureUnit();
    this.storedTemperatureUnit.set(unit);
    try {
      await this.users.updatePrivateData(userId, {
        settings: { temperature_unit: unit },
      });
    } catch (error) {
      this.storedTemperatureUnit.set(previous);
      throw error;
    }
  }
}
