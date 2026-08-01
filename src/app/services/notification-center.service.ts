import { DestroyRef, Injectable, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import type { Subscription } from "rxjs";
import type { InAppNotificationSchema } from "../../db/schemas/NotificationSchema";
import { AuthenticationService } from "./firebase/authentication.service";
import { FirestoreAdapterService } from "./firebase/firestore-adapter.service";

export type InAppNotificationDocument = InAppNotificationSchema & { id: string };

interface ScreenshotGlobal {
  __PKSPOT_SCREENSHOT_NOTIFICATIONS__?: InAppNotificationDocument[];
}

@Injectable({ providedIn: "root" })
export class NotificationCenterService {
  private readonly auth = inject(AuthenticationService);
  private readonly firestore = inject(FirestoreAdapterService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly storedItems = signal<InAppNotificationDocument[]>([]);
  private readonly now = signal(Date.now());
  private readonly loadingState = signal(false);
  private readonly errorState = signal(false);
  private currentUserId: string | null = null;
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;
  private liveSubscription: Subscription | null = null;
  private loadSequence = 0;

  readonly items = computed(() => {
    const now = this.now();
    return this.storedItems().filter(
      (item) =>
        item.active &&
        !item.dismissed_at_raw_ms &&
        item.available_at_raw_ms <= now &&
        item.expires_at_raw_ms > now,
    );
  });
  readonly unreadCount = computed(
    () => this.items().filter((item) => !item.read_at_raw_ms).length,
  );
  readonly loading = this.loadingState.asReadonly();
  readonly failed = this.errorState.asReadonly();

  constructor() {
    this.auth.authState$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        this.currentUserId = user?.uid ?? null;
        this.storedItems.set([]);
        this.liveSubscription?.unsubscribe();
        this.liveSubscription = null;
        this._clearTransitionTimer();
        if (!this.currentUserId) {
          this.loadingState.set(false);
          this.errorState.set(false);
        } else {
          this._startListening(this.currentUserId);
        }
      });
    this.destroyRef.onDestroy(() => {
      this._clearTransitionTimer();
      this.liveSubscription?.unsubscribe();
    });
  }

  async refresh(): Promise<void> {
    const userId = this.currentUserId;
    if (!userId) return;

    const sequence = ++this.loadSequence;
    this.loadingState.set(true);
    this.errorState.set(false);
    try {
      const fixture = (globalThis as ScreenshotGlobal)
        .__PKSPOT_SCREENSHOT_NOTIFICATIONS__;
      if (!fixture) {
        this._startListening(userId);
        return;
      }
      const items = [...fixture];
      if (sequence !== this.loadSequence || userId !== this.currentUserId) return;

      this.now.set(Date.now());
      this.storedItems.set(
        items.sort((left, right) => right.created_at_raw_ms - left.created_at_raw_ms),
      );
      this._scheduleNextTransition();
    } catch (error) {
      console.warn("Failed to load notification center", error);
      if (sequence === this.loadSequence) this.errorState.set(true);
    } finally {
      if (sequence === this.loadSequence) this.loadingState.set(false);
    }
  }

  private _startListening(userId: string): void {
    this.liveSubscription?.unsubscribe();
    this.loadingState.set(true);
    this.errorState.set(false);
    this.liveSubscription = this.firestore
      .collectionSnapshots<InAppNotificationDocument>(
        `users/${userId}/notifications`,
        undefined,
        [
          { type: "orderBy", fieldPath: "created_at_raw_ms", direction: "desc" },
          { type: "limit", limit: 100 },
        ],
      )
      .subscribe({
        next: (items) => {
          if (userId !== this.currentUserId) return;
          this.now.set(Date.now());
          this.storedItems.set(
            items.sort(
              (left, right) =>
                right.created_at_raw_ms - left.created_at_raw_ms,
            ),
          );
          this.loadingState.set(false);
          this.errorState.set(false);
          this._scheduleNextTransition();
        },
        error: (error: unknown) => {
          console.warn("Failed to listen to notification center", error);
          this.loadingState.set(false);
          this.errorState.set(true);
        },
      });
  }

  async markRead(notificationId: string): Promise<void> {
    const item = this.storedItems().find(({ id }) => id === notificationId);
    if (!item || item.read_at_raw_ms) return;
    await this._updateClientState(notificationId, { read_at_raw_ms: Date.now() });
  }

  async markAllRead(): Promise<void> {
    const unread = this.items().filter((item) => !item.read_at_raw_ms);
    const readAt = Date.now();
    await Promise.all(
      unread.map((item) =>
        this._updateClientState(item.id, { read_at_raw_ms: readAt }),
      ),
    );
  }

  async dismiss(notificationId: string): Promise<void> {
    await this._updateClientState(notificationId, {
      dismissed_at_raw_ms: Date.now(),
    });
  }

  private async _updateClientState(
    notificationId: string,
    update: Pick<
      InAppNotificationSchema,
      "read_at_raw_ms" | "dismissed_at_raw_ms"
    >,
  ): Promise<void> {
    const userId = this.currentUserId;
    if (!userId) return;

    const previous = this.storedItems();
    this.storedItems.update((items) =>
      items.map((item) =>
        item.id === notificationId ? { ...item, ...update } : item,
      ),
    );
    try {
      await this.firestore.setDocument(
        `users/${userId}/notifications/${notificationId}`,
        update,
        { merge: true },
      );
    } catch (error) {
      this.storedItems.set(previous);
      throw error;
    }
  }

  private _scheduleNextTransition(): void {
    this._clearTransitionTimer();
    const now = Date.now();
    const nextTransition = this.storedItems()
      .flatMap((item) => [
        item.available_at_raw_ms,
        item.expires_at_raw_ms,
        item.action_state?.undo_until_raw_ms ?? 0,
      ])
      .filter((time) => time > now)
      .sort((left, right) => left - right)[0];
    if (!nextTransition) return;

    this.transitionTimer = setTimeout(() => {
      this.now.set(Date.now());
      this._scheduleNextTransition();
    }, Math.min(nextTransition - now + 50, 2_147_483_647));
  }

  private _clearTransitionTimer(): void {
    if (this.transitionTimer) clearTimeout(this.transitionTimer);
    this.transitionTimer = null;
  }
}
