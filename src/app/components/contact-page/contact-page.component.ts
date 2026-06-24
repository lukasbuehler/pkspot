import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { filter } from "rxjs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ContactMessageTopic } from "../../../db/schemas/ContactMessageSchema";
import { ContactMessagesService } from "../../services/firebase/firestore/contact-messages.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { AutoScrollOnFocusDirective } from "../../directives/auto-scroll-on-focus.directive";
import { MetaTagService } from "../../services/meta-tag.service";
import { AnalyticsService } from "../../services/analytics.service";

@Component({
  selector: "app-contact-page",
  templateUrl: "./contact-page.component.html",
  styleUrl: "./contact-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    AutoScrollOnFocusDirective,
  ],
})
export class ContactPageComponent implements OnInit {
  private readonly _formBuilder = inject(FormBuilder);
  private readonly _contactMessagesService = inject(ContactMessagesService);
  private readonly _authService = inject(AuthenticationService);
  private readonly _route = inject(ActivatedRoute);
  private readonly _metaTagService = inject(MetaTagService);
  private readonly _analyticsService = inject(AnalyticsService);
  private readonly _platformId = inject(PLATFORM_ID);
  private readonly _locale = inject<string>(LOCALE_ID);
  private readonly _destroyRef = inject(DestroyRef);
  private _trackedFormStarted = false;

  readonly instagramUrl = "https://instagram.com/pkspot.app";
  readonly discordUrl = "https://discord.gg/Th5vx4KnQb";
  readonly topic = signal<ContactMessageTopic>("general");
  readonly isSubmitting = signal(false);
  readonly submitError = signal("");
  readonly submitted = signal(false);

  readonly contactForm = this._formBuilder.nonNullable.group({
    contactInfo: ["", [Validators.required, Validators.maxLength(240)]],
    message: ["", [Validators.required, Validators.maxLength(4000)]],
    website: [""],
  });

  readonly topicTitle = computed(() => {
    switch (this.topic()) {
      case "spot-import":
        return $localize`:@@contact.topic.spot_import.title:Share a spot map`;
      case "crew":
        return $localize`:@@contact.topic.crew.title:Join the crew`;
      default:
        return $localize`:@@contact.topic.general.title:Contact PK Spot`;
    }
  });

  readonly topicIntro = computed(() => {
    switch (this.topic()) {
      case "spot-import":
        return $localize`:@@contact.topic.spot_import.intro:Have a Google My Maps, KML/KMZ, spreadsheet, or local spot list? Send it over and we can help bring those spots into PK Spot.`;
      case "crew":
        return $localize`:@@contact.topic.crew.intro:Want to help with testing, spot reviews, translations, design, community work, or software? We'd love to hear where you want to pitch in.`;
      default:
        return $localize`:@@contact.topic.general.intro:Questions, ideas, bug reports, partnerships, or anything else around PK Spot are welcome here.`;
    }
  });

  ngOnInit(): void {
    this._metaTagService.setStaticPageMetaTags(
      $localize`:@@contact.meta.title:Contact`,
      $localize`:@@contact.meta.description:Contact PK Spot about support, spot map imports, partnerships, testing, or joining the crew.`,
      undefined,
      "/contact"
    );

    const topic = this._normalizeTopic(
      this._route.snapshot.queryParamMap.get("topic")
    );
    const communityName = this._normalizeCommunityName(
      this._route.snapshot.queryParamMap.get("community")
    );
    this.topic.set(topic);
    this._prefillMessage(topic, communityName);
    this._prefillContactInfoWhenAvailable();
    this._analyticsService.trackEvent("Contact Opened", {
      topic,
      source_path: this._sourcePath(),
    });
    this._trackFormStartWhenEdited();
  }

  get contactInfoHasError(): boolean {
    const control = this.contactForm.controls.contactInfo;
    return control.invalid && (control.dirty || control.touched);
  }

  get messageHasError(): boolean {
    const control = this.contactForm.controls.message;
    return control.invalid && (control.dirty || control.touched);
  }

  async submitContactMessage(): Promise<void> {
    if (this.isSubmitting()) {
      return;
    }

    const sourcePath = this._sourcePath();
    this._analyticsService.trackEvent("contact_submit_clicked", {
      topic: this.topic(),
      source_path: sourcePath,
      has_contact_info: !!this.contactForm.controls.contactInfo.value.trim(),
      has_message: !!this.contactForm.controls.message.value.trim(),
    });

    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      this._analyticsService.trackEvent("contact_submit_invalid", {
        topic: this.topic(),
        source_path: sourcePath,
        contact_info_invalid: this.contactForm.controls.contactInfo.invalid,
        message_invalid: this.contactForm.controls.message.invalid,
      });
      return;
    }

