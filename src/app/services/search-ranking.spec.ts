import { describe, expect, it } from "vitest";
import {
  compareEventsByTiming,
  countQueryTokens,
  GOOD_PLACE_MATCH_STRENGTH,
  LAST_SECTION_STRENGTH,
  nameMatchBonus,
  orderSearchSections,
  readTextMatch,
  reorderWithinTiers,
  textMatchStrength,
  textMatchTier,
} from "./search-ranking";

describe("search ranking", () => {
  describe("readTextMatch", () => {
    it("reads the Typesense text_match_info of a hit", () => {
      expect(
        readTextMatch({
          text_match_info: {
            tokens_matched: 2,
            best_field_weight: 6,
            typo_prefix_score: 1,
          },
        }),
      ).toEqual({ tokensMatched: 2, bestFieldWeight: 6, typoPrefixScore: 1 });
    });

    it("returns undefined for hits without match info", () => {
      expect(readTextMatch({ document: {} })).toBeUndefined();
      expect(readTextMatch(null)).toBeUndefined();
    });
  });

  describe("countQueryTokens", () => {
    it("counts words and ignores punctuation-only tokens", () => {
      expect(countQueryTokens("menlo skate")).toBe(2);
      expect(countQueryTokens("  Lüttich ")).toBe(1);
      expect(countQueryTokens("skate - park")).toBe(2);
      expect(countQueryTokens("")).toBe(1);
    });
  });

  describe("nameMatchBonus", () => {
    it("scores exact, prefix and word matches on the name, ignoring accents", () => {
      expect(nameMatchBonus("Zürich", "Zurich")).toBe(10);
      expect(nameMatchBonus("menlo", "Menlo Skatepark")).toBe(8);
      expect(nameMatchBonus("skate menlo", "Menlo Skatepark")).toBe(6);
      expect(nameMatchBonus("menlo skate", "The Skatepark")).toBe(0);
      expect(nameMatchBonus("menlo", undefined)).toBe(0);
    });
  });

  describe("textMatchStrength", () => {
    const full = { tokensMatched: 2, bestFieldWeight: 15, typoPrefixScore: 0 };

    it("ranks a match on the name above the same match elsewhere", () => {
      expect(
        textMatchStrength(full, 2, "menlo skate", "Menlo Skatepark"),
      ).toBeGreaterThan(
        textMatchStrength(full, 2, "menlo skate", "The Skatepark"),
      );
    });

    it("ranks matching more query words above a better name", () => {
      const one = { ...full, tokensMatched: 1 };
      expect(
        textMatchStrength(full, 2, "menlo skate", "Other"),
      ).toBeGreaterThan(
        textMatchStrength(one, 2, "menlo skate", "Menlo Skatepark"),
      );
    });

    it("is zero without match info", () => {
      expect(textMatchStrength(undefined, 1, "zurich", "Zürich")).toBe(0);
    });
  });

  describe("orderSearchSections", () => {
    it("orders sections by their strongest match", () => {
      expect(
        orderSearchSections([
          { kind: "communities", strength: 40 },
          { kind: "events", strength: 60 },
          { kind: "spots", strength: 110 },
        ]),
      ).toEqual(["spots", "events", "communities"]);
    });

    it("keeps communities, Events, places, Spots for equal strength", () => {
      expect(
        orderSearchSections([
          { kind: "spots", strength: 100 },
          { kind: "places", strength: 100 },
          { kind: "events", strength: 100 },
          { kind: "communities", strength: 100 },
        ]),
      ).toEqual(["communities", "events", "places", "spots"]);
    });

    it("puts loading sections after loaded ones and a weak place last", () => {
      expect(
        orderSearchSections([
          { kind: "communities", strength: null },
          { kind: "places", strength: LAST_SECTION_STRENGTH },
          { kind: "spots", strength: 50 },
        ]),
      ).toEqual(["spots", "communities", "places"]);
    });

    it("places a good location match between a full name match and weaker hits", () => {
      expect(
        orderSearchSections([
          { kind: "events", strength: 70 },
          { kind: "places", strength: GOOD_PLACE_MATCH_STRENGTH },
          { kind: "spots", strength: 110 },
        ]),
      ).toEqual(["spots", "places", "events"]);
    });
  });

  describe("reorderWithinTiers", () => {
    const hit = (id: string, tier: string, rating: number) => ({
      id,
      tier,
      rating,
    });
    const byRating = (a: { rating: number }, b: { rating: number }) =>
      b.rating - a.rating;

    it("sorts by the secondary criterion only inside a tier", () => {
      const result = reorderWithinTiers(
        [
          hit("exact-low", "a", 1),
          hit("exact-high", "a", 5),
          hit("loose-top", "b", 5),
        ],
        (h) => h.tier,
        byRating,
      );
      expect(result.map((h) => h.id)).toEqual([
        "exact-high",
        "exact-low",
        "loose-top",
      ]);
    });

    it("handles empty input", () => {
      expect(
        reorderWithinTiers(
          [],
          () => "",
          () => 0,
        ),
      ).toEqual([]);
    });
  });

  describe("textMatchTier", () => {
    it("groups hits with the same match quality", () => {
      const a = { tokensMatched: 2, bestFieldWeight: 6, typoPrefixScore: 0 };
      expect(textMatchTier(a)).toBe(textMatchTier({ ...a }));
      expect(textMatchTier(a)).not.toBe(
        textMatchTier({ ...a, bestFieldWeight: 5 }),
      );
    });
  });

  describe("compareEventsByTiming", () => {
    const now = 1_000;
    it("lists upcoming Events soonest first, then past ones newest first", () => {
      const events = [
        { id: "past-old", startSeconds: 100, endSeconds: 200 },
        { id: "later", startSeconds: 5_000, endSeconds: 5_100 },
        { id: "past-new", startSeconds: 600, endSeconds: 700 },
        { id: "soon", startSeconds: 2_000, endSeconds: 2_100 },
      ];
      expect(
        [...events]
          .sort((a, b) => compareEventsByTiming(a, b, now))
          .map((e) => e.id),
      ).toEqual(["soon", "later", "past-new", "past-old"]);
    });

    it("treats a running Event as upcoming", () => {
      expect(
        compareEventsByTiming(
          { startSeconds: 900, endSeconds: 1_500 },
          { startSeconds: 100, endSeconds: 200 },
          now,
        ),
      ).toBeLessThan(0);
    });
  });
});
