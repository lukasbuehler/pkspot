import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import { MetaTagService } from "../../services/meta-tag.service";
import { AnalyticsService } from "../../services/analytics.service";
import { ReleaseHero } from "../../releases/release-notes";
import { ReleaseHeroComponent } from "../release-hero/release-hero.component";
import { GitHubIssuesComponent } from "../github-issues/github-issues.component";
import { GITHUB_REPO_URL as GITHUB_URL } from "../github-issues/github-issues";
import crew from "../../../assets/data/crew.json";
const DISCORD_URL = "https://discord.gg/Th5vx4KnQb";

/** A link on a way-to-help card: an app route or an outside page. */
export interface ContributeAction {
  id: string;
  label: string;
  routerLink?: string;
  queryParams?: Record<string, string>;
  href?: string;
}

/** One way to help, shown as a card with a tonal icon tile. */
export interface ContributeWay {
  id: string;
  icon: string;
  title: string;
  body: string;
  actions: readonly ContributeAction[];
  /** The one card per page that is highlighted and spans the full width. */
  featured?: boolean;
}

export interface ContributeSection {
  id: string;
  title: string;
  intro: string;
  ways: readonly ContributeWay[];
}

/**
 * `/contribute`: how anyone can help PK Spot, from adding Spots to writing
 * code. The banner is the release banner, so the page feels part of the
 * same "this is how PK Spot grows" story as `/releases`.
 */
@Component({
  selector: "app-contribute-page",
  imports: [MatButtonModule, MatCardModule, MatIconModule, RouterLink, ReleaseHeroComponent, GitHubIssuesComponent],
  templateUrl: "./contribute-page.component.html",
  styleUrl: "./contribute-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributePageComponent {
  private readonly _analytics = inject(AnalyticsService);

  protected readonly hero: ReleaseHero = {
    icons: [
      { icon: "add_location" },
      { icon: "lightbulb" },
      { icon: "translate" },
      { icon: "event" },
      { icon: "code" },
      { icon: "forum" },
    ],
    centerpiece: { icon: "volunteer_activism" },
  };

  protected readonly contributorsUrl = `${GITHUB_URL}/graphs/contributors`;

  /** The same crew list as the About page and the credits in Settings. */
  protected readonly crew = crew.map((member) => ({
    name: member.name,
    role: member.role,
    initial: member.name.charAt(0),
  }));

  protected readonly sections: readonly ContributeSection[] = [
    {
      id: "map",
      title: $localize`:@@contribute.map.title:On the map`,
      intro: $localize`:@@contribute.map.intro:No setup needed. All you need is an account.`,
      ways: [
        {
          id: "spots",
          icon: "add_location",
          featured: true,
          title: $localize`:@@contribute.spots.title:Add and improve Spots`,
          body: $localize`:@@contribute.spots.body:Know a Spot that is missing? Add it. Good photos, a short description and the right Spot type help others decide where to train.`,
          actions: [
            { id: "map", label: $localize`:@@contribute.spots.action:Open the map`, routerLink: "/map" },
          ],
        },
        {
          id: "events",
          icon: "event",
          title: $localize`:@@contribute.events.title:Suggest Events`,
          body: $localize`:@@contribute.events.body:Tell us about jams, workshops and competitions near you.`,
          actions: [
            { id: "suggest_event", label: $localize`:@@contribute.events.action:Suggest an Event`, routerLink: "/events/suggest" },
          ],
        },
        {
          id: "spot_import",
          icon: "map",
          title: $localize`:@@contribute.import.title:Share your Spot map`,
          body: $localize`:@@contribute.import.body:Does your community keep a list or map of Spots? Send it to us and we help bring it into PK Spot.`,
          actions: [
            {
              id: "spot_import",
              label: $localize`:@@contribute.import.action:Send a Spot map`,
              routerLink: "/contact",
              queryParams: { topic: "spot_import" },
            },
          ],
        },
      ],
    },
    {
      id: "feedback",
      title: $localize`:@@contribute.feedback.title:Ideas and bugs`,
      intro: $localize`:@@contribute.feedback.intro:Most features started as a message from someone who trains.`,
      ways: [
        {
          id: "bugs",
          icon: "report",
          title: $localize`:@@contribute.bugs.title:Report a bug`,
          body: $localize`:@@contribute.bugs.body:Tell us what happened and on which device. A screenshot helps a lot.`,
          actions: [
            { id: "github_issue", label: $localize`:@@contribute.bugs.action:Open an issue`, href: `${GITHUB_URL}/issues/new` },
          ],
        },
        {
          id: "ideas",
          icon: "lightbulb",
          title: $localize`:@@contribute.ideas.title:Share an idea`,
          body: $localize`:@@contribute.ideas.body:Missing something? Talk to us and the community on Discord.`,
          actions: [
            { id: "discord", label: $localize`:@@contribute.ideas.action:Join Discord`, href: DISCORD_URL },
          ],
        },
      ],
    },
    {
      id: "build",
      title: $localize`:@@contribute.build.title:Languages and code`,
      intro: $localize`:@@contribute.build.intro:PK Spot is open source. Everything is on GitHub.`,
      ways: [
        {
          id: "translate",
          icon: "translate",
          title: $localize`:@@contribute.translate.title:Translate PK Spot`,
          body: $localize`:@@contribute.translate.body:Fix a translation in your language, or help us add a new one.`,
          actions: [
            { id: "translation_guide", label: $localize`:@@contribute.translate.action:Translation guide`, href: `${GITHUB_URL}/blob/main/CONTRIBUTING.md#translation` },
          ],
        },
        {
          id: "code",
          icon: "code",
          title: $localize`:@@contribute.code.title:Write code`,
          body: $localize`:@@contribute.code.body:Built with Angular and Firebase. Pick an open issue or fix something that bugs you.`,
          actions: [
            { id: "github_issues", label: $localize`:@@contribute.code.action:See open issues`, href: `${GITHUB_URL}/issues` },
          ],
        },
      ],
    },
    {
      id: "team",
      title: $localize`:@@contribute.team.title:Join the team`,
      intro: $localize`:@@contribute.team.intro:PK Spot is built by volunteers from the Parkour community.`,
      ways: [
        {
          id: "crew",
          icon: "groups",
          title: $localize`:@@contribute.crew.title:Join the crew`,
          body: $localize`:@@contribute.crew.body:Test new versions, review Spots, design, write or help your local community.`,
          actions: [
            {
              id: "crew",
              label: $localize`:@@about.crew.contact_button:Join us`,
              routerLink: "/contact",
              queryParams: { topic: "crew" },
            },
          ],
        },
        {
          id: "partner",
          icon: "handshake",
          title: $localize`:@@contribute.partner.title:Partner with us`,
          body: $localize`:@@contribute.partner.body:Associations, gyms and brands help keep PK Spot free.`,
          actions: [
            { id: "partner", label: $localize`:@@contribute.partner.action:Get in touch`, routerLink: "/contact" },
          ],
        },
      ],
    },
  ];

  constructor() {
    inject(MetaTagService).setStaticPageMetaTags(
      $localize`:@@contribute.meta.title:How to help`,
      $localize`:@@contribute.meta.description:Help build PK Spot: add Spots, suggest Events, report bugs, translate or write code. PK Spot is free, open source and built by the Parkour community.`,
      undefined,
      "/contribute",
    );
  }

  protected trackOutbound(action: ContributeAction): void {
    this._analytics.trackOutboundLinkClick("contribute_page", action.id, action.href, action.label);
  }
}
