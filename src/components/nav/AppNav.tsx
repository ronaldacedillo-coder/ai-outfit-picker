import Link from "next/link";
import { signOut } from "@/app/login/actions";
import type { UserRole } from "@/lib/auth/requireRole";

function linksFor(role: UserRole): Array<{ href: string; label: string }> {
  if (role === "ADMIN") {
    return [
      { href: "/dashboard", label: "Catalog" },
      { href: "/admin/matching-overrides", label: "Matching Rules" },
      { href: "/dashboard/looks", label: "My Looks" },
    ];
  }
  return [
    { href: "/catalog", label: "Browse Catalog" },
    { href: "/dashboard/looks", label: "My Looks" },
  ];
}

export function AppNav({ role, activePath }: { role: UserRole; activePath: string }) {
  const links = linksFor(role);

  return (
    <div className="flex flex-wrap items-center gap-5">
      <nav className="flex flex-wrap gap-5 text-sm font-medium">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={
              activePath === link.href
                ? "text-ink underline decoration-accent decoration-2 underline-offset-4"
                : "text-ink-secondary transition-colors duration-150 ease-out hover:text-ink"
            }
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-ink transition-transform duration-100 ease-out hover:bg-surface-muted active:scale-[0.97]"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
