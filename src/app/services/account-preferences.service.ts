import {
  DestroyRef,
  Injectable,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { catchError, of, switchMap } from "rxjs";
import { AuthenticationService } from "./firebase/authentication.service";
import { UsersService } from "./firebase/firestore/users.service";
import {
  resolveTemperatureUnit,
  type TemperatureUnit,
  type TemperatureUnitPreference,
} from "../weather/weather-temperature";

@Injectable({
  providedIn: "root",
})
export class AccountPreferencesService {
  private readonly auth = inject(AuthenticationService);
  private readonly users = inject(UsersService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly storedTemperatureUnit = signal<
    TemperatureUnitPreference | undefined
  >(undefined);

  readonly temperatureUnitPreference = computed(
    () => this.storedTemperatureUnit() ?? "local",
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
          unit === "local" || unit === "celsius" || unit === "fahrenheit"
            ? unit
            : undefined,
        );
      });
  }

  temperatureUnit(countryCode?: string): TemperatureUnit {
    return resolveTemperatureUnit(
      this.temperatureUnitPreference(),
      countryCode,
    );
  }

  async setTemperatureUnit(unit: TemperatureUnitPreference): Promise<void> {
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
