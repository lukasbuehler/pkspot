import { Release, ReleaseHero, ReleaseNote, ReleasePlatform, ReleaseTier, releaseTier, visibleHeroIcons } from "./release-notes";
import { ReleaseHighlight, releaseHighlights } from "./release-highlights";

/** What the release pages render for one release, prepared once. */
export interface ReleaseView {
  release: Release;
  tier: ReleaseTier;
  /** The banner with only the icons its tier shows. */
  hero: ReleaseHero;
  /** "1.2" or "1.1.0 and 1.1.1". */
  label: string;
  /** Translated "Only on Web" line; null when the release reached every platform. */
  platformsText: string | null;
  highlights: readonly ReleaseHighlight[];
  notes: readonly ReleaseNoteView[];
}

/** A bullet with its nested bullets (empty for most notes). */
export interface ReleaseNoteView {
  text: string;
  items: readonly string[];
}

const PLATFORM_NAMES: Record<ReleasePlatform, string> = {
  web: "Web",
  ios: "iOS",
  android: "Android",
};

export function releaseView(release: Release): ReleaseView {
  const platforms = release.platforms?.map((platform) => PLATFORM_NAMES[platform]).join(", ");
  return {
    release,
    tier: releaseTier(release),
    hero: { icons: visibleHeroIcons(release), centerpiece: release.hero.centerpiece },
    label: release.label ?? release.version,
    platformsText: platforms ? $localize`:@@releases.platformsOnly:Only on ${platforms}:platforms:` : null,
    highlights: releaseHighlights(release.version),
    notes: release.notes.map(noteView),
  };
}

function noteView(note: ReleaseNote): ReleaseNoteView {
  return typeof note === "string" ? { text: note, items: [] } : note;
}
