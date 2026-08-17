"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarRange,
  LayoutDashboard,
  FolderKanban,
  LogOut,
  PlusCircle,
  Settings,
} from "lucide-react";
import { cn, titleCase } from "@/lib/utils";

const nav = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/projects", label: "Projects", icon: FolderKanban },
  { href: "/app/projects/new", label: "New Project", icon: PlusCircle },
  { href: "/app/admin", label: "Admin", icon: Settings, minRole: "ADMIN" },
];

export interface SidebarUser {
  name: string;
  email: string;
  role: string;
  isAdmin: boolean;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  // Hiding Admin is presentation only; the page itself enforces the role.
  const items = nav.filter((item) => !item.minRole || user.isAdmin);
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-white">
      <Link href="/" className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
          <CalendarRange className="h-4 w-4" />
        </div>
        <span className="font-semibold tracking-tight">Buildora</span>
      </Link>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {items.map((item) => {
          const active =
            item.href === "/app/projects"
              ? pathname === "/app/projects"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-muted hover:text-slate-900"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
            {initials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              {user.name}
            </p>
            <p className="truncate text-xs text-slate-500">
              {titleCase(user.role)}
            </p>
          </div>
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              title={`Sign out ${user.email}`}
              aria-label="Sign out"
              className="rounded-lg p-2 text-slate-400 hover:bg-muted hover:text-slate-700"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
