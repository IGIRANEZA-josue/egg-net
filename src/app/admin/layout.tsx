"use client";
// Protects every /admin page.
//
// This check is for the user's comfort - the API checks the role on every
// request. It asks the SERVER who the user is, rather than trusting the
// profile cached in localStorage, which any script could rewrite.
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, saveUser, type User } from "@/lib/client/api";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    api<{ user: User }>("/api/auth/profile")
      .then((data) => {
        if (!active) return;
        if (data.user.role !== "admin") {
          router.replace("/");
          return;
        }
        saveUser(data.user);
        setAllowed(true);
      })
      .catch(() => {
        if (active) router.replace("/login?next=/admin");
      });
    return () => {
      active = false;
    };
  }, [router]);

  if (!allowed) return <div className="page container"><p className="muted">Checking access...</p></div>;
  return <div className="page container">{children}</div>;
}
