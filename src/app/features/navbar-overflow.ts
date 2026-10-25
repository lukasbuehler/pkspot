export interface OverflowNavigationItem {
  id: string;
  overflowPriority: number;
  alwaysVisible?: boolean;
  spacerBefore?: boolean;
}

export interface NavigationOverflow<T> {
  visible: readonly T[];
  overflow: readonly T[];
}

export type DesktopLeadingSlotCount<T> =
  | number
  | null
  | ((navigation: NavigationOverflow<T>) => number);

/**
 * Chooses the largest source-item capacity that fits the measured leading
 * desktop rail. The More button consumes one leading slot only when needed.
 */
export function desktopNavigationSlotCount<T extends OverflowNavigationItem>(
  items: readonly T[],
  leadingSlotCount: DesktopLeadingSlotCount<T>,
): number {
  if (leadingSlotCount === null) return items.length;

  const minimumSlotCount = Math.min(items.length, 2);
  for (let slotCount = items.length; slotCount >= minimumSlotCount; slotCount--) {
    const navigation = splitNavigationOverflow(items, slotCount);
    const availableLeadingSlots =
      typeof leadingSlotCount === "function"
        ? leadingSlotCount(navigation)
        : leadingSlotCount;
    const requiredLeadingSlots =
      navigation.visible.filter(
        (item) => !item.alwaysVisible && !item.spacerBefore,
      ).length + (navigation.overflow.length ? 1 : 0);

    if (requiredLeadingSlots <= availableLeadingSlots) return slotCount;
  }

  return minimumSlotCount;
}

/**
 * Reserves one navigation slot for the More menu when items do not all fit.
 * Pinned items stay visible, while priority decides which other items remain.
 * `maxVisibleNonPinnedItems` can intentionally move lower-priority destinations
 * into More before the bar runs out of physical slots. Source order is retained.
 */
export function splitNavigationOverflow<T extends OverflowNavigationItem>(
  items: readonly T[],
  slotCount: number,
  maxVisibleNonPinnedItems = Number.POSITIVE_INFINITY,
): NavigationOverflow<T> {
  const nonPinnedItems = items.filter((item) => !item.alwaysVisible);
  const shouldShowMore =
    items.length > slotCount ||
    nonPinnedItems.length > maxVisibleNonPinnedItems;

  if (!shouldShowMore) {
    return { visible: items, overflow: [] };
  }

  const alwaysVisibleIds = new Set(
    items.filter((item) => item.alwaysVisible).map((item) => item.id),
  );
  const visibleItemCount = Math.max(
    0,
    slotCount - 1 - alwaysVisibleIds.size,
  );
  const visibleIds = new Set(
    nonPinnedItems
      .sort((left, right) => left.overflowPriority - right.overflowPriority)
      .slice(0, Math.min(visibleItemCount, maxVisibleNonPinnedItems))
      .map((item) => item.id),
  );

  return {
    visible: items.filter(
      (item) => alwaysVisibleIds.has(item.id) || visibleIds.has(item.id),
    ),
    overflow: items.filter(
      (item) => !alwaysVisibleIds.has(item.id) && !visibleIds.has(item.id),
    ),
  };
}
