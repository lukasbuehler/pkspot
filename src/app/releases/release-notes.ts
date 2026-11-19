/**
 * The release history of PK Spot: the single source for the `/releases`
 * pages, the animated release heroes and the "Release Notes" section of the
 * README (run `npm run releases:readme` after editing).
 *
 * This file is plain data on purpose. It has no Angular or `$localize`
 * imports, so the README script can load it directly with Node. The full
 * notes stay English; translated highlights for a release live in
 * `release-highlights.ts`.
 */

export type ReleasePlatform = "web" | "ios" | "android";

/**
 * Colour role of an icon. Green (`live`) is only for live presence such as
 * check-ins; `gold` is the local-legend rank colour.
 */
export type ReleaseIconTone = "primary" | "live" | "gold";

export interface ReleaseIcon {
  /** A Material Symbols name that is in `src/assets/fonts/icons_list.txt`. */
  icon: string;
  tone?: ReleaseIconTone;
}

/**
 * How big a release feels. `major` is a new 1.x minor version (1.2, 1.1),
 * `update` a patch on every platform, `web` a web-only patch.
 */
export type ReleaseTier = "major" | "update" | "web";

/** How many of the hero's icons each tier shows; the rest are left out. */
export const RELEASE_TIER_ICON_COUNT: Readonly<Record<ReleaseTier, number>> = {
  major: 6,
  update: 4,
  web: 3,
};

/**
 * Icons float in one after another, then the centerpiece pops in. List the
 * icons by importance: smaller tiers show only the first few.
 */
export interface ReleaseHero {
  icons: readonly ReleaseIcon[];
  centerpiece: ReleaseIcon;
}

/** One bullet, optionally with nested bullets. */
export type ReleaseNote = string | { text: string; items: readonly string[] };

export interface Release {
  /** Used in the URL, `/releases/<version>`. Unique. */
  version: string;
  /** Shown instead of the version when a release covers several versions. */
  label?: string;
  name?: string;
  /** ISO date (YYYY-MM-DD) the release went out. */
  date: string;
  /** Omitted when the release went out on the web, iOS and Android. */
  platforms?: readonly ReleasePlatform[];
  hero: ReleaseHero;
  notes: readonly ReleaseNote[];
  /** Overrides the tier derived from the version, for a release covering a new minor version. */
  tier?: ReleaseTier;
}

