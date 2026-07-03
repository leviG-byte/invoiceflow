"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { StatCardSkeleton, CardSkeleton } from "@/components/ui/Skeleton";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type DashboardInvoiceRow = {
  id: string;
  user_id: string;
  client_name: string;
  invoice_number: string;
  issue_date: string | null;
  due_date: string | null;
  status: string | null;
  total: number | string | null;
  created_at: string | null;
};

type RevenuePoint = {
  label: string;
  amount: number;
};

function getDisplayStatus(invoice: {
  status: string | null;
  due_date: string | null;
}) {
  if (invoice.status === "Paid") return "Paid";

  if (invoice.due_date) {
    const today = new Date();
    const dueDate = new Date(invoice.due_date);
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);

    if (dueDate < today) return "Overdue";
  }

  return "Pending";
}

function getStatusBadgeClasses(status: string) {
  if (status === "Paid") {
    return "bg-green-100 text-green-700 border-green-200";
  }

  if (status === "Overdue") {
    return "bg-red-100 text-red-700 border-red-200";
  }

  return "bg-amber-100 text-amber-700 border-amber-200";
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();

  const [invoices, setInvoices] = useState<DashboardInvoiceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionInvoiceId, setActionInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error("Dashboard user error:", userError);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, user_id, client_name, invoice_number, issue_date, due_date, status, total, created_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Dashboard invoices error:", error);
        toast(error.message || "Could not load dashboard data.", "error");
        setIsLoading(false);
        return;
      }

      setInvoices((data as DashboardInvoiceRow[]) || []);
      setIsLoading(false);
    }

    loadDashboard();
  }, [supabase, toast]);

  async function handleStatusChange(invoiceId: string, newStatus: "Paid" | "Pending") {
    setActionInvoiceId(invoiceId);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("Dashboard status user error:", userError);
      toast("You must be logged in.", "error");
      setActionInvoiceId(null);
      return;
    }

    const { error } = await supabase
      .from("invoices")
      .update({ status: newStatus })
      .eq("id", invoiceId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Dashboard status update error:", error);
      toast(error.message || "Could not update invoice status.", "error");
      setActionInvoiceId(null);
      return;
    }

    setInvoices((previous) =>
      previous.map((invoice) =>
        invoice.id === invoiceId ? { ...invoice, status: newStatus } : invoice
      )
    );

    toast(`Invoice updated to ${newStatus}.`, "success");
    setActionInvoiceId(null);
  }

  function handleDownloadPdf(invoiceId: string) {
    window.open(`/invoices/${invoiceId}?download=1`, "_blank");
  }

  const dashboardStats = useMemo(() => {
    let totalRevenue = 0;
    let paidRevenue = 0;
    let pendingRevenue = 0;
    let overdueRevenue = 0;

    let paidCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;

    invoices.forEach((invoice) => {
      const amount = Number(invoice.total) || 0;
      const displayStatus = getDisplayStatus(invoice);

      totalRevenue += amount;

      if (displayStatus === "Paid") {
        paidRevenue += amount;
        paidCount += 1;
      } else if (displayStatus === "Overdue") {
        overdueRevenue += amount;
        overdueCount += 1;
      } else {
        pendingRevenue += amount;
        pendingCount += 1;
      }
    });

    return {
      totalRevenue,
      paidRevenue,
      pendingRevenue,
      overdueRevenue,
      paidCount,
      pendingCount,
      overdueCount,
      totalInvoices: invoices.length,
    };
  }, [invoices]);

  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    const points: RevenuePoint[] = [];

    for (let i = 5; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = date.toLocaleString("en-US", { month: "short" });

      points.push({
        label,
        amount: 0,
      });
    }

    invoices.forEach((invoice) => {
      const rawDate = invoice.issue_date || invoice.created_at;
      if (!rawDate) return;

      const invoiceDate = new Date(rawDate);
      const monthDiff =
        (now.getFullYear() - invoiceDate.getFullYear()) * 12 +
        (now.getMonth() - invoiceDate.getMonth());

      if (monthDiff >= 0 && monthDiff < 6) {
        const index = 5 - monthDiff;
        points[index].amount += Number(invoice.total) || 0;
      }
    });

    return points;
  }, [invoices]);

  const currentYearRevenue = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();

    const months = Array.from({ length: 12 }, (_, index) => ({
      label: new Date(year, index, 1).toLocaleString("en-US", {
        month: "short",
      }),
      amount: 0,
    }));

    invoices.forEach((invoice) => {
      const rawDate = invoice.issue_date || invoice.created_at;
      if (!rawDate) return;

      const invoiceDate = new Date(rawDate);
      if (invoiceDate.getFullYear() !== year) return;

      months[invoiceDate.getMonth()].amount += Number(invoice.total) || 0;
    });

    return months;
  }, [invoices]);

  const topClients = useMemo(() => {
    const map = new Map<string, number>();

    invoices.forEach((invoice) => {
      const current = map.get(invoice.client_name) || 0;
      map.set(invoice.client_name, current + (Number(invoice.total) || 0));
    });

    return Array.from(map.entries())
      .map(([clientName, total]) => ({ clientName, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [invoices]);

  const recentInvoices = useMemo(() => invoices.slice(0, 5), [invoices]);

  const totalStatusCount =
    dashboardStats.paidCount +
    dashboardStats.pendingCount +
    dashboardStats.overdueCount;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">
                InvoiceFlow
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
                Dashboard
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Track revenue, invoice health, and recent activity from one clean
                workspace.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/new-invoice"
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
              >
                + Create Invoice
              </Link>

              <Link
                href="/invoices"
                className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                View All Invoices
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-slate-200 bg-white px-5 py-5 sm:grid-cols-2 xl:grid-cols-4 sm:px-6 lg:px-8">
          {isLoading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            <>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
            <p className="text-sm font-medium text-slate-500">Total Revenue</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              ${dashboardStats.totalRevenue.toFixed(2)}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Across {dashboardStats.totalInvoices} invoice
              {dashboardStats.totalInvoices === 1 ? "" : "s"}
            </p>
          </div>

          <div className="rounded-2xl border border-green-200 bg-green-50/40 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
            <p className="text-sm font-medium text-slate-500">Paid Revenue</p>
            <p className="mt-2 text-3xl font-bold text-green-600">
              ${dashboardStats.paidRevenue.toFixed(2)}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {dashboardStats.paidCount} paid invoice
              {dashboardStats.paidCount === 1 ? "" : "s"}
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
            <p className="text-sm font-medium text-slate-500">Pending Revenue</p>
            <p className="mt-2 text-3xl font-bold text-amber-600">
              ${dashboardStats.pendingRevenue.toFixed(2)}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {dashboardStats.pendingCount} pending invoice
              {dashboardStats.pendingCount === 1 ? "" : "s"}
            </p>
          </div>

          <div className="rounded-2xl border border-red-200 bg-red-50/40 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
            <p className="text-sm font-medium text-slate-500">Overdue Revenue</p>
            <p className="mt-2 text-3xl font-bold text-red-600">
              ${dashboardStats.overdueRevenue.toFixed(2)}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {dashboardStats.overdueCount} overdue invoice
              {dashboardStats.overdueCount === 1 ? "" : "s"}
            </p>
          </div>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-950">
              Last 6 Months Revenue
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              A quick look at how the business is trending.
            </p>
          </div>

          {isLoading ? (
            <CardSkeleton lines={6} />
          ) : monthlyRevenue.every((item) => item.amount === 0) ? (
            <p className="text-sm text-slate-500">
              No revenue data yet for the last 6 months.
            </p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyRevenue}
                  margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 13, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value: number) => `$${value}`}
                    width={60}
                  />
                  <Tooltip
                    cursor={{ fill: "#f1f5f9" }}
                    formatter={(value) => [
                      `$${Number(value).toFixed(2)}`,
                      "Revenue",
                    ]}
                    contentStyle={{
                      borderRadius: 16,
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 10px 30px rgba(2,6,23,0.08)",
                      fontSize: 13,
                    }}
                  />
                  <Bar
                    dataKey="amount"
                    fill="#0f172a"
                    radius={[10, 10, 4, 4]}
                    maxBarSize={56}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">
            Invoice Health
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            How your invoices are currently performing.
          </p>

          <div className="mt-6 space-y-5">
            {[
              {
                label: "Paid",
                count: dashboardStats.paidCount,
                color: "bg-green-500",
                text: "text-green-700",
              },
              {
                label: "Pending",
                count: dashboardStats.pendingCount,
                color: "bg-amber-500",
                text: "text-amber-700",
              },
              {
                label: "Overdue",
                count: dashboardStats.overdueCount,
                color: "bg-red-500",
                text: "text-red-700",
              },
            ].map((item) => {
              const width =
                totalStatusCount > 0
                  ? `${(item.count / totalStatusCount) * 100}%`
                  : "0%";

              return (
                <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">
                      {item.label}
                    </span>
                    <span className={`font-semibold ${item.text}`}>
                      {item.count}
                    </span>
                  </div>

                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${item.color}`}
                      style={{ width }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 rounded-2xl bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Collection Rate</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {dashboardStats.totalRevenue > 0
                ? `${Math.round(
                    (dashboardStats.paidRevenue / dashboardStats.totalRevenue) *
                      100
                  )}%`
                : "0%"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">
            Current Year Revenue
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Month-by-month performance this year.
          </p>

          {isLoading ? (
            <div className="mt-6">
              <CardSkeleton lines={5} />
            </div>
          ) : currentYearRevenue.every((item) => item.amount === 0) ? (
            <p className="mt-6 text-sm text-slate-500">
              No yearly revenue data yet.
            </p>
          ) : (
            <div className="mt-6 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={currentYearRevenue}
                  margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="yearRevenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value: number) => `$${value}`}
                    width={60}
                  />
                  <Tooltip
                    formatter={(value) => [
                      `$${Number(value).toFixed(2)}`,
                      "Revenue",
                    ]}
                    contentStyle={{
                      borderRadius: 16,
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 10px 30px rgba(2,6,23,0.08)",
                      fontSize: 13,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    fill="url(#yearRevenueFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">
            Top Clients
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Clients bringing in the most revenue.
          </p>

          {isLoading ? (
            <div className="mt-6">
              <CardSkeleton lines={4} />
            </div>
          ) : topClients.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">
              No client revenue data yet.
            </p>
          ) : (
            <div className="mt-6 space-y-4">
              {topClients.map((client) => {
                const maxClientRevenue = Math.max(
                  ...topClients.map((item) => item.total),
                  1
                );

                return (
                  <div key={client.clientName}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">
                        {client.clientName}
                      </span>
                      <span className="font-semibold text-slate-900">
                        ${client.total.toFixed(2)}
                      </span>
                    </div>

                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-violet-600"
                        style={{
                          width: `${(client.total / maxClientRevenue) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              Recent Invoices
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Your latest invoice activity.
            </p>
          </div>

          <Link
            href="/invoices"
            className="text-sm font-semibold text-blue-600 hover:underline"
          >
            View all
          </Link>
        </div>

        {isLoading ? (
          <CardSkeleton lines={4} />
        ) : recentInvoices.length === 0 ? (
          <p className="text-sm text-slate-500">
            No invoices found yet. Create your first invoice to start tracking
            progress.
          </p>
        ) : (
          <div className="space-y-4">
            {recentInvoices.map((invoice) => {
              const displayStatus = getDisplayStatus(invoice);
              const isWorking = actionInvoiceId === invoice.id;

              return (
                <div
                  key={invoice.id}
                  className="rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <Link href={`/invoices/${invoice.id}`} className="block">
                      <p className="font-semibold text-slate-950">
                        {invoice.invoice_number}
                      </p>
                      <p className="text-sm text-slate-600">
                        {invoice.client_name}
                      </p>
                    </Link>

                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-semibold text-slate-900">
                        ${(Number(invoice.total) || 0).toFixed(2)}
                      </span>

                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadgeClasses(
                          displayStatus
                        )}`}
                      >
                        {displayStatus}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-100"
                    >
                      View
                    </Link>

                    <Link
                      href={`/invoices/${invoice.id}/edit`}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-100"
                    >
                      Edit
                    </Link>

                    <button
                      onClick={() => handleDownloadPdf(invoice.id)}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-100"
                    >
                      PDF
                    </button>

                    {invoice.status === "Paid" ? (
                      <button
                        onClick={() => handleStatusChange(invoice.id, "Pending")}
                        disabled={isWorking}
                        className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isWorking ? "Updating..." : "Mark Pending"}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStatusChange(invoice.id, "Paid")}
                        disabled={isWorking}
                        className="rounded-xl bg-green-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isWorking ? "Updating..." : "Mark Paid"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}