// The admin sign-in page sits under /admin, but it must NOT be wrapped by the
// admin guard (the guard would redirect away from the very page that grants
// access). A route layout replaces the parent one, so this renders bare.
export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
