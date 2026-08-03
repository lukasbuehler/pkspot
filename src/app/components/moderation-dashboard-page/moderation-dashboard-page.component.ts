import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  signal,
} from "@angular/core";
import { SystemDatePipe } from "../../pipes/system-date.pipe";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatTooltipModule } from "@angular/material/tooltip";
import { Subscription } from "rxjs";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  ModerationContactMessageItem,
  ModerationReportItem,
  ModerationReportsService,
} from "../../services/firebase/firestore/moderation-reports.service";
import { ModerationActionType } from "../../../db/schemas/ModerationActionSchema";
import { AnalyticsService } from "../../services/analytics.service";
import {
  CommunityEditsService,
  CommunityKnowledgeEditItem,
} from "../../services/firebase/firestore/community-edits.service";
import {
  ModerationSpotEditQueueItem,
  SpotEditsService,
} from "../../services/firebase/firestore/spot-edits.service";
import type {
  CommunityInfoCardSchema,
  CommunityLocalizedTextSchema,
} from "../../../db/schemas/CommunityPageSchema";
import type { SpotEditSchema } from "../../../db/schemas/SpotEditSchema";
import { AgeAssuranceAdminService } from "../../services/age-assurance-admin.service";

@Component({
  selector: "app-moderation-dashboard-page",
  imports: [
    SystemDatePipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
  ],
  templateUrl: "./moderation-dashboard-page.component.html",
  styleUrl: "./moderation-dashboard-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationDashboardPageComponent implements OnDestroy {
  private readonly _reportsService = inject(ModerationReportsService);
  private readonly _communityEditsService = inject(CommunityEditsService);
  private readonly _spotEditsService = inject(SpotEditsService);
  private readonly _snackbar = inject(MatSnackBar);
  private readonly _analytics = inject(AnalyticsService);
  private readonly _ageAssuranceAdmin = inject(AgeAssuranceAdminService);
  readonly authService = inject(AuthenticationService);

  readonly authResolved = this.authService.initialAuthStateResolved;
  readonly isAdmin = signal(false);
  readonly isLoading = signal(false);
  readonly actionPath = signal<string | null>(null);
  readonly invalidationBasis = signal("");
  readonly invalidationReason = signal("");
  readonly invalidationPreviewCount = signal<number | null>(null);
  readonly isInvalidatingAgeAssurance = signal(false);
  readonly reports = signal<ModerationReportItem[]>([]);
  readonly contactMessages = signal<ModerationContactMessageItem[]>([]);
  readonly communityCardSuggestions = signal<CommunityKnowledgeEditItem[]>([]);
  readonly spotEditVotes = signal<ModerationSpotEditQueueItem[]>([]);
  readonly organizationSpotEdits = signal<ModerationSpotEditQueueItem[]>([]);
  private readonly _authSubscription: Subscription;

  readonly openReportCount = computed(
    () => this.reports().filter((report) => report.status === "open").length,
  );
  readonly spotReportCount = computed(
    () => this.reports().filter((report) => report.kind === "spot").length,
  );
  readonly mediaReportCount = computed(
    () => this.reports().filter((report) => report.kind === "media").length,
  );
  readonly profileReportCount = computed(
    () => this.reports().filter((report) => report.kind === "profile").length,
  );
  readonly recentOpenReports = computed(() =>
    this.reports()
      .filter((report) => report.status === "open")
      .slice(0, 5),
  );
  readonly recentContactMessages = computed(() =>
    this.contactMessages().slice(0, 8),
  );
  readonly recentCommunityCardSuggestions = computed(() =>
    this.communityCardSuggestions().slice(0, 5),
  );
  readonly recentSpotEditVotes = computed(() => this.spotEditVotes().slice(0, 5));
  readonly recentOrganizationSpotEdits = computed(() =>
    this.organizationSpotEdits().slice(0, 5),
  );
  readonly pendingCommunityQueueCount = computed(
    () =>
      this.communityCardSuggestions().length +
      this.spotEditVotes().length +
      this.organizationSpotEdits().length,
  );

  constructor() {
    this._authSubscription = this.authService.authState$.subscribe(() => {
      const isAdmin = this.authService.isAdmin();
      this.isAdmin.set(isAdmin);
      if (isAdmin) {
        void this.reload();
      }
    });
  }

  ngOnDestroy(): void {
    this._authSubscription.unsubscribe();
  }

  async reload(): Promise<void> {
    if (!this.isAdmin() || this.isLoading()) {
      return;
    }

    this.isLoading.set(true);
    try {
      const [
        reports,
        contactMessages,
        communityCardSuggestions,
        spotEditQueues,
      ] = await Promise.all([
        this._reportsService.getReports(),
        this._reportsService.getContactMessages(),
        this._communityEditsService.getPendingKnowledgeEdits(),
        this._spotEditsService.getPendingModerationSpotEditQueues(),
      ]);
      this.reports.set(reports);
      this.contactMessages.set(contactMessages);
      this.communityCardSuggestions.set(communityCardSuggestions);
      this.spotEditVotes.set(spotEditQueues.voting);
      this.organizationSpotEdits.set(spotEditQueues.organizationReview);
    } catch (error) {
      console.error("Failed to load moderation dashboard", error);
      this._snackbar.open($localize`Failed to load moderation dashboard`, undefined, {
        duration: 4000,
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  updateInvalidationBasis(event: Event): void {
    this.invalidationBasis.set((event.target as HTMLInputElement).value);
    this.invalidationPreviewCount.set(null);
  }

  updateInvalidationReason(event: Event): void {
    this.invalidationReason.set((event.target as HTMLInputElement).value);
    this.invalidationPreviewCount.set(null);
  }

  async previewAgeAssuranceInvalidation(): Promise<void> {
    const basis = this.invalidationBasis().trim();
    const reason = this.invalidationReason().trim();
    if (!basis || reason.length < 5 || this.isInvalidatingAgeAssurance()) {
      return;
    }
    this.isInvalidatingAgeAssurance.set(true);
    try {
      const count = await this._ageAssuranceAdmin.previewInvalidation(
        basis,
        reason,
      );
      this.invalidationPreviewCount.set(count);
    } catch (error) {
      console.error("Failed to preview age assurance invalidation", error);
      this._snackbar.open(
        $localize`Could not preview the age-assurance rollback`,
        undefined,
        { duration: 4000 },
      );
    } finally {
      this.isInvalidatingAgeAssurance.set(false);
    }
  }

  async applyAgeAssuranceInvalidation(): Promise<void> {
    const basis = this.invalidationBasis().trim();
    const reason = this.invalidationReason().trim();
    const previewCount = this.invalidationPreviewCount();
    if (
      !basis ||
      reason.length < 5 ||
      previewCount === null ||
      this.isInvalidatingAgeAssurance()
    ) {
      return;
    }
    if (
      !globalThis.confirm(
        $localize`Revoke adult eligibility for ${previewCount} matching account(s)? Their public profiles and search visibility will be disabled.`,
      )
    ) {
      return;
    }

    this.isInvalidatingAgeAssurance.set(true);
    try {
      const processed = await this._ageAssuranceAdmin.invalidate(
        basis,
        reason,
      );
      this.invalidationPreviewCount.set(null);
      this._snackbar.open(
        $localize`Revoked adult eligibility for ${processed} account(s)`,
        undefined,
        { duration: 5000 },
      );
    } catch (error) {
      console.error("Failed to invalidate age assurance approvals", error);
      this._snackbar.open(
        $localize`Could not complete the age-assurance rollback`,
        undefined,
        { duration: 5000 },
      );
    } finally {
      this.isInvalidatingAgeAssurance.set(false);
    }
  }

  async handleContactMessage(
    message: ModerationContactMessageItem,
    actionType: Extract<
      ModerationActionType,
      "archive_contact_message" | "delete_contact_message"
    >,
  ): Promise<void> {
    if (this.actionPath()) {
      return;
    }

    if (
      actionType === "delete_contact_message" &&
      !globalThis.confirm(
        $localize`Delete this contact message from the active inbox? The message will still be recorded in moderation provenance.`,
      )
    ) {
      return;
    }

    this.actionPath.set(message.path);
    this._analytics.trackEvent("moderation_contact_action_started", {
      action_type: actionType,
      message_path: message.path,
      message_topic: message.topic ?? null,
    });
    try {
      await this._reportsService.handleContactMessage(message, actionType);
      await this.reload();
      this._analytics.trackEvent("moderation_contact_action_succeeded", {
        action_type: actionType,
        message_path: message.path,
        message_topic: message.topic ?? null,
      });
      this._snackbar.open($localize`Contact message archived`, undefined, {
        duration: 3000,
      });
    } catch (error) {
      console.error("Failed to handle contact message", error);
      this._analytics.trackEvent("moderation_contact_action_failed", {
        action_type: actionType,
        message_path: message.path,
        message_topic: message.topic ?? null,
      });
      this._snackbar.open($localize`Failed to update contact message`, undefined, {
        duration: 4000,
      });
    } finally {
      this.actionPath.set(null);
    }
  }

  communityCardTitle(suggestion: CommunityKnowledgeEditItem): string {
    const card = this._suggestedCard(suggestion);
    return this._localizedText(card?.title) || card?.id || suggestion.id;
  }

  communityCardCommunityLabel(suggestion: CommunityKnowledgeEditItem): string {
    return suggestion.community_display_name || suggestion.target_id;
  }

  communityCardCommunityPath(
    suggestion: CommunityKnowledgeEditItem,
  ): string | null {
    return suggestion.community_path || null;
  }

  communityCardCategory(suggestion: CommunityKnowledgeEditItem): string {
    return this._suggestedCard(suggestion)?.category || "other";
  }

  async approveCommunityCardSuggestion(
    suggestion: CommunityKnowledgeEditItem,
  ): Promise<void> {
    await this._handleCommunityCardSuggestionAction(suggestion, "approve");
  }

  async rejectCommunityCardSuggestion(
    suggestion: CommunityKnowledgeEditItem,
  ): Promise<void> {
    await this._handleCommunityCardSuggestionAction(suggestion, "reject");
  }

  spotEditPath(item: ModerationSpotEditQueueItem): string[] {
    return ["/map", "spots", item.spotId, "edits"];
  }

  spotEditSubmittedAtMillis(item: ModerationSpotEditQueueItem): number {
    return this._spotEditTimestampMillis(item.edit);
  }

  spotEditSubmitterLabel(item: ModerationSpotEditQueueItem): string {
    return (
      item.edit.user.display_name ||
      item.edit.user.uid ||
      $localize`Unknown editor`
    );
  }

  spotEditVoteLabel(item: ModerationSpotEditQueueItem): string {
    const summary = item.edit.vote_summary;
    if (!summary) {
      return $localize`No votes yet`;
    }
    return $localize`${summary.yes_count} yes · ${summary.no_count} no`;
  }

  organizationReviewLabel(item: ModerationSpotEditQueueItem): string {
    const organizationIds = item.edit.review_organization_ids?.length
      ? item.edit.review_organization_ids
      : item.edit.review_organization_id
      ? [item.edit.review_organization_id]
      : [];
    return organizationIds.length > 0
      ? organizationIds.join(", ")
      : $localize`Organization review`;
  }

  private async _handleCommunityCardSuggestionAction(
    suggestion: CommunityKnowledgeEditItem,
    action: "approve" | "reject",
  ): Promise<void> {
    const actionKey = `${suggestion.path}:${action}`;
    if (this.actionPath()) {
      return;
    }

    this.actionPath.set(actionKey);
    this._analytics.trackEvent("community_card_suggestion_action_started", {
      action,
      suggestion_id: suggestion.id,
      community_key: suggestion.target_id,
    });
    try {
      if (action === "approve") {
        await this._communityEditsService.approveEdit(suggestion);
      } else {
        await this._communityEditsService.rejectEdit(suggestion);
      }
      await this.reload();
      this._analytics.trackEvent("community_card_suggestion_action_succeeded", {
        action,
        suggestion_id: suggestion.id,
        community_key: suggestion.target_id,
      });
      this._snackbar.open(
        action === "approve"
          ? $localize`Community card approved`
          : $localize`Community card rejected`,
        undefined,
        { duration: 3000 },
      );
    } catch (error) {
      console.error("Failed to update community card suggestion", error);
      this._analytics.trackEvent("community_card_suggestion_action_failed", {
        action,
        suggestion_id: suggestion.id,
        community_key: suggestion.target_id,
      });
      this._snackbar.open(
        $localize`Failed to update community card suggestion`,
        undefined,
        { duration: 4000 },
      );
    } finally {
      this.actionPath.set(null);
    }
  }

  private _suggestedCard(
    edit: CommunityKnowledgeEditItem,
  ): CommunityInfoCardSchema | undefined {
    return edit.operation === "UPSERT_KNOWLEDGE_CARD"
      ? edit.data.card
      : undefined;
  }

  private _localizedText(value: CommunityLocalizedTextSchema | undefined): string {
    if (!value) {
      return "";
    }
    const english = this._localizedTextValue(value, "en");
    if (english) {
      return english;
    }
    for (const key of Object.keys(value)) {
      const text = this._localizedTextValue(value, key);
      if (text) {
        return text;
      }
    }
    return "";
  }

  private _localizedTextValue(
    value: CommunityLocalizedTextSchema,
    locale: string,
  ): string {
    const entry = value[locale];
    if (typeof entry === "string") {
      return entry.trim();
    }
    if (entry && typeof entry === "object" && "text" in entry) {
      return String(entry.text ?? "").trim();
    }
    return "";
  }

  private _spotEditTimestampMillis(edit: SpotEditSchema): number {
    if (typeof edit.timestamp_raw_ms === "number") {
      return edit.timestamp_raw_ms;
    }
    if (edit.timestamp && typeof edit.timestamp.toMillis === "function") {
      return edit.timestamp.toMillis();
    }
    const timestamp = edit.timestamp as
      | { seconds?: unknown; nanoseconds?: unknown }
      | undefined;
    return typeof timestamp?.seconds === "number"
      ? timestamp.seconds * 1000
      : 0;
  }
}
