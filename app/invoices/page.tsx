"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DRAFT_INVOICE_STORAGE_KEY,
  InvoiceItem,
  InvoiceStatus,
  SavedInvoice,
  getDisplayStatus,
  getInitials,
  getItemType,
} from "@/lib/invoice-utils";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { StatCardSkeleton, TableRowSkeleton } from "@/components/ui/Skeleton";

type DatabaseInvoiceRow = {
  id: string;
  client_name: string;
  invoice_number: string;
  issue_date: string | null;
  due_date: string | null;
  status: string | null;
  items: InvoiceItem[] | null;
  total: number | string | null;
  created_at?: string;
};

type UIInvoice = SavedInvoice & {
  id: string;
};

export default function InvoicesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<UIInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("newest");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<UIInvoice | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function mapDatabaseInvoiceToUI(invoice: DatabaseInvoiceRow): UIInvoice {
    return {
      id: invoice.id,
      clientName: invoice.client_name,
      invoiceNumber: invoice.invoice_number,
      issueDate: invoice.issue_date || "",
      dueDate: invoice.due_date || "",
      status: invoice.status === "Paid" ? "Paid" : "Pending",
      items: Array.isArray(invoice.items)
        ? invoice.items.map((item) => ({
            date: item.date ?? "",
            description: item.description ?? "",
            hours: item.hours ?? "",
            rate: item.rate ?? "",
            type: getItemType(item),
            amount: item.amount ?? "",
          }))
        : [],
      total: Number(invoice.total) || 0,
    };
  }

  useEffect(() => {
    async function loadInvoices() {
      // Waiting on getUser() ensures the session is hydrated before querying;
      // otherwise the request can go out unauthenticated and RLS returns [].
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
        console.error("Load invoices error:", error);
        toast("Could not load invoices from database.", "error");
        return;
      }

      const formattedInvoices: UIInvoice[] = (
        (data as DatabaseInvoiceRow[]) || []
      ).map(mapDatabaseInvoiceToUI);

      setInvoices(formattedInvoices);
    }

    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function performDeleteInvoice() {
    if (!pendingDelete) return;
    const invoice = pendingDelete;

    setIsDeleting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast("You must be logged in to delete an invoice.", "error");
      setIsDeleting(false);
      setPendingDelete(null);
      return;
    }

    const { error } = await supabase
      .from("invoices")
      .delete()
      .eq("id", invoice.id)
      .eq("user_id", user.id);

    setIsDeleting(false);
    setPendingDelete(null);

    if (error) {
      console.error("Delete invoice error:", error);
      toast("Could not delete invoice.", "error");
      return;
    }

    const updatedInvoices = invoices.filter((item) => item.id !== invoice.id);
    setInvoices(updatedInvoices);
    toast(`Invoice ${invoice.invoiceNumber} deleted.`, "success");
  }

  async function handleStatusChange(invoice: UIInvoice, newStatus: string) {
    const statusValue = newStatus as InvoiceStatus;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast("You must be logged in to update an invoice.", "error");
      return;
    }

    const { error } = await supabase
      .from("invoices")
      .update({ status: statusValue })
      .eq("id", invoice.id)
      .eq("user_id", user.id);

    if (error) {
      console.error("Update status error:", error);
      toast("Could not update invoice status.", "error");
      return;
    }

    const updatedInvoices = invoices.map((item) =>
      item.id === invoice.id ? { ...item, status: statusValue } : item
    );

    setInvoices(updatedInvoices);
    toast(`Invoice ${invoice.invoiceNumber} updated to ${newStatus}.`, "success");
  }

  function handleDownloadPdf(invoice: UIInvoice) {
    window.open(`/invoices/${invoice.id}?download=1`, "_blank");
  }

  async function handleCopyInvoiceNumber(invoiceNumber: string) {
    try {
      await navigator.clipboard.writeText(invoiceNumber);
      toast(`Copied ${invoiceNumber}.`, "success");
    } catch {
      toast("Could not copy invoice number.", "error");
    }
  }

  function handleDuplicateInvoice(invoice: UIInvoice) {
    localStorage.setItem(
      DRAFT_INVOICE_STORAGE_KEY,
      JSON.stringify({
        clientName: invoice.clientName,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        status: invoice.status,
        items: invoice.items.map((item) => ({
          date: item.date,
          description: item.description,
          hours: item.hours,
          rate: item.rate,
          type: getItemType(item),
          amount: item.amount ?? "",
        })),
      })
    );

    window.location.href = "/new-invoice";
  }

  const filteredInvoices = useMemo(() => {
    let filtered = [...invoices];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();

      filtered = filtered.filter((invoice) => {
        return (
          invoice.clientName.toLowerCase().includes(term) ||
          invoice.invoiceNumber.toLowerCase().includes(term) ||
          invoice.status.toLowerCase().includes(term)
        );
      });
    }

    if (statusFilter !== "All") {
      if (statusFilter === "Overdue") {
        filtered = filtered.filter(
          (invoice) => getDisplayStatus(invoice) === "Overdue"
        );
      } else {
        filtered = filtered.filter(
          (invoice) => getDisplayStatus(invoice) === statusFilter
        );
      }
    }

    filtered.sort((a, b) => {
      if (sortBy === "newest") {
        return new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime();
      }

      if (sortBy === "oldest") {
        return new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime();
      }

      if (sortBy === "highest") {
        return b.total - a.total;
      }

      if (sortBy === "lowest") {
        return a.total - b.total;
      }

      if (sortBy === "client-az") {
        return a.clientName.localeCompare(b.clientName);
      }

      if (sortBy === "client-za") {
        return b.clientName.localeCompare(a.clientName);
      }

      return 0;
    });

    return filtered;
  }, [invoices, searchTerm, statusFilter, sortBy]);

  const totalInvoices = invoices.length;
  const paidInvoices = invoices.filter(
    (invoice) => getDisplayStatus(invoice) === "Paid"
  ).length;
  const pendingInvoices = invoices.filter(
    (invoice) => getDisplayStatus(invoice) === "Pending"
  ).length;
  const overdueInvoices = invoices.filter(
    (invoice) => getDisplayStatus(invoice) === "Overdue"
  ).length;
  const totalRevenue = invoices.reduce((sum, invoice) => sum + invoice.total, 0);

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
                Invoices
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Manage, track, update, and export your invoices from one clean
                workspace.
              </p>
            </div>

            <Link
              href="/new-invoice"
              className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
            >
              + Create Invoice
            </Link>
          </div>
        </div>

        <div className="grid gap-4 border-t border-slate-200 bg-white px-5 py-5 sm:grid-cols-2 xl:grid-cols-5 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
            <p className="text-sm font-medium text-slate-600">Total Invoices</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {totalInvoices}
            </p>
          </div>

          <div className="rounded-2xl border border-green-200 bg-green-50/40 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
            <p className="text-sm font-medium text-slate-600">Paid</p>
            <p className="mt-2 text-2xl font-bold text-green-600">
              {paidInvoices}
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
            <p className="text-sm font-medium text-slate-600">Pending</p>
            <p className="mt-2 text-2xl font-bold text-amber-600">
              {pendingInvoices}
            </p>
          </div>

          <div className="rounded-2xl border border-red-200 bg-red-50/40 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
            <p className="text-sm font-medium text-slate-600">Overdue</p>
            <p className="mt-2 text-2xl font-bold text-red-600">
              {overdueInvoices}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
            <p className="text-sm font-medium text-slate-600">Total Revenue</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              ${totalRevenue.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:block">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
          <p className="mt-1 text-sm text-slate-500">
            Search invoices and narrow results by status or sort order.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">
              Search
            </label>
            <input
              type="text"
              placeholder="Search by client, invoice #, or status"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="All">All</option>
              <option value="Pending">Pending</option>
              <option value="Paid">Paid</option>
              <option value="Overdue">Overdue</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="highest">Highest Total</option>
              <option value="lowest">Lowest Total</option>
              <option value="client-az">Client A-Z</option>
              <option value="client-za">Client Z-A</option>
            </select>
          </div>
        </div>
      </div>

      <div className="md:hidden">
        <button
          onClick={() => setShowMobileFilters((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-300"
        >
          <span>Filters and Search</span>
          <span className="text-lg leading-none">
            {showMobileFilters ? "−" : "+"}
          </span>
        </button>
      </div>

      {showMobileFilters && (
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:hidden">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Search
              </label>
              <input
                type="text"
                placeholder="Search by client, invoice #, or status"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="All">All</option>
                <option value="Pending">Pending</option>
                <option value="Paid">Paid</option>
                <option value="Overdue">Overdue</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                Sort By
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="highest">Highest Total</option>
                <option value="lowest">Lowest Total</option>
                <option value="client-az">Client A-Z</option>
                <option value="client-za">Client Z-A</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="mt-1">
        <div className="grid gap-4 md:hidden">
          {isLoading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : filteredInvoices.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
              <p className="text-base font-semibold text-slate-900">
                No invoices yet
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Create your first invoice to start tracking payments.
              </p>
              <Link
                href="/new-invoice"
                className="mt-4 inline-flex rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Create Invoice
              </Link>
            </div>
          ) : (
            filteredInvoices.map((invoice) => {
              const displayStatus = getDisplayStatus(invoice);

              return (
                <div
                  key={invoice.id}
                  className={`rounded-3xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
                    displayStatus === "Overdue"
                      ? "border-red-200 bg-red-50/30"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-white">
                        {getInitials(invoice.clientName)}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-950">
                          {invoice.clientName}
                        </p>

                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                          <span>Invoice #{invoice.invoiceNumber}</span>
                          <button
                            onClick={() =>
                              handleCopyInvoiceNumber(invoice.invoiceNumber)
                            }
                            className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                        displayStatus === "Paid"
                          ? "bg-green-100 text-green-700"
                          : displayStatus === "Overdue"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {displayStatus}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
                    <div>
                      <p className="font-medium text-slate-500">Issue Date</p>
                      <p className="font-semibold text-slate-900">
                        {invoice.issueDate || "-"}
                      </p>
                    </div>

                    <div>
                      <p className="font-medium text-slate-500">Due Date</p>
                      <p className="font-semibold text-slate-900">
                        {invoice.dueDate || "-"}
                      </p>
                    </div>

                    <div>
                      <p className="font-medium text-slate-500">Total</p>
                      <p className="font-bold text-slate-950">
                        ${invoice.total.toFixed(2)}
                      </p>
                    </div>

                    <div>
                      <p className="font-medium text-slate-500">Status</p>
                      <select
                        value={invoice.status}
                        onChange={(e) =>
                          handleStatusChange(invoice, e.target.value)
                        }
                        className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold outline-none transition ${
                          invoice.status === "Paid"
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                      >
                        <option value="Pending">Pending</option>
                        <option value="Paid">Paid</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="rounded-xl border border-slate-300 px-3 py-2.5 text-center text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      View
                    </Link>

                    <Link
                      href={`/invoices/${invoice.id}/edit`}
                      className="rounded-xl border border-slate-300 px-3 py-2.5 text-center text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      Edit
                    </Link>

                    <button
                      onClick={() => handleDuplicateInvoice(invoice)}
                      className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      Duplicate
                    </button>

                    <button
                      onClick={() => handleDownloadPdf(invoice)}
                      className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      PDF
                    </button>

                    <button
                      onClick={() => setPendingDelete(invoice)}
                      className="col-span-2 rounded-xl border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm md:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-100/80 text-left text-slate-700">
              <tr>
                <th className="px-5 py-4 font-semibold">Client</th>
                <th className="px-5 py-4 font-semibold">Invoice #</th>
                <th className="px-5 py-4 font-semibold">Issue Date</th>
                <th className="px-5 py-4 font-semibold">Due Date</th>
                <th className="px-5 py-4 font-semibold">Total</th>
                <th className="px-5 py-4 font-semibold">Status</th>
                <th className="px-5 py-4 font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-0">
                    <TableRowSkeleton cols={7} />
                    <TableRowSkeleton cols={7} />
                    <TableRowSkeleton cols={7} />
                    <TableRowSkeleton cols={7} />
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12">
                    <div className="text-center">
                      <p className="text-base font-semibold text-slate-900">
                        No invoices yet
                      </p>
                      <p className="mt-2 text-sm text-slate-600">
                        Create your first invoice to start tracking payments.
                      </p>
                      <Link
                        href="/new-invoice"
                        className="mt-4 inline-flex rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        Create Invoice
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => {
                  const displayStatus = getDisplayStatus(invoice);

                  return (
                    <tr
                      key={invoice.id}
                      className={`transition ${
                        displayStatus === "Overdue"
                          ? "bg-red-50/30 hover:bg-red-50/50"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-white">
                            {getInitials(invoice.clientName)}
                          </div>
                          <span className="font-semibold text-slate-950">
                            {invoice.clientName}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        <div className="flex items-center gap-2">
                          <span>{invoice.invoiceNumber}</span>
                          <button
                            onClick={() =>
                              handleCopyInvoiceNumber(invoice.invoiceNumber)
                            }
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                          >
                            Copy
                          </button>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        {invoice.issueDate || "-"}
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        {invoice.dueDate || "-"}
                      </td>

                      <td className="px-5 py-4 font-bold text-slate-950">
                        ${invoice.total.toFixed(2)}
                      </td>

                      <td className="px-5 py-4">
                        <select
                          value={invoice.status}
                          onChange={(e) =>
                            handleStatusChange(invoice, e.target.value)
                          }
                          className={`rounded-xl border px-3 py-2 text-sm font-semibold outline-none transition ${
                            invoice.status === "Paid"
                              ? "border-green-200 bg-green-50 text-green-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                        >
                          <option value="Pending">Pending</option>
                          <option value="Paid">Paid</option>
                        </select>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                          >
                            View
                          </Link>

                          <Link
                            href={`/invoices/${invoice.id}/edit`}
                            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                          >
                            Edit
                          </Link>

                          <button
                            onClick={() => handleDuplicateInvoice(invoice)}
                            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                          >
                            Duplicate
                          </button>

                          <button
                            onClick={() => handleDownloadPdf(invoice)}
                            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                          >
                            PDF
                          </button>

                          <button
                            onClick={() => setPendingDelete(invoice)}
                            className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete invoice ${pendingDelete?.invoiceNumber ?? ""}?`}
        description="This permanently removes the invoice and cannot be undone."
        confirmLabel="Delete Invoice"
        destructive
        busy={isDeleting}
        onConfirm={performDeleteInvoice}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}