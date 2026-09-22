"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  InvoiceItem,
  SavedInvoice,
  getItemType,
  sortItemsByDate,
} from "@/lib/invoice-utils";
import { generateReceiptPdf } from "@/lib/generate-receipt-pdf";
import type { BusinessProfilePdf } from "@/lib/generate-invoice-pdf";
import { useToast } from "@/components/ui/Toast";
import { StatCardSkeleton, TableRowSkeleton } from "@/components/ui/Skeleton";
import { Download, ReceiptText, ArrowUpRight } from "lucide-react";

type ReceiptRow = {
  id: string;
  invoice_id: string;
  receipt_number: string;
  client_name: string | null;
  amount: number | string | null;
  payment_date: string | null;
  payment_method: string | null;
  created_at: string | null;
};

type UIReceipt = {
  id: string;
  invoiceId: string;
  receiptNumber: string;
  clientName: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
};

type DatabaseInvoiceRow = {
  id: string;
  client_name: string;
  invoice_number: string;
  issue_date: string | null;
  due_date: string | null;
  status: string | null;
  items: InvoiceItem[] | null;
  total: number | string | null;
  payment_notes: string | null;
  payment_method: string | null;
  payment_date: string | null;
  tax_rate: number | string | null;
  discount: number | string | null;
};

type DatabaseBusinessProfileRow = {
  business_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  accent_color: string | null;
  logo_position: string | null;
  show_item_dates: boolean | null;
};

function formatDisplayDate(dateString?: string) {
  if (!dateString) return "—";
  const [year, month, day] = dateString.split("-");
  if (!year || !month || !day) return dateString;
  return `${month}/${day}/${year}`;
}

