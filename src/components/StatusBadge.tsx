// Colored label for order / payment status
import { statusLabel } from "@/lib/client/api";

export default function StatusBadge({ status }: { status: string }) {
  const color: Record<string, string> = {
    pending: "badge-yellow",
    confirmed: "badge-blue",
    preparing: "badge-blue",
    out_for_delivery: "badge-blue",
    delivered: "",
    paid: "",
    cancelled: "badge-red",
    failed: "badge-red",
  };
  return <span className={`badge ${color[status] || "badge-gray"}`}>{statusLabel(status)}</span>;
}
