import { DestroyRef, Injectable, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { catchError, of, switchMap } from "rxjs";
import {
  NOTIFICATION_PREFERENCE_KEYS,
  NotificationPreferenceKey,
  NotificationPreferencesSchema,
  NotificationPromptContext,
  NotificationPromptStateSchema,
  NotificationPromptStatus,
} from "../../db/schemas/NotificationSchema";
import { AuthenticationService } from "./firebase/authentication.service";
import { UsersService } from "./firebase/firestore/users.service";

const DEFAULT_PREFERENCES: Required<NotificationPreferencesSchema> = {
  follow_requests: false,
  event_reminders: false,
  event_updates: false,
  spot_edit_updates: false,
  report_updates: false,
  community_info_updates: false,
};
const PROMPT_VERSION = 1;

@Injectable({ providedIn: "root" })
export class NotificationPreferencesService {
  private readonly auth = inject(AuthenticationService);
  private readonly users = inject(UsersService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly storedPreferences = signal<NotificationPreferencesSchema>(
    DEFAULT_PREFERENCES,
  );
  private readonly loadingState = signal(true);
  private readonly promptState = signal<NotificationPromptStateSchema>({});

  readonly preferences = computed<Required<NotificationPreferencesSchema>>(
    () => ({ ...DEFAULT_PREFERENCES, ...this.storedPreferences() }),
  );
  readonly loading = this.loadingState.asReadonly();
  readonly prompts = this.promptState.asReadonly();

  constructor() {
    this.auth.authState$
      .pipe(
        switchMap((user) => {
          this.storedPreferences.set(DEFAULT_PREFERENCES);
          this.promptState.set({});
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
        this.promptState.set(privateData?.notification_prompt_state ?? {});
        this.loadingState.set(false);
      });
  }

  async setPreference(
    key: NotificationPreferenceKey,
    enabled: boolean,
  ): Promise<void> {
    await this.setPreferences([key], enabled);
  }

  async setPreferences(
    keys: readonly NotificationPreferenceKey[],
    enabled: boolean,
  ): Promise<void> {
    const userId = this.auth.user.uid;
    if (!userId) {
      throw new Error("A signed-in user is required to change notifications.");
    }

    const previous = this.storedPreferences();
    const next = { ...this.preferences() };
    for (const key of keys) {
      next[key] = enabled;
    }
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

  hasHandledPrompt(context: NotificationPromptContext): boolean {
    return (this.promptState()[context]?.version ?? 0) >= PROMPT_VERSION;
  }

  async applyPromptDecision(
    context: NotificationPromptContext,
    status: NotificationPromptStatus,
    enableAll: boolean,
  ): Promise<void> {
    const userId = this.auth.user.uid;
    if (!userId) {
      throw new Error("A signed-in user is required to change notifications.");
    }

    const previousPreferences = this.storedPreferences();
    const previousPrompts = this.promptState();
    const keys = enableAll
      ? NOTIFICATION_PREFERENCE_KEYS
      : [this._preferenceForPrompt(context)];
    const nextPreferences = { ...this.preferences() };
    if (status === "accepted") {
      for (const key of keys) {
        nextPreferences[key] = true;
      }
    }
    const nextPrompts: NotificationPromptStateSchema = {
      ...previousPrompts,
      [context]: {
        status,
        version: PROMPT_VERSION,
        updated_at_raw_ms: Date.now(),
      },
    };

    this.storedPreferences.set(nextPreferences);
    this.promptState.set(nextPrompts);
    try {
      await this.users.updatePrivateData(userId, {
        notification_preferences: nextPreferences,
        notification_prompt_state: nextPrompts,
      });
    } catch (error) {
      this.storedPreferences.set(previousPreferences);
      this.promptState.set(previousPrompts);
      throw error;
    }
  }

  private _preferenceForPrompt(
    context: NotificationPromptContext,
  ): NotificationPreferenceKey {
    return context === "follow_activity" ? "follow_requests" : context;
  }
}