export default function ReceiptsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();

  const [receipts, setReceipts] = useState<UIReceipt[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfilePdf>({
    businessName: "",
    email: "",
    phone: "",
    address: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadReceipts() {
      // Await getUser() first so the session is hydrated before the query,
      // otherwise RLS silently returns [].
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      const [receiptsResponse, profileResponse] = await Promise.all([
        supabase
          .from("receipts")
          .select("*")
          .eq("user_id", user.id)
          .order("payment_date", { ascending: false }),
        supabase
          .from("business_profile")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      setIsLoading(false);

      if (receiptsResponse.error) {
        console.error("Load receipts error:", receiptsResponse.error);
        toast("Could not load receipts.", "error");
        return;
      }

      const formatted: UIReceipt[] = (
        (receiptsResponse.data as ReceiptRow[]) || []
      ).map((row) => ({
        id: row.id,
        invoiceId: row.invoice_id,
        receiptNumber: row.receipt_number,
        clientName: row.client_name || "—",
        amount: Number(row.amount) || 0,
        paymentDate: row.payment_date || "",
        paymentMethod: row.payment_method || "",
      }));

      setReceipts(formatted);

      if (profileResponse.data) {
        const profile = profileResponse.data as DatabaseBusinessProfileRow;
        setBusinessProfile({
          businessName: profile.business_name || "",
          email: profile.email || "",
          phone: profile.phone || "",
          address: profile.address || "",
          logoUrl: profile.logo_url || "",
          accentColor: profile.accent_color || undefined,
          logoPosition: profile.logo_position === "center" ? "center" : "left",
          showItemDates: profile.show_item_dates !== false,
        });
      }
    }

    loadReceipts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDownloadReceipt(receipt: UIReceipt) {
    setDownloadingId(receipt.id);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast("You must be logged in.", "error");
        return;
      }

      // The receipt PDF is rendered live from the source invoice so it always
      // reflects the latest line items and totals.
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", receipt.invoiceId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error || !data) {
        console.error("Load invoice for receipt error:", error);
        toast("Could not find the source invoice for this receipt.", "error");
        return;
      }

      const row = data as DatabaseInvoiceRow;

      const invoice: SavedInvoice & {
        paymentMethod?: string;
        paymentDate?: string;
      } = {
        id: row.id,
        clientName: row.client_name,
        invoiceNumber: row.invoice_number,
        issueDate: row.issue_date || "",
        dueDate: row.due_date || "",
        status: "Paid",
        items: sortItemsByDate(
          Array.isArray(row.items)
            ? row.items.map((item) => ({
                date: item.date ?? "",
                description: item.description ?? "",
                hours: item.hours ?? "",
                rate: item.rate ?? "",
                type: getItemType(item),
                amount: item.amount ?? "",
              }))
            : []
        ),
        paymentNotes: row.payment_notes || "",
        paymentMethod: row.payment_method || receipt.paymentMethod || "",
        paymentDate: row.payment_date || receipt.paymentDate || "",
        taxRate: Number(row.tax_rate) || 0,
        discount: Number(row.discount) || 0,
        total: Number(row.total) || receipt.amount,
      };

      const pdf = await generateReceiptPdf(invoice, businessProfile);
      pdf.save(`${receipt.receiptNumber}.pdf`);
      toast(`Downloaded ${receipt.receiptNumber}.`, "success");
    } catch (err) {
      console.error(err);
      toast("There was a problem generating the receipt.", "error");
    } finally {
      setDownloadingId(null);
    }
  }

  const filteredReceipts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return receipts;
    return receipts.filter(
      (receipt) =>
        receipt.receiptNumber.toLowerCase().includes(term) ||
        receipt.clientName.toLowerCase().includes(term) ||
        receipt.paymentMethod.toLowerCase().includes(term)
    );
  }, [receipts, searchTerm]);

  const totalReceived = receipts.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">
                InvoiceFlow
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
                Receipts
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Every paid invoice automatically records a receipt here. Download
                and share confirmation of payment anytime.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-5 sm:grid-cols-2 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-5">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Total Receipts
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">
              {receipts.length}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Total Received
            </p>
            <p className="mt-2 text-2xl font-bold text-emerald-600">
              ${totalReceived.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <label className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-200">
          Search
        </label>
        <input
          type="text"
          placeholder="Search by receipt #, client, or method"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
      </div>

      {/* Mobile cards */}
      <div className="grid gap-4 md:hidden">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : filteredReceipts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center shadow-sm">
            <ReceiptText className="mx-auto text-slate-400" size={28} />
            <p className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">
              No receipts yet
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Mark an invoice as Paid and its receipt will appear here.
            </p>
            <Link
              href="/invoices"
              className="mt-4 inline-flex rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Go to Invoices
            </Link>
          </div>
        ) : (
          filteredReceipts.map((receipt) => (
            <div
              key={receipt.id}
              className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-slate-950 dark:text-white">
                    {receipt.receiptNumber}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {receipt.clientName}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Paid
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 dark:bg-slate-800 p-4 text-sm">
                <div>
                  <p className="font-medium text-slate-500 dark:text-slate-400">Amount</p>
                  <p className="font-bold text-slate-950 dark:text-white">
                    ${receipt.amount.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-slate-500 dark:text-slate-400">Paid On</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatDisplayDate(receipt.paymentDate)}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="font-medium text-slate-500 dark:text-slate-400">Method</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {receipt.paymentMethod || "—"}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link
                  href={`/invoices/${receipt.invoiceId}`}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2.5 text-center text-sm font-semibold text-slate-800 dark:text-slate-200 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Invoice
                </Link>
                <button
                  onClick={() => handleDownloadReceipt(receipt)}
                  disabled={downloadingId === receipt.id}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Download size={15} />
                  {downloadingId === receipt.id ? "..." : "Receipt"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm md:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100/80 text-left text-slate-700 dark:text-slate-300">
            <tr>
              <th className="px-5 py-4 font-semibold">Receipt #</th>
              <th className="px-5 py-4 font-semibold">Client</th>
              <th className="px-5 py-4 font-semibold">Amount</th>
              <th className="px-5 py-4 font-semibold">Paid On</th>
              <th className="px-5 py-4 font-semibold">Method</th>
              <th className="px-5 py-4 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="p-0">
                  <TableRowSkeleton cols={6} />
                  <TableRowSkeleton cols={6} />
                  <TableRowSkeleton cols={6} />
                </td>
              </tr>
            ) : filteredReceipts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12">
                  <div className="text-center">
                    <ReceiptText className="mx-auto text-slate-400" size={28} />
                    <p className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">
                      No receipts yet
                    </p>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                      Mark an invoice as Paid and its receipt is recorded here
                      automatically.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredReceipts.map((receipt) => (
                <tr key={receipt.id} className="transition hover:bg-slate-50">
                  <td className="px-5 py-4 font-semibold text-slate-950 dark:text-white">
                    {receipt.receiptNumber}
                  </td>
                  <td className="px-5 py-4 text-slate-700 dark:text-slate-300">
                    {receipt.clientName}
                  </td>
                  <td className="px-5 py-4 font-bold text-slate-950 dark:text-white">
                    ${receipt.amount.toFixed(2)}
                  </td>
                  <td className="px-5 py-4 text-slate-700 dark:text-slate-300">
                    {formatDisplayDate(receipt.paymentDate)}
                  </td>
                  <td className="px-5 py-4 text-slate-700 dark:text-slate-300">
                    {receipt.paymentMethod || "—"}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/invoices/${receipt.invoiceId}`}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-200 transition hover:border-slate-400 hover:bg-slate-50"
                      >
                        Invoice <ArrowUpRight size={14} />
                      </Link>
                      <button
                        onClick={() => handleDownloadReceipt(receipt)}
                        disabled={downloadingId === receipt.id}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <Download size={15} />
                        {downloadingId === receipt.id ? "..." : "Receipt"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
