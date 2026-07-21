import { DestroyRef, Injectable, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { catchError, of, switchMap } from "rxjs";
import {
  NotificationPreferenceKey,
  NotificationPreferencesSchema,
} from "../../db/schemas/NotificationSchema";
import { AuthenticationService } from "./firebase/authentication.service";
import { UsersService } from "./firebase/firestore/users.service";

const DEFAULT_PREFERENCES: Required<NotificationPreferencesSchema> = {
  follow_requests: false,
  event_reminders: false,
  event_updates: false,
  spot_edit_updates: false,
};

@Injectable({ providedIn: "root" })
export class NotificationPreferencesService {
  private readonly auth = inject(AuthenticationService);
  private readonly users = inject(UsersService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly storedPreferences = signal<NotificationPreferencesSchema>(
    DEFAULT_PREFERENCES,
  );
  private readonly loadingState = signal(true);

  readonly preferences = computed<Required<NotificationPreferencesSchema>>(
    () => ({ ...DEFAULT_PREFERENCES, ...this.storedPreferences() }),
  );
  readonly loading = this.loadingState.asReadonly();

  constructor() {
    this.auth.authState$
      .pipe(
        switchMap((user) => {
          this.storedPreferences.set(DEFAULT_PREFERENCES);
          this.loadingState.set(Boolean(user?.uid));
          return user?.uid
            ? this.users.getPrivateData(user.uid).pipe(
                catchError((error: unknown) => {
                  console.warn("Failed to load notification preferences", error);
                  return of(null);
                }),
              )
            : of(null);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((privateData) => {
        this.storedPreferences.set(
          privateData?.notification_preferences ?? DEFAULT_PREFERENCES,
        );
        this.loadingState.set(false);
      });
  }

  async setPreference(
    key: NotificationPreferenceKey,
    enabled: boolean,
  ): Promise<void> {
    const userId = this.auth.user.uid;
    if (!userId) {
      throw new Error("A signed-in user is required to change notifications.");
    }

    const previous = this.storedPreferences();
    const next = { ...this.preferences(), [key]: enabled };
    this.storedPreferences.set(next);

    try {
      await this.users.updatePrivateData(userId, {
        notification_preferences: next,
      });
    } catch (error) {
      this.storedPreferences.set(previous);
      throw error;
    }
  }
}
