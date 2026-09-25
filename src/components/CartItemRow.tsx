"use client";
// One row in the cart (like CartItem.vue)
import { rwf } from "@/lib/client/api";
import { type CartItem, updateQuantity, removeFromCart } from "@/lib/client/cart";
import EggMark from "@/components/EggMark";

export default function CartItemRow({ item }: { item: CartItem }) {
  return (
    <div className="cart-item">
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt={item.name} />
      ) : (
        <div className="product-image-placeholder" style={{ color: "var(--ink)" }}><EggMark size={34} /></div>
      )}
      <div>
        <strong>{item.name}</strong>
        <div className="muted" style={{ fontSize: "0.9rem" }}>{rwf(item.price)} × {item.quantity}</div>
        <div className="qty" style={{ marginTop: 6 }}>
          <button onClick={() => updateQuantity(item.productId, item.quantity - 1)}>−</button>
          <span>{item.quantity}</span>
          <button onClick={() => updateQuantity(item.productId, item.quantity + 1)} disabled={item.quantity >= item.stock}>+</button>
        </div>
        {item.quantity >= item.stock && <small className="stock-low">Maximum stock reached</small>}
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="price">{rwf(item.price * item.quantity)}</div>
        <button className="btn btn-danger btn-sm" style={{ marginTop: 6 }} onClick={() => removeFromCart(item.productId)}>Remove</button>
      </div>
    </div>
  );
}
