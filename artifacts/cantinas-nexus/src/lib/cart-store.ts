/**
 * Carrinho local — persiste em localStorage (client-only).
 * Configurações diferentes do mesmo produto são linhas independentes.
 */
import { useSyncExternalStore } from 'react';

export interface CartItem {
  key: string;
  productId: string;
  name: string;
  price: number;
  qty: number;
  variantId: string | null;
  modifierIds: string[];
  customizationLabel: string;
}

type CartConfiguration = {
  variantId?: string | null;
  modifierIds?: string[];
  customizationLabel?: string;
};

const CART_KEY = 'cantinas-nexus:cart';

function configurationKey(productId: string, variantId: string | null, modifierIds: string[]) {
  return `${productId}::${variantId ?? ''}::${[...modifierIds].sort().join(',')}`;
}

class CartStore {
  private items: CartItem[] = this.load();
  private listeners = new Set<() => void>();

  private load(): CartItem[] {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item: Partial<CartItem>) => {
        const variantId = item.variantId ?? null;
        const modifierIds = Array.isArray(item.modifierIds) ? item.modifierIds : [];
        return {
          ...item,
          key: item.key ?? configurationKey(String(item.productId), variantId, modifierIds),
          variantId,
          modifierIds,
          customizationLabel: item.customizationLabel ?? '',
        } as CartItem;
      });
    } catch {
      return [];
    }
  }

  private persist() {
    localStorage.setItem(CART_KEY, JSON.stringify(this.items));
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): CartItem[] => this.items;

  add(productId: string, name: string, price: number, configuration: CartConfiguration = {}) {
    const variantId = configuration.variantId ?? null;
    const modifierIds = [...(configuration.modifierIds ?? [])].sort();
    const key = configurationKey(productId, variantId, modifierIds);
    const existing = this.items.find((item) => item.key === key);
    if (existing) {
      existing.qty += 1;
    } else {
      this.items = [...this.items, {
        key, productId, name, price, qty: 1, variantId, modifierIds,
        customizationLabel: configuration.customizationLabel ?? '',
      }];
    }
    this.persist();
    this.notify();
  }

  decrement(key: string) {
    const existing = this.items.find((item) => item.key === key);
    if (!existing) return;
    existing.qty -= 1;
    if (existing.qty <= 0) this.items = this.items.filter((item) => item.key !== key);
    this.persist();
    this.notify();
  }

  remove(key: string) {
    this.items = this.items.filter((item) => item.key !== key);
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
