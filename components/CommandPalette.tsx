"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Search,
  FileText,
  Users,
  LayoutDashboard,
  Settings,
  BarChart3,
  Plus,
} from "lucide-react";

type Item = {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  icon: React.ReactNode;
  keywords: string;
};

const NAV_ITEMS: Item[] = [
  {
    id: "nav-dashboard",
    label: "Dashboard",
    href: "/dashboard",
    icon: <LayoutDashboard size={16} />,
    keywords: "dashboard home overview",
  },
  {
    id: "nav-invoices",
    label: "Invoices",
    href: "/invoices",
    icon: <FileText size={16} />,
    keywords: "invoices",
  },
  {
    id: "nav-new-invoice",
    label: "Create Invoice",
    href: "/new-invoice",
    icon: <Plus size={16} />,
    keywords: "new invoice create add",
  },
  {
    id: "nav-clients",
    label: "Clients",
    href: "/clients",
    icon: <Users size={16} />,
    keywords: "clients customers",
  },
  {
    id: "nav-reports",
    label: "Reports",
    href: "/reports",
    icon: <BarChart3 size={16} />,
    keywords: "reports export income tax csv",
  },
  {
    id: "nav-settings",
    label: "Settings",
    href: "/settings",
    icon: <Settings size={16} />,
    keywords: "settings account profile password",
  },
];

export default function CommandPalette() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [data, setData] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Toggle with Cmd/Ctrl+K.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => {
          const next = !v;
          if (next) {
            // Reset search state when opening (event handler, not an effect).
            setQuery("");
            setActive(0);
          }
          return next;
        });
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Lazy-load invoices + clients the first time the palette opens.
  useEffect(() => {
    if (!open || loaded) return;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const [inv, cli] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, invoice_number, client_name")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("clients")
          .select("id, name, email")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      const invoiceItems: Item[] = (inv.data || []).map((r) => ({
        id: `inv-${r.id}`,
        label: r.invoice_number || "Invoice",
        sublabel: r.client_name || undefined,
        href: `/invoices/${r.id}`,
        icon: <FileText size={16} />,
        keywords: `${r.invoice_number} ${r.client_name} invoice`.toLowerCase(),
      }));

      const clientItems: Item[] = (cli.data || []).map((r) => ({
        id: `cli-${r.id}`,
        label: r.name || "Client",
        sublabel: r.email || undefined,
        href: `/clients/${r.id}`,
        icon: <Users size={16} />,
        keywords: `${r.name} ${r.email} client`.toLowerCase(),
      }));

      setData([...invoiceItems, ...clientItems]);
      setLoaded(true);
    })();
  }, [open, loaded, supabase]);

  // Focus the input when the palette opens (DOM side effect only, no setState).
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const results = useMemo(() => {
    const all = [...NAV_ITEMS, ...data];
    const q = query.trim().toLowerCase();
    if (!q) return NAV_ITEMS;
    return all
      .filter(
        (item) =>
          item.label.toLowerCase().includes(q) || item.keywords.includes(q)
      )
      .slice(0, 12);
  }, [query, data]);

  function onQueryChange(value: string) {
    setQuery(value);
    setActive(0);
  }

  function go(item: Item) {
    setOpen(false);
    router.push(item.href);
  }

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <div
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <Search size={18} className="shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onListKey}
            placeholder="Search invoices, clients, pages..."
            className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
          />
          <kbd className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 sm:inline dark:border-slate-600">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-500">
              No results found.
            </p>
          ) : (
            results.map((item, i) => (
              <button
                key={item.id}
                onClick={() => go(item)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                  i === active
                    ? "bg-slate-100 dark:bg-slate-800"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                }`}
              >
                <span className="text-slate-500 dark:text-slate-400">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">
                    {item.label}
                  </span>
                  {item.sublabel && (
                    <span className="block truncate text-xs text-slate-500">
                      {item.sublabel}
                    </span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
