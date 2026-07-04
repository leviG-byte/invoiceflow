"use client";

import Sidebar from "@/components/Sidebar";
import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Cached across client-side navigations (persists until a full reload) so we
// only ever hit the database once to confirm a user has finished onboarding.
let profileConfirmed = false;

export function markProfileComplete() {
  profileConfirmed = true;
}

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const isFullScreenPage =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/onboarding";

  // We only need to run the async onboarding gate when we're on a shell page
  // and haven't already confirmed the profile this session.
  const mustCheck = !isFullScreenPage && !profileConfirmed;

  const [asyncDone, setAsyncDone] = useState(false);

  useEffect(() => {
    if (!mustCheck) return;

    let active = true;

    (async () => {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      // No session: middleware already redirects to /login.
      if (!user) {
        if (active) setAsyncDone(true);
        return;
      }

      const { data } = await supabase
        .from("business_profile")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!active) return;

      if (data) {
        profileConfirmed = true;
        setAsyncDone(true);
      } else {
        // First-time user with no business profile: send them to setup.
        router.replace("/onboarding");
      }
    })();

    return () => {
      active = false;
    };
  }, [mustCheck, pathname, router]);

  if (isFullScreenPage) {
    return <>{children}</>;
  }

  const gateChecked = !mustCheck || asyncDone;

  if (!gateChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
      </div>
    );
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
