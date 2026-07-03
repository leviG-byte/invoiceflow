"use client";

import Sidebar from "@/components/Sidebar";
import { Menu } from "lucide-react";
import { useState } from "react";
import { usePathname } from "next/navigation";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const isAuthPage = pathname === "/" || pathname === "/login";

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-4 py-3 sm:px-6">
            <button
              onClick={() => setMobileOpen(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>

            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                Workspace
              </p>
              <p className="text-base font-bold text-slate-900">InvoiceFlow</p>
            </div>
          </div>
        </div>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
          <div className="w-full space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}