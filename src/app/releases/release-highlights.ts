import { ReleaseIconTone } from "./release-notes";

/** A translated headline feature of a release, shown with a tonal icon tile. */
export interface ReleaseHighlight {
  icon: string;
  tone?: ReleaseIconTone;
  title: string;
  body: string;
}

/**
 * Translated highlights per release version. The full notes in
 * `release-notes.ts` stay English; only these short headlines go through
 * XLIFF. A release without an entry shows only its notes.
 *
 * The 1.2 IDs are the ones the what's-new dialog has always used, so their
 * translations carry over.
 */
export const RELEASE_HIGHLIGHTS: Readonly<Record<string, readonly ReleaseHighlight[]>> = {
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
};

export function releaseHighlights(version: string): readonly ReleaseHighlight[] {
  return RELEASE_HIGHLIGHTS[version] ?? [];
}
