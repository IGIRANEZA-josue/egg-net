// Order status tracker (status-based only, no GPS)
const STEPS = [
  { key: "pending", label: "Order Placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "preparing", label: "Preparing" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
];

export default function OrderTracker({ status }: { status: string }) {
  if (status === "cancelled") {
    return <div className="alert alert-error">This order was cancelled.</div>;
  }
  const currentIndex = STEPS.findIndex((s) => s.key === status);

  return (
    <div className="tracker">
      {STEPS.map((step, index) => {
        const done = index <= currentIndex;
        return (
          <div key={step.key} className={`tracker-step ${done ? "done" : ""} ${index === currentIndex ? "current" : ""}`}>
            <div className="dot">{done ? "✓" : ""}</div>
            <span>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}
