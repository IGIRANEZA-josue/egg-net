"use client";
// CART PAGE: items, subtotal, delivery, discount (preview), total
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CartItemRow from "@/components/CartItemRow";
import { api, rwf, getSavedUser } from "@/lib/client/api";
import { getCart, setCart, cartSubtotal, previewDiscount, type CartItem } from "@/lib/client/cart";

type Promotion = { name: string; type: string; value: number } | null;

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [promotion, setPromotion] = useState<Promotion>(null);
  const [deliveryFee, setDeliveryFee] = useState(1000);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!getSavedUser()) { router.push("/login"); return; }
    const refresh = () => setItems(getCart());
    refresh();
    window.addEventListener("egghub-cart", refresh);

    api<{ promotion: Promotion; deliveryFee: number }>("/api/promotions/active")
      .then((d) => { setPromotion(d.promotion); setDeliveryFee(d.deliveryFee); })
      .catch(() => {});

    // Re-check the cart against the live catalogue. Prices and stock cached in
    // localStorage go stale as soon as an admin edits a product, and the totals
    // shown here would silently disagree with checkout.
    api<{ products: { id: number; name: string; price: number; discount: number; stock: number; isAvailable: boolean; image: string }[] }>(
      "/api/products?pageSize=200"
    )
      .then((d) => {
        const byId = new Map(d.products.map((p) => [p.id, p]));
        const current = getCart();
        const next: CartItem[] = [];
        let changed = false;

        for (const item of current) {
          const live = byId.get(item.productId);
          if (!live || !live.isAvailable || live.stock <= 0) {
            changed = true;
            continue; // no longer sold - drop it
          }
          const price = live.discount ? Math.round(live.price - (live.price * live.discount) / 100) : live.price;
          const quantity = Math.min(item.quantity, live.stock);
          if (price !== item.price || quantity !== item.quantity || live.stock !== item.stock) changed = true;
          next.push({ ...item, name: live.name, price, stock: live.stock, quantity, image: live.image || item.image });
        }

        if (changed) {
          setCart(next);
          setNotice("Some items changed since you added them (price or stock). Your cart has been updated.");
        }
      })
      .catch(() => {
        // Offline or the request failed: keep the cached cart rather than empty it.
      });

    return () => window.removeEventListener("egghub-cart", refresh);
  }, [router]);

  const subtotal = cartSubtotal(items);
  const discount = previewDiscount(subtotal, promotion);
  const total = subtotal + (items.length ? deliveryFee : 0) - discount;

  return (
    <div className="page container">
      <h1 className="page-title">Your Cart</h1>
      {notice && <div className="alert alert-warning" role="status">{notice}</div>}
      {items.length === 0 ? (
        <div className="card text-center">
          <p>Your cart is empty.</p>
          <Link href="/products" className="btn btn-primary">Browse Products</Link>
        </div>
      ) : (
        <div className="layout-2">
          <div className="card">
            {items.map((item) => <CartItemRow key={item.productId} item={item} />)}
          </div>
          <div className="card">
            <h3>Summary</h3>
            <div className="summary-row"><span>Subtotal</span><span>{rwf(subtotal)}</span></div>
            <div className="summary-row"><span>Delivery</span><span>{rwf(deliveryFee)}</span></div>
            <div className="summary-row"><span>Discount {promotion && <small className="badge">{promotion.name}</small>}</span><span>- {rwf(discount)}</span></div>
            <div className="summary-row summary-total"><span>TOTAL</span><span>{rwf(total)}</span></div>
            <Link href="/checkout" className="btn btn-primary btn-block" style={{ marginTop: "1rem" }}>Proceed to Checkout</Link>
          </div>
        </div>
      )}
    </div>
  );
}
