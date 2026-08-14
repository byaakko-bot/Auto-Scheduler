"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarRange,
  LayoutDashboard,
  FolderKanban,
  PlusCircle,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/projects", label: "Projects", icon: FolderKanban },
  { href: "/app/projects/new", label: "New Project", icon: PlusCircle },
  { href: "/app/admin", label: "Admin", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-white">
      <Link href="/" className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
          <CalendarRange className="h-4 w-4" />
        </div>
        <span className="font-semibold tracking-tight">Buildora</span>
      </Link>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {nav.map((item) => {
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
            DG
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              Demo User
            </p>
            <p className="truncate text-xs text-slate-500">Project Manager</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
