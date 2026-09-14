/**
 * Carrinho local — persiste em localStorage (client-only).
 * O carrinho é uma sessão local do aluno no totem; não precisa ser sincronizado.
 */
import { useSyncExternalStore } from 'react';

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

const CART_KEY = 'cantinas-nexus:cart';

class CartStore {
  private items: CartItem[] = this.load();
  private listeners = new Set<() => void>();

  private load(): CartItem[] {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private persist() {
    localStorage.setItem(CART_KEY, JSON.stringify(this.items));
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): CartItem[] => this.items;

  add(productId: string, name: string, price: number) {
    const existing = this.items.find((i) => i.productId === productId);
    if (existing) {
      existing.qty += 1;
    } else {
      this.items = [...this.items, { productId, name, price, qty: 1 }];
    }
    this.persist();
    this.notify();
  }

  decrement(productId: string) {
    const existing = this.items.find((i) => i.productId === productId);
    if (!existing) return;
    existing.qty -= 1;
    if (existing.qty <= 0) {
      this.items = this.items.filter((i) => i.productId !== productId);
    }
    this.persist();
    this.notify();
  }

  remove(productId: string) {
    this.items = this.items.filter((i) => i.productId !== productId);
    this.persist();
    this.notify();
  }

  clear() {
    this.items = [];
    this.persist();
    this.notify();
  }
}

export const cartStore = new CartStore();

export function useCart(): CartItem[] {
  return useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot, cartStore.getSnapshot);
}
