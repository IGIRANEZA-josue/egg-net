"use client";
// Protects every /admin page: only logged-in admins can see them.
// (The API also checks the role on every request, so this is just for UX.)
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/client/hooks";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const user = useUser(); // undefined = hydrating, null = logged out

  useEffect(() => {
    if (user === null) router.replace("/login?next=/admin");
    else if (user && user.role !== "admin") router.replace("/");
  }, [user, router]);

  if (!user || user.role !== "admin") {
    return <div className="page container"><p className="muted">Checking access...</p></div>;
  }
  return <div className="page container">{children}</div>;
}
