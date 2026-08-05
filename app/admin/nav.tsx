"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx, IconDoc, IconGrid, IconTag } from "@/app/components/ui";

const ITEMS = [
  { href: "/admin", label: "概览", icon: IconGrid, exact: true },
  { href: "/admin/posts", label: "文章", icon: IconDoc },
  { href: "/admin/categories", label: "分类", icon: IconTag },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
              active
                ? "bg-accent-soft font-medium text-accent-text"
                : "text-muted hover:bg-panel-muted hover:text-ink",
            )}
          >
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
