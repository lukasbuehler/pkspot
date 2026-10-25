import { Component, OnInit, inject, ChangeDetectionStrategy } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatExpansionModule } from "@angular/material/expansion";
import { RouterLink } from "@angular/router";
import { MetaTagService } from "../../services/meta-tag.service";
import { AnalyticsService, ContactChannel } from "../../services/analytics.service";

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqCategory {
  title: string;
  icon: string;
  items: FaqItem[];
}

@Component({
  selector: "app-support-page",
  templateUrl: "./support-page.component.html",
  styleUrl: "./support-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatExpansionModule,
    RouterLink,
  ],
})
export class SupportPageComponent implements OnInit {
  private readonly _metaTagService = inject(MetaTagService);
  private readonly _analytics = inject(AnalyticsService);

  ngOnInit(): void {
    this._metaTagService.setStaticPageMetaTags(
      $localize`:@@support.meta.title:Support`,
      $localize`:@@support.meta.description:Get help with PK Spot — answers to common questions about parkour spots, accounts, and the community.`,
      undefined,
      "/support"
    );
  }

  readonly faqCategories: FaqCategory[] = [
    {
      title: $localize`Account & Profile`,
      icon: "person",
      items: [
        {
          question: $localize`How do I delete my account?`,
          answer:
            $localize`Go to Settings > Account > Delete Account. You'll be asked to confirm this action. Note that this will permanently delete all your data and cannot be undone.`,
        },
        {
          question: $localize`How do I change my email address?`,
          answer:
            $localize`Go to Settings > Account and you'll find the option to update your email address. You'll need to verify the new email before the change takes effect.`,
        },
        {
          question: $localize`I can't verify my email, what do I do?`,
          answer:
            $localize`Check your spam folder first. If you still can't find the verification email, go to Settings > Account and request a new verification email. If problems persist, contact us on Discord.`,
        },
        {
          question: $localize`How do I change my profile picture?`,
          answer:
            $localize`Tap on your profile picture in your profile page, and you can select a new image from your device.`,
        },
      ],
    },
    {
      title: $localize`Using the Map`,
      icon: "map",
      items: [
        {
          question: $localize`How do I add a new spot?`,
          answer:
            $localize`Tap the '+' button on the map when zoomed in close enough. Place the marker at the spot location, fill in the details like name, description, and amenities, then submit for review.`,
        },
        {
          question: $localize`How do I report or edit an incorrect spot?`,
          answer:
            $localize`Open the spot details and tap the edit icon. You can suggest changes which will be reviewed by the community. For serious issues, use the report button.`,
        },
        {
          question: $localize`What are the map filters?`,
          answer:
            $localize`Filters let you find spots with specific features like being covered from rain, lit at night, indoor, or having specific amenities. Access them from the filter button on the map.`,
        },
        {
          question: $localize`Why can't I see any spots in my area?`,
          answer:
            $localize`PK Spot relies on community contributions. If there are no spots in your area yet, be the first to add one!`,
        },
      ],
    },
    {
      title: $localize`App & Technical`,
      icon: "mobile",
      items: [
        {
          question: $localize`The app is crashing, what should I do?`,
          answer:
            $localize`Try clearing the app cache or reinstalling. If problems persist, please report the issue on our Discord with details about your device and what you were doing when it crashed.`,
        },
        {
          question: $localize`How do I install the app on my phone?`,
          answer:
            $localize`PK Spot is available on iOS and Android. You can also install it as a Progressive Web App (PWA) by opening the menu in your browser and selecting 'Add to Home Screen' or 'Install'.`,
        },
        {
          question: $localize`Is my data safe?`,
          answer:
            $localize`Yes! We take privacy seriously. We don't sell your data and use industry-standard security. Check our Privacy Policy for full details.`,
        },
      ],
    },
  ];

  readonly discordUrl = "https://discord.gg/Th5vx4KnQb";
  readonly instagramUrl = "https://instagram.com/pkspot.app";
  readonly statusPageUrl = "https://status.pkspot.app";

  trackContactChannelClick(channel: ContactChannel, ctaId: string): void {
    this._analytics.trackContactChannelClick(channel, "support_page", {
      cta_id: ctaId,
    });
  }

  trackOutboundLinkClick(
    linkType: string,
    url: string,
    ctaLabel: string,
  ): void {
    this._analytics.trackOutboundLinkClick(
      "support_page",
      linkType,
      url,
      ctaLabel,
    );
  }
}
