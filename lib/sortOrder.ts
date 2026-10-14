// Helpers for user-defined ordering of settings lists (API configs, assistant presets).
// Items without an explicit sortOrder (created before ordering existed) fall back to
// creation time and are placed after explicitly ordered items.

export interface SortableItem {
  id: string;
  createdAt: number;
  sortOrder?: number;
}

const hasSortOrder = (item: SortableItem): boolean => (
  typeof item.sortOrder === 'number' && Number.isFinite(item.sortOrder)
);

export function sortByOrder<T extends SortableItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aOrdered = hasSortOrder(a);
    const bOrdered = hasSortOrder(b);

    if (aOrdered && bOrdered && a.sortOrder !== b.sortOrder) {
      return (a.sortOrder as number) - (b.sortOrder as number);
    }
    if (aOrdered !== bOrdered) {
      return aOrdered ? -1 : 1;
    }
    if (a.createdAt !== b.createdAt) {
      return a.createdAt - b.createdAt;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// Returns the sortOrder a newly created item should get so it appears last.
// Returns undefined when no item is explicitly ordered yet, so the new item
// sorts last by createdAt alongside the other unordered items.
export function getNextSortOrder(items: SortableItem[]): number | undefined {
  const orders = items.filter(hasSortOrder).map((item) => item.sortOrder as number);
  if (orders.length === 0) return undefined;
  return Math.max(...orders) + 1;
}

// Rewrites sortOrder as 0..n-1 following the array order.
export function applySequentialOrder<T extends SortableItem>(items: T[]): T[] {
  return items.map((item, index) => ({ ...item, sortOrder: index }));
}

// Moves the item `activeId` to the position currently occupied by `overId`
// (drag-and-drop semantics) and returns the re-numbered list, or null when
// nothing changes.
export function reorderItems<T extends SortableItem>(
  items: T[],
  activeId: string,
  overId: string
): T[] | null {
  if (activeId === overId) return null;

  const sorted = sortByOrder(items);
  const fromIndex = sorted.findIndex((item) => item.id === activeId);
  const toIndex = sorted.findIndex((item) => item.id === overId);
  if (fromIndex < 0 || toIndex < 0) return null;

  const next = [...sorted];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return applySequentialOrder(next);
}