/** Newest first. */
export const RELEASES: readonly Release[] = [
  {
    version: "1.2.2",
    date: "2026-11-15",
    platforms: ["web"],
    hero: {
      icons: [
        { icon: "privacy_tip" },
        { icon: "location_on" },
        { icon: "groups" },
        { icon: "photo_camera" },
        { icon: "share" },
        { icon: "check_circle" },
      ],
      centerpiece: { icon: "public" },
    },
    notes: [
      "Faster page loads: pages are served from a cache close to you",
      "Analytics only store anything on your device if you opt in",
      "Activity dots on Spots are back on the map",
      "Community links on Spot and event pages",
      "Photo locations are removed before upload",
      "Bug fixes for Spot editing and links",
    ],
  },
  {
    version: "1.2.1",
    name: "Training Polishes & Bug fixes",
    date: "2026-11-04",
    hero: {
      icons: [
        { icon: "search" },
        { icon: "map" },
        { icon: "phone_iphone" },
        { icon: "share" },
        { icon: "groups" },
        { icon: "language" },
      ],
      centerpiece: { icon: "tune" },
    },
    notes: [
      "Search results now put the closest name matches first",
      "The map stays in place when the layout changes instead of reloading",
      "Native tab bar on iPhone",
      "Clearer share cards, and sharing and following communities",
      "Faster page loads and first-visit welcome",
      "Only promoted events appear in the map island",
      "Translation, privacy and general bug fixes",
    ],
  },
  {
    version: "1.2",
    name: "Training Update",
    date: "2026-10-26",
    hero: {
      icons: [
        { icon: "steps" },
        { icon: "event" },
        { icon: "rainy" },
        { icon: "beenhere", tone: "live" },
        { icon: "location_on" },
        { icon: "insights" },
      ],
      centerpiece: { icon: "trophy", tone: "gold" },
    },
    notes: [
      "New Train tab: find your next session with nearby Spots, the forecast with hourly rain amounts, and upcoming Events from nearby and your communities",
      "Check in at Spots and check out when you are done; your training time is logged without typing a duration",
      "Private training log with session details, recovery pauses, your rhythm and streaks",
      "Private training statistics: visits, training time and your most visited Spots by month and year",
      "Private monthly Spot ranks: become the local legend of your Spot. Ranks update once a day, appear once three people checked in, and only you can see yours",
      'Spots show a coarse "trained here recently" range, never who or when',
      "Town and country names in your language on Spot and Event cards, and search finds places by any of their names (for example Lüttich, Liège or Luik)",
      "Map: larger search results, only the country community you are looking at, and filters that apply to the area you are viewing",
      "Improved Events, community voting, Spot editing, following, and reports",
      "Android performance and startup fixes",
      "Bug fixes, privacy improvements, and legacy Event discovery cleanup",
      "Experimental: Android gallery photo sharing and iOS Maps sharing",
    ],
  },
  {
    version: "1.1.5",
    name: "Reliability & Bug Fixes",
    date: "2026-08-27",
    hero: {
      icons: [
        { icon: "search" },
        { icon: "notifications" },
        { icon: "event" },
        { icon: "photo_camera" },
        { icon: "map" },
        { icon: "check_circle" },
      ],
      centerpiece: { icon: "shield" },
    },
    notes: [
      "Added support for pasting Google Maps and Apple Maps links into map search",
      {
        text: "Bug fixes:",
        items: [
          "Fixed email and password sign-up failures and improved privacy-safe error reporting",
          "Fixed notification links and actions that could open the wrong page or a 404",
          "Fixed changing an Event response from Interested to Going",
          "Moved completed Events from Going or Saved into Past",
          "Prevented the iOS age-range request from appearing at app startup and added a clear explanation before users choose to request it in Settings",
          "Restored Swiss Jam Event challenges when their parent Spots are not included in the initial Event search results",
          "Hid past Events from Community pages and aligned Community Spot ranking with the main map",
          "Corrected stale RSVP counts on Spot Event cards and made rain status begin at a 50% precipitation chance or measurable rainfall",
          "Improved media upload and crop controls, including clearer completion state, Material rotation buttons, and larger mobile crop handles",
          "Improved imported Spot attribution reliability and reduced redundant backend writes",
        ],
      },
    ],
  },
  {
    version: "1.1.4",
    name: "Notifications & Weather",
    date: "2026-08-06",
    hero: {
      icons: [
        { icon: "sunny" },
        { icon: "rainy" },
        { icon: "calendar_month" },
        { icon: "cloud" },
        { icon: "event" },
        { icon: "location_on" },
      ],
      centerpiece: { icon: "notifications" },
    },
    notes: [
      "Added notifications to iOS, Android, and Web: community digests, event reminders, and Spot edit submission updates",
      "Added Google Weather to Spots, the current map area, and events",
      'Improved Events: RSVP became "Add to My Events" and enables notifications',
    ],
  },
  {
    version: "1.1.3",
    name: "Profiles & Community Submissions",
    date: "2026-07-18",
    hero: {
      icons: [
        { icon: "groups" },
        { icon: "forum" },
        { icon: "verified" },
        { icon: "flag" },
        { icon: "star" },
        { icon: "bookmark" },
      ],
      centerpiece: { icon: "person" },
    },
    notes: [
      "Updated Profile pages and following mechanics",
      "Users can submit community card suggestions",
      "Moderation queue for admins to view community and spot votes",
    ],
  },
  {
    version: "1.1.2",
    name: "Events & Communities",
    date: "2026-06-25",
    hero: {
      icons: [
        { icon: "groups" },
        { icon: "calendar_month" },
        { icon: "map" },
        { icon: "verified" },
        { icon: "check_circle" },
        { icon: "location_on" },
      ],
      centerpiece: { icon: "event" },
    },
    notes: [
      "Event info pages",
      "Community info cards",
      "Event series to filter by",
      "Map performance and UI/UX improvements",
      "Organizations can verify spots",
      "Event RSVPs",
      "Bug fixes and polishing",
    ],
  },
  {
    version: "1.1.1",
    label: "1.1.0 and 1.1.1",
    tier: "major",
    name: "Communities and more",
    date: "2026-05-21",
    hero: {
      icons: [
        { icon: "event" },
        { icon: "bookmark" },
        { icon: "check_circle" },
        { icon: "map" },
        { icon: "search" },
        { icon: "location_on" },
      ],
      centerpiece: { icon: "groups" },
    },
    notes: [
      "Added Communities and Events",
      "Save spots and mark them as visited",
      "Added community pages and map search",
      "Bug fixes and UI polish",
    ],
  },
  {
    version: "1.0.11",
    date: "2026-02-22",
    hero: {
      icons: [
        { icon: "check_circle" },
        { icon: "verified" },
        { icon: "location_on" },
        { icon: "search" },
        { icon: "star" },
        { icon: "map" },
      ],
      centerpiece: { icon: "bookmark" },
    },
    notes: [
      "Added saved and visited spot lists",
      "Improved provenance and verification workflows",
      "Bug fixes and more",
    ],
  },
  {
    version: "1.0.9",
    date: "2026-02-03",
    hero: {
      icons: [
        { icon: "image" },
        { icon: "star" },
        { icon: "photo_camera" },
        { icon: "location_on" },
        { icon: "public" },
        { icon: "search" },
      ],
      centerpiece: { icon: "map" },
    },
    notes: [
      "Performance and image-loading improvements",
      "Added the hybrid satellite map with location labels",
      "Added splash screens and animated spot previews",
      "Fixed spot image editing side effects and mobile splash screens",
    ],
  },
  {
    version: "1.0.8",
    date: "2026-01-24",
    hero: {
      icons: [
        { icon: "map" },
        { icon: "phone_iphone" },
        { icon: "image" },
        { icon: "person" },
        { icon: "search" },
        { icon: "star" },
      ],
      centerpiece: { icon: "location_on" },
    },
    notes: [
      "Improved map performance and location UX",
      "Improved spot previews, highlights, and clusters",
      "Added Android early access setup",
      "Fixed Google sign-in on some devices with browser redirect fallback",
      "Fixed profile picture uploads, media ordering, and language startup issues",
    ],
  },
];