    const value = this.contactForm.getRawValue();
    if (value.website.trim()) {
      this._analyticsService.trackEvent("contact_honeypot_filled", {
        topic: this.topic(),
        source_path: sourcePath,
      });
      this.submitted.set(true);
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set("");

    try {
      const messageId =
        await this._contactMessagesService.submitContactMessage({
          message: value.message,
          contactInfo: value.contactInfo,
          topic: this.topic(),
          analytics: this._analyticsService.getCurrentAnalyticsContext(),
          locale: this._locale,
          sourcePath,
          userAgent: this._userAgent(),
        });
      this._analyticsService.trackEvent("Contact Sent", {
        topic: this.topic(),
        source_path: sourcePath,
        contact_message_id: messageId,
      });
      this.submitted.set(true);
      this.contactForm.reset({
        contactInfo: value.contactInfo,
        message: "",
        website: "",
      });
    } catch (error) {
      console.error("Failed to submit contact message", error);
      this._analyticsService.trackEvent("contact_submit_failed", {
        topic: this.topic(),
        source_path: sourcePath,
      });
      this.submitError.set(
        $localize`:@@contact.submit.error:Could not send your message. Please try again or reach out on Instagram.`
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }

  sendAnotherMessage(): void {
    this._analyticsService.trackEvent("contact_send_another_clicked", {
      topic: this.topic(),
      source_path: this._sourcePath(),
    });
    this.submitted.set(false);
  }

  trackContactChannelClick(channel: "contact_form" | "discord" | "instagram") {
    this._analyticsService.trackContactChannelClick(channel, "contact_page", {
      topic: this.topic(),
      source_path: this._sourcePath(),
    });
  }

  private _prefillContactInfoWhenAvailable(): void {
    this._authService.authState$
      .pipe(
        filter((user) => !!user?.email),
        takeUntilDestroyed(this._destroyRef)
      )
      .subscribe((user) => {
        const contactInfoControl = this.contactForm.controls.contactInfo;
        if (contactInfoControl.value.trim()) {
          return;
        }
        contactInfoControl.setValue(user?.email?.trim() ?? "");
      });
  }

  private _trackFormStartWhenEdited(): void {
    this.contactForm.valueChanges
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((value) => {
        if (this._trackedFormStarted) {
          return;
        }

        const hasContactInfo = !!value.contactInfo?.trim();
        const hasMessage = !!value.message?.trim();
        if (!hasContactInfo && !hasMessage) {
          return;
        }

        this._trackedFormStarted = true;
        this._analyticsService.trackEvent("contact_form_started", {
          topic: this.topic(),
          source_path: this._sourcePath(),
          started_with_contact_info: hasContactInfo,
          started_with_message: hasMessage,
        });
      });
  }

  private _prefillMessage(
    topic: ContactMessageTopic,
    communityName: string | null
  ): void {
    if (topic === "spot-import") {
      this.contactForm.controls.message.setValue(
        $localize`:@@contact.prefill.spot_import:Hi PK Spot, I have a spot map or list I would like to share: `
      );
      return;
    }

    if (topic === "crew") {
      this.contactForm.controls.message.setValue(
        $localize`:@@contact.prefill.crew:Hi PK Spot, I would like to help with: `
      );
    }

    if (communityName) {
      this.contactForm.controls.message.setValue(
        $localize`:@@contact.prefill.community_knowledge:Hi PK Spot, I have local knowledge for ${communityName}:communityName:: `
      );
    }
  }

  private _normalizeTopic(value: string | null): ContactMessageTopic {
    if (value === "spot-import" || value === "crew") {
      return value;
    }
    return "general";
  }

  private _sourcePath(): string | undefined {
    const sourcePath = this._normalizeSourcePath(
      this._route.snapshot.queryParamMap.get("source")
    );
    if (sourcePath) {
      return sourcePath;
    }

    if (!isPlatformBrowser(this._platformId)) {
      return undefined;
    }
    return `${window.location.pathname}${window.location.search}`;
  }

  private _normalizeSourcePath(value: string | null): string | null {
    const sourcePath = value?.trim();
    if (
      !sourcePath ||
      sourcePath.length > 600 ||
      !sourcePath.startsWith("/") ||
      sourcePath.startsWith("//") ||
      sourcePath.includes("://")
    ) {
      return null;
    }
    return sourcePath;
  }

  private _normalizeCommunityName(value: string | null): string | null {
    const communityName = value?.trim();
    return communityName && communityName.length <= 120 ? communityName : null;
  }

  private _userAgent(): string | undefined {
    if (!isPlatformBrowser(this._platformId)) {
      return undefined;
    }
    return navigator.userAgent;
  }
}
