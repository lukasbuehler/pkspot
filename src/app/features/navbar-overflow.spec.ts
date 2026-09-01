import { describe, expect, it } from "vitest";
import { splitNavigationOverflow } from "./navbar-overflow";

const items = [
  { id: "map", overflowPriority: 0 },
  { id: "train", overflowPriority: 4 },
  { id: "events", overflowPriority: 1 },
  { id: "shop", overflowPriority: 2 },
  { id: "account", overflowPriority: 3 },
];

describe("splitNavigationOverflow", () => {
  it("reserves one slot for More and retains source order", () => {
    const result = splitNavigationOverflow(items, 4);

    expect(result.visible.map((item) => item.id)).toEqual([
      "map",
      "events",
      "shop",
    ]);
    expect(result.overflow.map((item) => item.id)).toEqual(["train", "account"]);
  });

  it("does not create overflow when every item fits", () => {
    const result = splitNavigationOverflow(items, 5);

    expect(result.visible).toEqual(items);
    expect(result.overflow).toEqual([]);
  });

  it("keeps pinned items visible and last in their source position", () => {
    const result = splitNavigationOverflow(
      [
        { id: "map", overflowPriority: 0 },
        { id: "train", overflowPriority: 1 },
        { id: "events", overflowPriority: 2 },
        { id: "shop", overflowPriority: 3 },
        { id: "account", overflowPriority: 4, alwaysVisible: true },
      ],
      4,
    );

    expect(result.visible.map((item) => item.id)).toEqual([
      "map",
      "train",
      "account",
    ]);
    expect(result.overflow.map((item) => item.id)).toEqual([
      "events",
      "shop",
    ]);
  });

  it("moves lower-priority destinations into More before physical slots run out", () => {
    const result = splitNavigationOverflow(
      [
        { id: "map", overflowPriority: 0 },
        { id: "train", overflowPriority: 1 },
        { id: "events", overflowPriority: 2 },
        { id: "shop", overflowPriority: 3 },
        { id: "account", overflowPriority: 4, alwaysVisible: true },
      ],
      5,
      3,
    );

    expect(result.visible.map((item) => item.id)).toEqual([
      "map",
      "train",
      "events",
      "account",
    ]);
    expect(result.overflow.map((item) => item.id)).toEqual(["shop"]);
  });

  it("keeps About available in More after the core compact destinations", () => {
    const result = splitNavigationOverflow(
      [
        { id: "map", overflowPriority: 0 },
        { id: "train", overflowPriority: 1 },
        { id: "events", overflowPriority: 2 },
        { id: "shop", overflowPriority: 3 },
        { id: "about", overflowPriority: 4 },
        { id: "account", overflowPriority: 5, alwaysVisible: true },
      ],
      5,
      3,
    );

    expect(result.visible.map((item) => item.id)).toEqual([
      "map",
      "train",
      "events",
      "account",
    ]);
    expect(result.overflow.map((item) => item.id)).toEqual([
      "shop",
      "about",
    ]);
  });
});
