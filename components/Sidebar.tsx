"use client";

import LogoutButton from "@/components/LogoutButton";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Users,
  Settings,
  X,
} from "lucide-react";

type SidebarProps = {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
};

export default function Sidebar({
  mobileOpen = false,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();

  const links = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Invoices", href: "/invoices", icon: FileText },
    { name: "Clients", href: "/clients", icon: Users },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm transition-all duration-300 lg:hidden ${
          mobileOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={onCloseMobile}
      />

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-72 shrink-0 flex-col border-r border-slate-800 bg-gradient-to-b from-slate-950 via-slate-900 to-blue-950 text-white transition-transform duration-300 ease-out lg:sticky lg:top-0 lg:z-30 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="border-b border-white/10 px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10 backdrop-blur">
                <span className="text-lg font-bold text-white">IF</span>
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                  Workspace
                </p>
                <h1 className="truncate text-2xl font-bold tracking-tight text-white">
                  InvoiceFlow
                </h1>
              </div>
            </div>

            <button
              onClick={onCloseMobile}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white lg:hidden"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col px-4 py-5">
          <div className="mb-4 px-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Navigation
            </p>
          </div>

          <nav className="flex flex-col gap-2">
            {links.map((link) => {
              const isActive =
                pathname === link.href || pathname.startsWith(`${link.href}/`);
              const Icon = link.icon;

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onCloseMobile}
                  className={`group flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-300 hover:bg-white/8 hover:text-white hover:translate-x-1"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      size={18}
                      className={`transition ${
                        isActive
                          ? "text-slate-900"
                          : "text-slate-400 group-hover:text-white"
                      }`}
                    />
                    <span>{link.name}</span>
                  </div>

                  <span
                    className={`h-2.5 w-2.5 rounded-full transition ${
                      isActive
                        ? "bg-emerald-500"
                        : "bg-transparent group-hover:bg-white/20"
                    }`}
                  />
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur transition duration-200 hover:bg-white/[0.07]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              InvoiceFlow
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Clean invoicing, client management, and payment tracking in one place.
            </p>
          </div>

          <div className="mt-auto pt-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur">
              <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Account
              </p>
              <LogoutButton />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}