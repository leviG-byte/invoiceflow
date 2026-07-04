"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { generateInvoicePdf } from "@/lib/generate-invoice-pdf";
import { generateReceiptPdf } from "@/lib/generate-receipt-pdf";
import {
  DEFAULT_ACCENT,
  InvoiceItem,
  SavedInvoice,
  accentTextColor,
  calculateInvoiceTotals,
  getDisplayStatus,
  getItemAmount,
  getItemType,
  getStatusClasses,
  sortItemsByDate,
} from "@/lib/invoice-utils";
import { useToast } from "@/components/ui/Toast";
import { CardSkeleton, Skeleton } from "@/components/ui/Skeleton";
import {
  ArrowLeft,
  Download,
  Pencil,
  Send,
  BellRing,
  ReceiptText,
} from "lucide-react";

type DatabaseInvoiceRow = {
  id: string;
  user_id: string;
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

type DatabaseClientRow = {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  rate: number | null;
};

type BusinessProfile = {
  id?: string;
  businessName: string;
  email: string;
  phone: string;
  address: string;
  logoUrl?: string;
  accentColor?: string;
  logoPosition?: "left" | "center";
  showItemDates?: boolean;
};

type DatabaseBusinessProfileRow = {
  id: string;
  user_id: string;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  accent_color: string | null;
  logo_position: string | null;
  show_item_dates: boolean | null;
};

type InvoiceDetail = SavedInvoice & {
  paymentMethod?: string;
  paymentDate?: string;
};

export default function InvoiceDetailPage() {
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [notFoundMessage, setNotFoundMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>({
    businessName: "",
    email: "",
    phone: "",
    address: "",
    logoUrl: "",
  });

  useEffect(() => {
    async function loadPageData() {
      setIsLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error("User error:", userError);
        setNotFoundMessage("You must be logged in.");
        setIsLoading(false);
        return;
      }

      const [invoiceResponse, businessProfileResponse] = await Promise.all([
        supabase
          .from("invoices")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("business_profile")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      const { data: invoiceData, error: invoiceError } = invoiceResponse;
      const { data: profileData, error: profileError } = businessProfileResponse;

      if (invoiceError || !invoiceData) {
        console.error("Load invoice error:", invoiceError);
        setNotFoundMessage(invoiceError?.message || "Invoice not found.");
        setIsLoading(false);
        return;
      }

      const row = invoiceData as DatabaseInvoiceRow;

      let clientEmail = "";

      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .eq("name", row.client_name)
        .maybeSingle();

      if (clientError) {
        console.error("Load client error:", clientError);
      } else if (clientData) {
        const client = clientData as DatabaseClientRow;
        clientEmail = client.email || "";
      }

      setInvoice({
        id: row.id,
        clientName: row.client_name,
        clientEmail,
        invoiceNumber: row.invoice_number,
        issueDate: row.issue_date || "",
        dueDate: row.due_date || "",
        status: row.payment_date ? "Paid" : row.status === "Paid" ? "Paid" : "Pending",
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
        paymentMethod: row.payment_method || "",
        paymentDate: row.payment_date || "",
        taxRate: Number(row.tax_rate) || 0,
        discount: Number(row.discount) || 0,
        total: Number(row.total) || 0,
      });

      if (profileError) {
        console.error("Load business profile error:", profileError);
      } else if (profileData) {
        const profile = profileData as DatabaseBusinessProfileRow;

        setBusinessProfile({
          id: profile.id,
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

      setIsLoading(false);
    }

    loadPageData();
  }, [id, supabase]);

  useEffect(() => {
    const shouldDownload = searchParams.get("download");

    if (shouldDownload === "1" && invoice) {
      handleDownloadPDF(invoice);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, searchParams]);

  async function handleDownloadPDF(currentInvoice: InvoiceDetail) {
    try {
      const pdf = await generateInvoicePdf(currentInvoice, businessProfile);
      pdf.save(`${currentInvoice.invoiceNumber}.pdf`);
    } catch (error) {
      console.error(error);
      toast("There was a problem generating the PDF.", "error");
    }
  }

  async function handleDownloadReceipt(currentInvoice: InvoiceDetail) {
    try {
      const pdf = await generateReceiptPdf(currentInvoice, businessProfile);
      pdf.save(`Receipt-${currentInvoice.invoiceNumber}.pdf`);
    } catch (error) {
      console.error(error);
      toast("There was a problem generating the receipt.", "error");
    }
  }

  async function handleSendInvoice(kind: "invoice" | "reminder" = "invoice") {
    if (!invoice) return;

    try {
      setIsSending(true);

      if (!invoice.clientEmail?.trim()) {
        throw new Error("This client does not have an email address.");
      }

      // Generate the PDF in the browser and attach it so the client
      // receives the actual document, not just a summary.
      let pdfBase64 = "";
      try {
        const pdf = await generateInvoicePdf(invoice, businessProfile);
        pdfBase64 = pdf.output("datauristring").split(",")[1] || "";
      } catch (pdfError) {
        console.error("PDF generation for email failed:", pdfError);
      }

      const response = await fetch("/api/send-invoice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invoiceId: invoice.id, kind, pdfBase64 }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to send invoice");
      }

      toast(
        kind === "reminder"
          ? "Payment reminder sent 🔔"
          : "Invoice sent successfully 🚀",
        "success"
      );
    } catch (error) {
      console.error("Send invoice error:", error);
      toast(
        error instanceof Error ? error.message : "Failed to send invoice",
        "error"
      );
    } finally {
      setIsSending(false);
    }
  }

  function formatDisplayDate(dateString?: string) {
    if (!dateString) return "—";

    const [year, month, day] = dateString.split("-");
    if (!year || !month || !day) return dateString;

    return `${month}/${day}/${year}`;
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex gap-3">
          <Skeleton className="h-11 w-40" />
          <Skeleton className="h-11 w-32" />
        </div>
        <CardSkeleton lines={10} />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-6 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4">
              <Link
                href="/invoices"
                className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
              >
                <ArrowLeft size={16} /> Back to Invoices
              </Link>

              <div>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
                  Invoice Details
                </h1>
                <p className="mt-2 text-sm text-slate-300">
                  {notFoundMessage || "Invoice not found."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayStatus = getDisplayStatus(invoice);
  const isOverdue = displayStatus === "Overdue";
  const isPaid = displayStatus === "Paid";
  const totals = calculateInvoiceTotals(
    invoice.items,
    invoice.taxRate || 0,
    invoice.discount || 0
  );
  const hasBreakdown = totals.discountAmount > 0 || totals.taxAmount > 0;
  const allFixed =
    invoice.items.length > 0 &&
    invoice.items.every((item) => getItemType(item) === "fixed");

  const showDates = businessProfile.showItemDates !== false;
  const isCenter = businessProfile.logoPosition === "center";
  const hasCustomAccent = !!businessProfile.accentColor;
  const accent = businessProfile.accentColor || DEFAULT_ACCENT;
  const accentText = accentTextColor(accent);

  // Full literal class strings (Tailwind must see them statically).
  const itemGridCols = allFixed
    ? showDates
      ? "grid-cols-[110px_minmax(0,1fr)_110px]"
      : "grid-cols-[minmax(0,1fr)_110px]"
    : showDates
    ? "grid-cols-[110px_minmax(0,1fr)_90px_110px_110px]"
    : "grid-cols-[minmax(0,1fr)_90px_110px_110px]";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/invoices"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          <ArrowLeft size={16} /> Back to Invoices
        </Link>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/invoices/${id}/edit`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-200 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Pencil size={15} /> Edit
          </Link>

          <button
            onClick={() => handleDownloadPDF(invoice)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-200 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Download size={15} /> PDF
          </button>

          {isPaid && (
            <button
              onClick={() => handleDownloadReceipt(invoice)}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100"
            >
              <ReceiptText size={15} /> Receipt
            </button>
          )}

          {isOverdue && (
            <button
              onClick={() => handleSendInvoice("reminder")}
              disabled={isSending}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <BellRing size={15} />
              {isSending ? "Sending..." : "Send Reminder"}
            </button>
          )}

          <button
            onClick={() => handleSendInvoice("invoice")}
            disabled={isSending}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send size={15} />
            {isSending ? "Sending..." : "Send Invoice"}
          </button>
        </div>
      </div>

      {/* The invoice document — always renders on white "paper", even in dark mode */}
      <div className="force-light relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {/* Top accent */}
        {hasCustomAccent ? (
          <div className="h-2" style={{ background: accent }} />
        ) : (
          <div className="h-2 bg-gradient-to-r from-slate-950 via-blue-800 to-blue-500" />
        )}

        {isPaid && (
          <div className="pointer-events-none absolute right-6 top-10 rotate-12 rounded-xl border-4 border-emerald-500/70 px-4 py-1.5 text-xl font-black uppercase tracking-widest text-emerald-500/70 sm:right-12 sm:top-14">
            Paid
          </div>
        )}

        {isOverdue && (
          <div className="pointer-events-none absolute right-6 top-10 rotate-12 rounded-xl border-4 border-red-500/60 px-4 py-1.5 text-xl font-black uppercase tracking-widest text-red-500/60 sm:right-12 sm:top-14">
            Overdue
          </div>
        )}

        <div className="p-6 sm:p-10">
          {/* Letterhead */}
          <div
            className={`flex flex-col gap-6 border-b border-slate-200 dark:border-slate-700 pb-8 ${
              isCenter
                ? "items-center text-center"
                : "sm:flex-row sm:items-start sm:justify-between"
            }`}
          >
            <div className={`min-w-0 ${isCenter ? "flex flex-col items-center" : ""}`}>
              {businessProfile.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={businessProfile.logoUrl}
                  alt="Business Logo"
                  className="mb-4 max-h-16 max-w-[200px] object-contain"
                />
              ) : (
                <div
                  className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ background: accent }}
                >
                  <span
                    className="text-base font-bold"
                    style={{ color: accentText }}
                  >
                    {(businessProfile.businessName || "IF").slice(0, 2).toUpperCase()}
                  </span>
                </div>
              )}

              <h2 className="text-xl font-bold text-slate-950 dark:text-white">
                {businessProfile.businessName || "InvoiceFlow"}
              </h2>

              <div className="mt-2 space-y-0.5 text-sm text-slate-500 dark:text-slate-400">
                {businessProfile.email && <p>{businessProfile.email}</p>}
                {businessProfile.phone && <p>{businessProfile.phone}</p>}
                {businessProfile.address && <p>{businessProfile.address}</p>}
              </div>
            </div>

            <div className={isCenter ? "text-center" : "text-left sm:text-right"}>
              <p
                className="text-3xl font-black uppercase tracking-tight sm:text-4xl"
                style={{ color: hasCustomAccent ? accent : "#0f172a" }}
              >
                Invoice
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-500 dark:text-slate-400">
                {invoice.invoiceNumber}
              </p>

              <span
                className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                  displayStatus
                )}`}
              >
                {displayStatus}
              </span>
            </div>
          </div>

          {/* Bill To + dates */}
          <div className="grid gap-6 border-b border-slate-200 dark:border-slate-700 py-8 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Billed To
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                {invoice.clientName}
              </p>
              {invoice.clientEmail && (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{invoice.clientEmail}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 sm:justify-items-end sm:text-right">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Issue Date
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {formatDisplayDate(invoice.issueDate)}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Due Date
                </p>
                <p
                  className={`mt-1 text-sm font-semibold ${
                    isOverdue ? "text-red-600" : "text-slate-900 dark:text-slate-100"
                  }`}
                >
                  {formatDisplayDate(invoice.dueDate)}
                </p>
              </div>

              {invoice.paymentMethod && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Payment Method
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {invoice.paymentMethod}
                  </p>
                </div>
              )}

              {invoice.paymentDate && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Paid On
                  </p>
                  <p className="mt-1 text-sm font-semibold text-emerald-600">
                    {formatDisplayDate(invoice.paymentDate)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Items table */}
          <div className="py-8">
            <div
              className={`hidden ${itemGridCols} gap-3 border-b border-slate-200 dark:border-slate-700 pb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 md:grid`}
            >
              {showDates && <p>Date</p>}
              <p>Description</p>
              {!allFixed && <p className="text-right">Hours</p>}
              {!allFixed && <p className="text-right">Rate</p>}
              <p className="text-right">Amount</p>
            </div>

            <div className="hidden md:block">
              {invoice.items.map((item, index) => {
                const isFixed = getItemType(item) === "fixed";
                const amount = getItemAmount(item);

                return (
                  <div
                    key={index}
                    className={`grid ${itemGridCols} gap-3 border-b border-slate-100 dark:border-slate-800 py-4 text-sm text-slate-700 dark:text-slate-300`}
                  >
                    {showDates && (
                      <p className="text-slate-500 dark:text-slate-400">
                        {item.date ? formatDisplayDate(item.date) : "—"}
                      </p>
                    )}
                    <p className="whitespace-pre-line break-words font-medium text-slate-900 dark:text-slate-100">
                      {item.description}
                      {isFixed && !allFixed && (
                        <span className="ml-2 rounded-md bg-slate-100 dark:bg-slate-950 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Flat fee
                        </span>
                      )}
                    </p>
                    {!allFixed && (
                      <p className="text-right">{isFixed ? "—" : item.hours}</p>
                    )}
                    {!allFixed && (
                      <p className="text-right">
                        {isFixed ? "—" : `$${Number(item.rate).toFixed(2)}`}
                      </p>
                    )}
                    <p className="text-right font-semibold text-slate-950 dark:text-white">
                      ${amount.toFixed(2)}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Mobile items */}
            <div className="space-y-3 md:hidden">
              {invoice.items.map((item, index) => {
                const isFixed = getItemType(item) === "fixed";
                const amount = getItemAmount(item);

                return (
                  <div
                    key={index}
                    className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-words text-sm font-medium text-slate-900 dark:text-slate-100">
                        {item.description}
                      </p>
                      <p className="shrink-0 text-sm font-bold text-slate-950 dark:text-white">
                        ${amount.toFixed(2)}
                      </p>
                    </div>

                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {item.date ? formatDisplayDate(item.date) : "—"}
                      {isFixed
                        ? " · Flat fee"
                        : ` · ${item.hours}h × $${Number(item.rate).toFixed(2)}`}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div className="mt-6 flex justify-end">
              <div className="w-full max-w-xs space-y-2 text-sm">
                {hasBreakdown && (
                  <>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Subtotal</span>
                      <span>${totals.subtotal.toFixed(2)}</span>
                    </div>

                    {totals.discountAmount > 0 && (
                      <div className="flex justify-between text-emerald-600">
                        <span>Discount</span>
                        <span>−${totals.discountAmount.toFixed(2)}</span>
                      </div>
                    )}

                    {totals.taxAmount > 0 && (
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>Tax ({invoice.taxRate}%)</span>
                        <span>${totals.taxAmount.toFixed(2)}</span>
                      </div>
                    )}
                  </>
                )}

                <div
                  className="flex items-center justify-between rounded-2xl px-5 py-4"
                  style={{ background: accent, color: accentText }}
                >
                  <span className="text-sm font-medium opacity-80">
                    Total Due
                  </span>
                  <span className="text-2xl font-bold">
                    ${invoice.total.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment notes */}
          {invoice.paymentNotes && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Payment Notes
              </p>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700 dark:text-slate-300">
                {invoice.paymentNotes}
              </p>
            </div>
          )}

          <p className="mt-8 text-center text-sm text-slate-400">
            Thank you for your business.
          </p>
        </div>
      </div>
    </div>
  );
}
