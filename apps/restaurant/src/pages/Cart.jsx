import { useState } from "react";
import { analytics } from "../analytics.js";

const api = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export default function Cart({ cart, setCart }) {
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const total = cart.reduce((sum, i) => sum + i.priceCents * i.qty, 0);

  async function placeOrder() {
    if (!cart.length) return;
    analytics.track("checkout_started", {
      itemCount: cart.reduce((n, i) => n + i.qty, 0),
      totalCents: total,
    });
    setStatus("Placing order...");
    setIsError(false);
    try {
      const res = await fetch(`${api}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((i) => ({ id: i.id, qty: i.qty })),
          visitorId: analytics.getVisitorId(),
          sessionId: analytics.getSessionId(),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus(body.error || "Order failed");
        setIsError(true);
        analytics.track("checkout_failed", { reason: body.error || String(res.status) });
        return;
      }
      setCart([]);
      setStatus(`Order placed successfully — #${body.orderId.slice(0, 8).toUpperCase()}. Tracked: ${body.tracked ? "yes" : "no"}.`);
      analytics.track("checkout_completed", { orderId: body.orderId, totalCents: body.totalCents });
    } catch {
      setStatus("Network error placing order");
      setIsError(true);
      analytics.track("checkout_failed", { reason: "network" });
    }
  }

  if (!cart.length && !status) {
    return (
      <section>
        <h1>Your Order</h1>
        <div className="cart-empty">
          <p>Your cart is empty.</p>
          <p className="muted">Head to the menu and add something you like.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h1>Your Order</h1>
      {cart.map((item) => (
        <div className="cart-line" key={item.id}>
          <div>
            <strong>{item.name}</strong>
            <div className="muted">qty {item.qty}</div>
          </div>
          <span className="price">${((item.priceCents * item.qty) / 100).toFixed(2)}</span>
        </div>
      ))}
      {cart.length > 0 && (
        <>
          <div className="cart-total">Total &nbsp; ${(total / 100).toFixed(2)}</div>
          <button onClick={placeOrder}>Place Order</button>
        </>
      )}
      {status && (
        <div className={isError ? "error-msg" : "notice"} style={{ marginTop: 20 }}>
          {status}
        </div>
      )}
    </section>
  );
}
