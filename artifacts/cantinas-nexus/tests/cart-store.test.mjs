import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { CartStore } from '../src/lib/cart-store.ts';

beforeEach(() => {
  const data = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  } });
});

test('restores only the selected establishment even with overlapping product IDs', () => {
  localStorage.setItem('cantinas-nexus:cart', JSON.stringify([{ productId: 'legacy', qty: 1 }]));
  const first = new CartStore('a');
  assert.deepEqual(first.getSnapshot(), []);
  first.add('shared', 'Café', 5);
  const second = new CartStore('b');
  assert.deepEqual(second.getSnapshot(), []);
  second.add('shared', 'Suco', 9);
  second.clear();
  assert.equal(new CartStore('a').getSnapshot()[0].name, 'Café');
  assert.deepEqual(new CartStore(null).getSnapshot(), []);
});

test('each quantity change publishes a fresh snapshot without mutating older items', () => {
  const cart = new CartStore('a');
  cart.add('1', 'Suco', 4);
  const original = cart.getSnapshot();
  cart.add('1', 'Suco', 4);
  const doubled = cart.getSnapshot();
  cart.decrement(original[0].key);
  assert.equal(original[0].qty, 1);
  assert.equal(doubled[0].qty, 2);
  assert.equal(cart.getSnapshot()[0].qty, 1);
  cart.decrement(original[0].key);
  assert.deepEqual(cart.getSnapshot(), []);
});
