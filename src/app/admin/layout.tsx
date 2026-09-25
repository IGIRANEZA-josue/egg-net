"use client";
// Protects every /admin page: only logged-in admins can see them.
// (The API also checks the role, so this is just for a nicer user experience.)
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSavedUser } from "@/lib/client/api";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const user = getSavedUser();
    if (!user) router.replace("/login");
    else if (user.role !== "admin") router.replace("/");
    else setAllowed(true);
  }, [router]);

  if (!allowed) return <div className="page container"><p className="muted">Checking access...</p></div>;
  return <div className="page container">{children}</div>;
}