/** A new minor version (1.2 or 1.2.0) is major; otherwise web-only or a regular update. */
export function releaseTier(release: Release): ReleaseTier {
  if (release.tier) return release.tier;
  const [, , patch] = release.version.split(".");
  if (!patch || patch === "0") return "major";
  return release.platforms?.length === 1 && release.platforms[0] === "web" ? "web" : "update";
}

/** The banner icons a release's tier actually shows. */
export function visibleHeroIcons(release: Release): readonly ReleaseIcon[] {
  return release.hero.icons.slice(0, RELEASE_TIER_ICON_COUNT[releaseTier(release)]);
}

export function findRelease(version: string): Release | undefined {
  return RELEASES.find((release) => release.version === version);
}

/** "2026-11-15" → "15.11.2026", the date style the README has always used. */
function readmeDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${day}.${month}.${year}`;
}

function releaseHeading(release: Release): string {
  let heading = `### Version ${release.label ?? release.version} - ${readmeDate(release.date)}`;
  if (release.name) heading += ` "${release.name}"`;
  if (release.platforms) heading += ` (${release.platforms.join(", ")})`;
  return heading;
}

function noteLines(note: ReleaseNote): string[] {
  if (typeof note === "string") return [`- ${note}`];
  return [`- ${note.text}`, ...note.items.map((item) => `  - ${item}`)];
}

/** The README's release notes, newest first. */
export function renderReleaseNotesMarkdown(releases: readonly Release[] = RELEASES): string {
  return releases
    .map((release) => [releaseHeading(release), "", ...release.notes.flatMap(noteLines)].join("\n"))
    .join("\n\n");
}

export const README_RELEASES_START = "<!-- release-notes:start (generated by `npm run releases:readme`) -->";
export const README_RELEASES_END = "<!-- release-notes:end -->";

/** Replaces the generated block in the README text; throws when the markers are missing. */
export function replaceReadmeReleaseNotes(readme: string, releases: readonly Release[] = RELEASES): string {
  const start = readme.indexOf(README_RELEASES_START);
  const end = readme.indexOf(README_RELEASES_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("README.md is missing the release notes markers.");
  }
  const block = `${README_RELEASES_START}\n\n${renderReleaseNotesMarkdown(releases)}\n\n`;
  return readme.slice(0, start) + block + readme.slice(end);
}
