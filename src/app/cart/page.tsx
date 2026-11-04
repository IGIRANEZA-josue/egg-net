"use client";
// CART PAGE: items, subtotal, delivery, discount (preview), total
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CartItemRow from "@/components/CartItemRow";
import { api, rwf } from "@/lib/client/api";
import { useUser, useCartItems } from "@/lib/client/hooks";
import { cartSubtotal, previewDiscount } from "@/lib/client/cart";

type Promotion = { name: string; type: string; value: number } | null;

export default function CartPage() {
  const router = useRouter();
  const user = useUser();
  const items = useCartItems();
  const [promotion, setPromotion] = useState<Promotion>(null);
  const [deliveryFee, setDeliveryFee] = useState(1000);

  useEffect(() => {
    if (user === null) router.replace("/login?next=/cart");
  }, [user, router]);

  useEffect(() => {
    let cancelled = false;
    api<{ promotion: Promotion; deliveryFee: number }>("/api/promotions/active")
      .then((d) => { if (!cancelled) { setPromotion(d.promotion); setDeliveryFee(d.deliveryFee); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const subtotal = cartSubtotal(items);
  const discount = previewDiscount(subtotal, promotion);
  const total = subtotal + (items.length ? deliveryFee : 0) - discount;

  return (
    <div className="page container">
      <h1 className="page-title">Your Cart</h1>
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
