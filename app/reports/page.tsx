"use client";

import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { CardSkeleton, StatCardSkeleton } from "@/components/ui/Skeleton";
import { getDisplayStatus, InvoiceItem, SavedInvoice } from "@/lib/invoice-utils";
import { Download, FileSpreadsheet } from "lucide-react";

type ReportInvoice = SavedInvoice & { id: string; createdAt: string };

type DatabaseInvoiceRow = {
  id: string;
  client_name: string;
  invoice_number: string;
  issue_date: string | null;
  due_date: string | null;
  status: string | null;
  items: InvoiceItem[] | null;
  total: number | string | null;
  payment_date: string | null;
  created_at: string | null;
};

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function startOfYearStr() {
  return `${new Date().getFullYear()}-01-01`;
}

function invoiceDate(inv: ReportInvoice) {
  return inv.issueDate || inv.createdAt.split("T")[0] || "";
}

export default function ReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();

  const [invoices, setInvoices] = useState<ReportInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [from, setFrom] = useState(startOfYearStr());
  const [to, setTo] = useState(todayStr());

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setIsLoading(false);

      if (error) {
        console.error("Load reports error:", error);
        toast("Could not load report data.", "error");
        return;
      }

      setInvoices(
        ((data as DatabaseInvoiceRow[]) || []).map((r) => ({
          id: r.id,
          clientName: r.client_name,
          invoiceNumber: r.invoice_number,
          issueDate: r.issue_date || "",
          dueDate: r.due_date || "",
          status: r.status === "Paid" ? "Paid" : "Pending",
          items: Array.isArray(r.items) ? r.items : [],
          total: Number(r.total) || 0,
          createdAt: r.created_at || "",
        }))
      );
    }

    load();
  }, [supabase, toast]);

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      const d = invoiceDate(inv);
      if (!d) return false;
      return d >= from && d <= to;
    });
  }, [invoices, from, to]);

  const summary = useMemo(() => {
    let total = 0;
    let paid = 0;
    let outstanding = 0;
    filtered.forEach((inv) => {
      const status = getDisplayStatus(inv);
      total += inv.total;
      if (status === "Paid") paid += inv.total;
      else outstanding += inv.total;
    });
    return { total, paid, outstanding, count: filtered.length };
  }, [filtered]);

  const monthly = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((inv) => {
      const d = invoiceDate(inv);
      const key = d.slice(0, 7); // YYYY-MM
      map.set(key, (map.get(key) || 0) + inv.total);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, amount]) => ({ month, amount }));
  }, [filtered]);

  function downloadCsv() {
    const header = [
      "Invoice Number",
      "Client",
      "Issue Date",
      "Due Date",
      "Status",
      "Total",
    ];
    const rows = filtered.map((inv) => [
      inv.invoiceNumber,
      inv.clientName,
      inv.issueDate,
      inv.dueDate,
      getDisplayStatus(inv),
      inv.total.toFixed(2),
    ]);

    const escape = (v: string | number) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const csv = [header, ...rows]
      .map((r) => r.map(escape).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoiceflow-report-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("CSV exported.", "success");
  }

  function downloadPdf() {
    const pdf = new jsPDF("p", "mm", "a4");
    const left = 20;
    const right = 190;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.text("Income Report", left, 22);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(100);
    pdf.text(`Period: ${from} to ${to}`, left, 30);
    pdf.setTextColor(0);

    pdf.setDrawColor(220);
    pdf.line(left, 34, right, 34);

    let y = 46;
    const rows: [string, string][] = [
      ["Total invoiced", `$${summary.total.toFixed(2)}`],
      ["Paid", `$${summary.paid.toFixed(2)}`],
      ["Outstanding", `$${summary.outstanding.toFixed(2)}`],
      ["Invoices", String(summary.count)],
    ];
    pdf.setFontSize(12);
    rows.forEach(([label, value]) => {
      pdf.setFont("helvetica", "normal");
      pdf.text(label, left, y);
      pdf.setFont("helvetica", "bold");
      pdf.text(value, right, y, { align: "right" });
      y += 9;
    });

    y += 6;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text("By Month", left, y);
    y += 8;

    pdf.setFontSize(10);
    monthly.forEach(({ month, amount }) => {
      pdf.setFont("helvetica", "normal");
      pdf.text(month, left, y);
      pdf.text(`$${amount.toFixed(2)}`, right, y, { align: "right" });
      y += 7;
      if (y > 280) {
        pdf.addPage();
        y = 20;
      }
    });

    pdf.save(`invoiceflow-report-${from}-to-${to}.pdf`);
    toast("PDF report downloaded.", "success");
  }

  const maxMonth = Math.max(...monthly.map((m) => m.amount), 1);
  const hasData = filtered.length > 0;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-6 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">
            InvoiceFlow
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
            Reports
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Review income over a date range and export your invoices for taxes
            or accounting.
          </p>
        </div>

        {/* Date range + exports */}
        <div className="flex flex-col gap-4 border-t border-slate-200 dark:border-slate-700 px-5 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                From
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                To
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={downloadCsv}
              disabled={!hasData}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileSpreadsheet size={15} /> Export CSV
            </button>
            <button
              onClick={downloadPdf}
              disabled={!hasData}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={15} /> Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Invoiced</p>
            <p className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">
              ${summary.total.toFixed(2)}
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {summary.count} invoice{summary.count === 1 ? "" : "s"} in range
            </p>
          </div>
          <div className="rounded-2xl border border-green-200 bg-green-50/40 p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Paid</p>
            <p className="mt-2 text-3xl font-bold text-green-600">
              ${summary.paid.toFixed(2)}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Outstanding</p>
            <p className="mt-2 text-3xl font-bold text-amber-600">
              ${summary.outstanding.toFixed(2)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Collection Rate</p>
            <p className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">
              {summary.total > 0
                ? `${Math.round((summary.paid / summary.total) * 100)}%`
                : "0%"}
            </p>
          </div>
        </div>
      )}

      {/* Monthly breakdown */}
      {isLoading ? (
        <CardSkeleton lines={6} />
      ) : (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
            Income by Month
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Invoiced amounts per month within the selected range.
          </p>

          {monthly.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
              No invoices in this date range.
            </p>
          ) : (
            <div className="mt-6 space-y-4">
              {monthly.map(({ month, amount }) => (
                <div key={month}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{month}</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      ${amount.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-950">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{ width: `${(amount / maxMonth) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
