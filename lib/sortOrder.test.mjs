import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applySequentialOrder,
  getNextSortOrder,
  reorderItems,
  sortByOrder,
} from './sortOrder.ts';

const ids = (items) => items.map((item) => item.id);

test('sortByOrder puts ordered items first, then unordered items by createdAt', () => {
  const sorted = sortByOrder([
    { id: 'legacy-new', createdAt: 30 },
    { id: 'second', createdAt: 10, sortOrder: 1 },
    { id: 'legacy-old', createdAt: 20 },
    { id: 'first', createdAt: 40, sortOrder: 0 },
  ]);

  assert.deepEqual(ids(sorted), ['first', 'second', 'legacy-old', 'legacy-new']);
});

test('sortByOrder does not mutate the input array', () => {
  const input = [
    { id: 'b', createdAt: 2 },
    { id: 'a', createdAt: 1 },
  ];
  sortByOrder(input);
  assert.deepEqual(ids(input), ['b', 'a']);
});

test('getNextSortOrder returns undefined until any item is explicitly ordered', () => {
  assert.equal(getNextSortOrder([]), undefined);
  assert.equal(getNextSortOrder([{ id: 'a', createdAt: 1 }]), undefined);
  assert.equal(getNextSortOrder([
    { id: 'a', createdAt: 1, sortOrder: 0 },
    { id: 'b', createdAt: 2, sortOrder: 4 },
  ]), 5);
});

test('reorderItems moves an item to the drop target position and renumbers', () => {
  const items = [
    { id: 'a', createdAt: 1 },
    { id: 'b', createdAt: 2 },
    { id: 'c', createdAt: 3 },
    { id: 'd', createdAt: 4 },
  ];

  const draggedDown = reorderItems(items, 'a', 'c');
  assert.deepEqual(ids(draggedDown), ['b', 'c', 'a', 'd']);
  assert.deepEqual(draggedDown.map((item) => item.sortOrder), [0, 1, 2, 3]);

  const draggedUp = reorderItems(draggedDown, 'd', 'b');
  assert.deepEqual(ids(draggedUp), ['d', 'b', 'c', 'a']);
});

test('reorderItems returns null for no-op drops or unknown ids', () => {
  const items = applySequentialOrder([
    { id: 'a', createdAt: 1 },
    { id: 'b', createdAt: 2 },
  ]);

  assert.equal(reorderItems(items, 'a', 'a'), null);
  assert.equal(reorderItems(items, 'missing', 'a'), null);
  assert.equal(reorderItems(items, 'a', 'missing'), null);
});
