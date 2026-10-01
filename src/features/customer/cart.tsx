import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Item } from "@/lib/database.types";

export interface CartLine {
  item: Item;
  quantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  qtyOf: (itemId: string) => number;
  add: (item: Item) => void;
  setQty: (itemId: string, qty: number) => void;
  remove: (itemId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ taxPercent, children }: { taxPercent: number; children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  const value = useMemo<CartContextValue>(() => {
    const subtotal = lines.reduce((s, l) => s + Number(l.item.price) * l.quantity, 0);
    const taxAmount = +(subtotal * (taxPercent / 100)).toFixed(2);
    const total = +(subtotal + taxAmount).toFixed(2);
    const count = lines.reduce((s, l) => s + l.quantity, 0);

    return {
      lines,
      count,
      subtotal,
      taxAmount,
      total,
      qtyOf: (itemId) => lines.find((l) => l.item.id === itemId)?.quantity ?? 0,
      add: (item) =>
        setLines((prev) => {
          const idx = prev.findIndex((l) => l.item.id === item.id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
            return copy;
          }
          return [...prev, { item, quantity: 1 }];
        }),
      setQty: (itemId, qty) =>
        setLines((prev) => {
          if (qty <= 0) return prev.filter((l) => l.item.id !== itemId);
          return prev.map((l) => (l.item.id === itemId ? { ...l, quantity: qty } : l));
        }),
      remove: (itemId) => setLines((prev) => prev.filter((l) => l.item.id !== itemId)),
      clear: () => setLines([]),
    };
  }, [lines, taxPercent]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
