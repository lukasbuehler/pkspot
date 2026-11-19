import { ReleaseIconTone } from "./release-notes";

/** A translated headline feature of a release, shown with a tonal icon tile. */
export interface ReleaseHighlight {
  /** One of the release's banner icons, so the card and its banner match. */
  icon: string;
  tone?: ReleaseIconTone;
  title: string;
  body: string;
}

/**
 * Translated highlights for every release, shown on the release cards and
 * pages. The full notes in `release-notes.ts` stay English; only these short
 * headlines go through XLIFF.
 *
 * The 1.2 IDs are the ones the what's-new dialog has always used, so their
 * translations carry over.
 */
export const RELEASE_HIGHLIGHTS: Readonly<Record<string, readonly ReleaseHighlight[]>> = {
  "1.2.2": [
    {
      icon: "public",
      tone: "primary",
      title: $localize`:@@release.1_2_2.cache.title:Faster pages`,
      body: $localize`:@@release.1_2_2.cache.body:Pages load from a cache close to you.`,
    },
    {
      icon: "privacy_tip",
      title: $localize`:@@release.1_2_2.privacy.title:Private by default`,
      body: $localize`:@@release.1_2_2.privacy.body:Analytics only store anything on your device if you opt in, and photo locations are removed before upload.`,
    },
    {
      icon: "location_on",
      title: $localize`:@@release.1_2_2.activity.title:Activity on the map`,
      body: $localize`:@@release.1_2_2.activity.body:Spots show their recent activity on the map again.`,
    },
    {
      icon: "groups",
      title: $localize`:@@release.1_2_2.communities.title:Community links`,
      body: $localize`:@@release.1_2_2.communities.body:Spot and Event pages link to their communities.`,
    },
  ],
  "1.2.1": [
    {
      icon: "search",
      tone: "primary",
      title: $localize`:@@release.1_2_1.search.title:Better search`,
      body: $localize`:@@release.1_2_1.search.body:The closest name matches come first.`,
    },
    {
      icon: "map",
      title: $localize`:@@release.1_2_1.map.title:A steadier map`,
      body: $localize`:@@release.1_2_1.map.body:The map stays in place when the layout changes.`,
    },
    {
      icon: "phone_iphone",
      title: $localize`:@@release.1_2_1.tabBar.title:Native tab bar on iPhone`,
      body: $localize`:@@release.1_2_1.tabBar.body:Navigation that feels at home on iOS.`,
    },
    {
      icon: "share",
      title: $localize`:@@release.1_2_1.share.title:Clearer sharing`,
      body: $localize`:@@release.1_2_1.share.body:Clearer share cards, and sharing and following communities.`,
    },
  ],
  "1.2": [
    {
      icon: "steps",
      tone: "primary",
      title: $localize`:@@whatsNew.train.title:Train tab`,
      body: $localize`:@@whatsNew.train.body:Your next session, nearby Spots, the hourly forecast and Events in one place.`,
    },
    {
      icon: "beenhere",
      tone: "live",
      title: $localize`:@@whatsNew.checkIn.title:Check in and check out`,
      body: $localize`:@@whatsNew.checkIn.body:Your training time is logged automatically.`,
    },
    {
      icon: "insights",
      title: $localize`:@@whatsNew.stats.title:Your training stats`,
      body: $localize`:@@whatsNew.stats.body:See where and how much you trained, privately.`,
    },
    {
      icon: "trophy",
      tone: "gold",
      title: $localize`:@@whatsNew.legend.title:Become the local legend`,
      body: $localize`:@@whatsNew.legend.body:Opt in to a private monthly rank at your favourite Spots.`,
    },
  ],
  "1.1.5": [
    {
      icon: "search",
      tone: "primary",
      title: $localize`:@@release.1_1_5.links.title:Paste map links`,
      body: $localize`:@@release.1_1_5.links.body:Paste a Google Maps or Apple Maps link into the map search.`,
    },
    {
      icon: "notifications",
      title: $localize`:@@release.1_1_5.notifications.title:Notifications that land right`,
      body: $localize`:@@release.1_1_5.notifications.body:Links and actions open the right page.`,
    },
    {
      icon: "event",
      title: $localize`:@@release.1_1_5.events.title:Event fixes`,
      body: $localize`:@@release.1_1_5.events.body:Changing your response works, and finished Events move to Past.`,
    },
    {
      icon: "photo_camera",
      title: $localize`:@@release.1_1_5.uploads.title:Better uploads`,
      body: $localize`:@@release.1_1_5.uploads.body:Clearer crop controls with larger handles on mobile.`,
    },
  ],
  "1.1.4": [
    {
      icon: "notifications",
      tone: "primary",
      title: $localize`:@@release.1_1_4.notifications.title:Notifications`,
      body: $localize`:@@release.1_1_4.notifications.body:Community digests, Event reminders and Spot edit updates on iOS, Android and the web.`,
    },
    {
      icon: "sunny",
      title: $localize`:@@release.1_1_4.weather.title:Weather`,
      body: $localize`:@@release.1_1_4.weather.body:Google Weather for Spots, the map area you are viewing and Events.`,
    },
    {
      icon: "calendar_month",
      title: $localize`:@@release.1_1_4.myEvents.title:Add to My Events`,
      body: $localize`:@@release.1_1_4.myEvents.body:Save an Event and get its reminders.`,
    },
  ],
  "1.1.3": [
    {
      icon: "person",
      tone: "primary",
      title: $localize`:@@release.1_1_3.profiles.title:New profiles`,
      body: $localize`:@@release.1_1_3.profiles.body:Updated profile pages and following.`,
    },
    {
      icon: "forum",
      title: $localize`:@@release.1_1_3.suggestions.title:Community suggestions`,
      body: $localize`:@@release.1_1_3.suggestions.body:Suggest changes to community cards.`,
    },
    {
      icon: "verified",
      title: $localize`:@@release.1_1_3.moderation.title:Moderation queue`,
      body: $localize`:@@release.1_1_3.moderation.body:Admins review community and Spot votes in one place.`,
    },
  ],
  "1.1.2": [
    {
      icon: "event",
      tone: "primary",
      title: $localize`:@@release.1_1_2.events.title:Event pages`,
      body: $localize`:@@release.1_1_2.events.body:Every Event gets its own info page, with RSVPs.`,
    },
    {
      icon: "groups",
      title: $localize`:@@release.1_1_2.communities.title:Community cards`,
      body: $localize`:@@release.1_1_2.communities.body:Info cards for local communities.`,
    },
    {
      icon: "verified",
      title: $localize`:@@release.1_1_2.verified.title:Verified Spots`,
      body: $localize`:@@release.1_1_2.verified.body:Organizations can verify Spots.`,
    },
    {
      icon: "map",
      title: $localize`:@@release.1_1_2.map.title:A faster map`,
      body: $localize`:@@release.1_1_2.map.body:Map performance and design improvements.`,
    },
  ],
  "1.1.1": [
    {
      icon: "groups",
      tone: "primary",
      title: $localize`:@@release.1_1_1.communities.title:Communities and Events`,
      body: $localize`:@@release.1_1_1.communities.body:Find your local community and what is happening.`,
    },
    {
      icon: "bookmark",
      title: $localize`:@@release.1_1_1.saved.title:Save Spots`,
      body: $localize`:@@release.1_1_1.saved.body:Save Spots and mark the ones you have visited.`,
    },
    {
      icon: "search",
      title: $localize`:@@release.1_1_1.search.title:Map search`,
      body: $localize`:@@release.1_1_1.search.body:Search the map and browse community pages.`,
    },
  ],
  "1.0.11": [
    {
      icon: "bookmark",
      tone: "primary",
      title: $localize`:@@release.1_0_11.lists.title:Saved and visited lists`,
      body: $localize`:@@release.1_0_11.lists.body:Keep track of the Spots you want to visit and the ones you have.`,
    },
    {
      icon: "verified",
      title: $localize`:@@release.1_0_11.verification.title:Verification`,
      body: $localize`:@@release.1_0_11.verification.body:Clearer sources and verification for Spots.`,
    },
  ],
  "1.0.9": [
    {
      icon: "map",
      tone: "primary",
      title: $localize`:@@release.1_0_9.satellite.title:Satellite map`,
      body: $localize`:@@release.1_0_9.satellite.body:A hybrid satellite map with location labels.`,
    },
    {
      icon: "image",
      title: $localize`:@@release.1_0_9.images.title:Faster images`,
      body: $localize`:@@release.1_0_9.images.body:Performance and image-loading improvements.`,
    },
    {
      icon: "star",
      title: $localize`:@@release.1_0_9.previews.title:Animated previews`,
      body: $localize`:@@release.1_0_9.previews.body:Splash screens and animated Spot previews.`,
    },
  ],
  "1.0.8": [
    {
      icon: "location_on",
      tone: "primary",
      title: $localize`:@@release.1_0_8.location.title:Better location`,
      body: $localize`:@@release.1_0_8.location.body:A faster map and clearer location handling.`,
    },
    {
      icon: "image",
      title: $localize`:@@release.1_0_8.previews.title:Spot previews`,
      body: $localize`:@@release.1_0_8.previews.body:Improved previews, highlights and clusters.`,
    },
    {
      icon: "person",
      title: $localize`:@@release.1_0_8.fixes.title:Sign-in fixes`,
      body: $localize`:@@release.1_0_8.fixes.body:Google sign-in, profile pictures and language fixes.`,
    },
  ],
};

export function releaseHighlights(version: string): readonly ReleaseHighlight[] {
  return RELEASE_HIGHLIGHTS[version] ?? [];
}
