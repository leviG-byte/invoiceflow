"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { generateInvoicePdf } from "@/lib/generate-invoice-pdf";
import {
  InvoiceItem,
  SavedInvoice,
  getDisplayStatus,
  getStatusClasses,
} from "@/lib/invoice-utils";

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
};

type DatabaseBusinessProfileRow = {
  id: string;
  user_id: string;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
};

type InvoiceDetail = SavedInvoice & {
  paymentMethod?: string;
  paymentDate?: string;
};

export default function InvoiceDetailPage() {
  const supabase = useMemo(() => createClient(), []);
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [message, setMessage] = useState("");
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
      setMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error("User error:", userError);
        setMessage("You must be logged in.");
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
        setMessage(invoiceError?.message || "Invoice not found.");
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
        items: Array.isArray(row.items)
          ? row.items.map((item) => ({
              date: item.date ?? "",
              description: item.description ?? "",
              hours: item.hours ?? "",
              rate: item.rate ?? "",
            }))
          : [],
        paymentNotes: row.payment_notes || "",
        paymentMethod: row.payment_method || "",
        paymentDate: row.payment_date || "",
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
  }, [invoice, searchParams]);

  async function handleDownloadPDF(currentInvoice: InvoiceDetail) {
    try {
      const pdf = await generateInvoicePdf(currentInvoice, businessProfile);
      pdf.save(`${currentInvoice.invoiceNumber}.pdf`);
    } catch (error) {
      console.error(error);
      setMessage("There was a problem generating the PDF.");
    }
  }

  async function handleSendInvoice() {
    if (!invoice) return;

    try {
      setIsSending(true);
      setMessage("Preparing invoice...");

      const clientEmail = invoice.clientEmail?.trim();

      if (!clientEmail) {
        throw new Error("This client does not have an email address.");
      }

      const paymentMethodHtml = invoice.paymentMethod?.trim()
        ? `<p style="margin: 4px 0;"><strong>Payment Method:</strong> ${invoice.paymentMethod}</p>`
        : "";

      const paymentDateHtml = invoice.paymentDate?.trim()
        ? `<p style="margin: 4px 0;"><strong>Payment Date:</strong> ${invoice.paymentDate}</p>`
        : "";

      const paymentNotesHtml = invoice.paymentNotes?.trim()
        ? `
          <div style="margin: 16px 0; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; background: #ffffff;">
            <p style="margin: 4px 0 8px 0;"><strong>Payment Notes:</strong></p>
            <p style="margin: 0; white-space: pre-line;">${invoice.paymentNotes}</p>
          </div>
        `
        : "";

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
          <h2 style="margin-bottom: 8px;">Invoice ${invoice.invoiceNumber}</h2>
          <p>Hello ${invoice.clientName},</p>
          <p>Please find your invoice details below.</p>

          <div style="margin: 16px 0; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb;">
            <p style="margin: 4px 0;"><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
            <p style="margin: 4px 0;"><strong>Issue Date:</strong> ${invoice.issueDate}</p>
            <p style="margin: 4px 0;"><strong>Due Date:</strong> ${invoice.dueDate}</p>
            ${paymentMethodHtml}
            ${paymentDateHtml}
            <p style="margin: 4px 0;"><strong>Total:</strong> $${Number(invoice.total || 0).toFixed(2)}</p>
            <p style="margin: 4px 0;"><strong>Status:</strong> ${invoice.status}</p>
          </div>

          ${paymentNotesHtml}

          <p>Thank you.</p>
        </div>
      `;

      const response = await fetch("/api/send-invoice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: clientEmail,
          subject: `Invoice ${invoice.invoiceNumber}`,
          html: emailHtml,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to send invoice");
      }

      setMessage("Invoice sent successfully 🚀");
    } catch (error) {
      console.error("Send invoice error:", error);
      setMessage(
        error instanceof Error ? error.message : "Failed to send invoice"
      );
    } finally {
      setIsSending(false);
    }
  }

  function formatDisplayDate(dateString?: string) {
    if (!dateString) return "";

    const [year, month, day] = dateString.split("-");
    if (!year || !month || !day) return dateString;

    return `${month}/${day}/${year}`;
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-6 sm:px-6 lg:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">
              InvoiceFlow
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
              Invoice Details
            </h1>
            <p className="mt-2 text-sm text-slate-300">Loading invoice...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="space-y-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-6 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4">
              <Link
                href="/invoices"
                className="inline-flex w-fit items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
              >
                ← Back to Invoices
              </Link>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">
                  InvoiceFlow
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
                  Invoice Details
                </h1>
                <p className="mt-2 text-sm text-slate-300">
                  {message || "Invoice not found."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayStatus = getDisplayStatus(invoice);
  const showPaidBadge = displayStatus === "Paid" && !!invoice.paymentDate;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/invoices"
                className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
              >
                ← Back to Invoices
              </Link>

              <Link
                href={`/invoices/${id}/edit`}
                className="inline-flex items-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
              >
                Edit Invoice
              </Link>

              <button
                onClick={() => handleDownloadPDF(invoice)}
                className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Download PDF
              </button>

              <button
                onClick={handleSendInvoice}
                disabled={isSending}
                className="inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSending ? "Sending..." : "Send Invoice"}
              </button>
            </div>

            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">
                  InvoiceFlow
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
                  {invoice.invoiceNumber}
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-300">
                  Review invoice details, payment status, client information, and
                  line items in one place.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                    displayStatus
                  )}`}
                >
                  {displayStatus}
                </span>

                {showPaidBadge && (
                  <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                    Paid on {formatDisplayDate(invoice.paymentDate)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-slate-200 bg-white px-5 py-5 sm:grid-cols-2 xl:grid-cols-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-500">Client</p>
            <p className="mt-2 text-lg font-bold text-slate-950 break-words">
              {invoice.clientName}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-500">Issue Date</p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {invoice.issueDate || "-"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-500">Due Date</p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              {invoice.dueDate || "-"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-500">Total</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              ${invoice.total.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_380px]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                {businessProfile.logoUrl && (
                  <img
                    src={businessProfile.logoUrl}
                    alt="Business Logo"
                    className="mb-4 max-h-20 max-w-[220px] object-contain"
                  />
                )}

                <h2 className="text-2xl font-bold text-slate-950">
                  {businessProfile.businessName || "InvoiceFlow"}
                </h2>

                <div className="mt-3 space-y-1 text-sm text-slate-600">
                  {businessProfile.email && <p>{businessProfile.email}</p>}
                  {businessProfile.phone && <p>{businessProfile.phone}</p>}
                  {businessProfile.address && <p>{businessProfile.address}</p>}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:min-w-[220px]">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Invoice Number
                </p>
                <p className="mt-2 text-lg font-bold text-slate-950">
                  {invoice.invoiceNumber}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Bill To
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {invoice.clientName}
              </p>
              {invoice.clientEmail && (
                <p className="mt-1 text-sm text-slate-600">{invoice.clientEmail}</p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
              <h2 className="text-xl font-semibold text-slate-950">Invoice Items</h2>
              <p className="mt-1 text-sm text-slate-500">
                Detailed breakdown of services, hours, and line totals.
              </p>
            </div>

            <div className="hidden md:block">
              <div className="grid grid-cols-5 bg-slate-50 px-6 py-4 text-sm font-semibold text-slate-700">
                <p>Date</p>
                <p>Description</p>
                <p className="text-center">Hours</p>
                <p className="text-center">Rate</p>
                <p className="text-right">Amount</p>
              </div>

              {invoice.items.map((item, index) => {
                const amount =
                  (Number(item.hours) || 0) * (Number(item.rate) || 0);

                return (
                  <div
                    key={index}
                    className="grid grid-cols-5 border-t border-slate-100 px-6 py-4 text-sm text-slate-700"
                  >
                    <p>{item.date || "-"}</p>
                    <p className="break-words">{item.description}</p>
                    <p className="text-center">{item.hours}</p>
                    <p className="text-center">${Number(item.rate).toFixed(2)}</p>
                    <p className="text-right font-semibold text-slate-950">
                      ${amount.toFixed(2)}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="space-y-4 p-4 md:hidden">
              {invoice.items.map((item, index) => {
                const amount =
                  (Number(item.hours) || 0) * (Number(item.rate) || 0);

                return (
                  <div
                    key={index}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Date
                        </p>
                        <p className="mt-1 text-sm text-slate-900">
                          {item.date || "-"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Description
                        </p>
                        <p className="mt-1 text-sm text-slate-900">
                          {item.description}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Hours
                        </p>
                        <p className="mt-1 text-sm text-slate-900">
                          {item.hours}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Rate
                        </p>
                        <p className="mt-1 text-sm text-slate-900">
                          ${Number(item.rate).toFixed(2)}
                        </p>
                      </div>

                      <div className="sm:col-span-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Amount
                        </p>
                        <p className="mt-1 text-base font-semibold text-slate-950">
                          ${amount.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {invoice.paymentNotes && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Payment Notes
              </p>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-800">
                {invoice.paymentNotes}
              </p>
            </div>
          )}

          {message && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-700">{message}</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-950">Invoice Summary</h2>

            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-500">Status</span>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                    displayStatus
                  )}`}
                >
                  {displayStatus}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-500">Issue Date</span>
                <span className="text-sm font-medium text-slate-900">
                  {invoice.issueDate || "-"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-500">Due Date</span>
                <span className="text-sm font-medium text-slate-900">
                  {invoice.dueDate || "-"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-500">Payment Method</span>
                <span className="text-sm font-medium text-slate-900">
                  {invoice.paymentMethod || "-"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-500">Payment Date</span>
                <span className="text-sm font-medium text-slate-900">
                  {invoice.paymentDate
                    ? formatDisplayDate(invoice.paymentDate)
                    : "-"}
                </span>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center justify-between text-lg font-bold text-slate-950">
                  <span>Total</span>
                  <span>${invoice.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {(invoice.paymentMethod || invoice.paymentDate) && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-950">
                Payment Summary
              </h2>

              <div className="mt-5 grid gap-4">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Method
                  </p>
                  <p className="mt-2 text-sm text-slate-900">
                    {invoice.paymentMethod || "-"}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Paid On
                  </p>
                  <p className="mt-2 text-sm text-slate-900">
                    {invoice.paymentDate
                      ? formatDisplayDate(invoice.paymentDate)
                      : "-"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}