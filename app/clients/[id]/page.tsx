"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  InvoiceItem,
  SavedInvoice,
  getDisplayStatus,
  getInitials,
  getStatusClasses,
} from "@/lib/invoice-utils";
import { useToast } from "@/components/ui/Toast";
import { CardSkeleton, StatCardSkeleton } from "@/components/ui/Skeleton";
import { ArrowLeft, Mail, Phone, FileText, Plus } from "lucide-react";

type DatabaseClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  rate: number | string | null;
  default_payment_method: string | null;
  default_payment_notes: string | null;
  created_at: string | null;
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
  payment_date: string | null;
  created_at: string | null;
};

type UIInvoice = SavedInvoice & { id: string; paymentDate?: string };

export default function ClientDetailPage() {
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();
  const params = useParams();
  const id = params.id as string;

  const [client, setClient] = useState<DatabaseClientRow | null>(null);
  const [invoices, setInvoices] = useState<UIInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function loadClient() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setIsLoading(false);
        setNotFound(true);
        return;
      }

      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (clientError || !clientData) {
        console.error("Load client error:", clientError);
        setIsLoading(false);
        setNotFound(true);
        return;
      }

      const row = clientData as DatabaseClientRow;
      setClient(row);

      // Invoices are linked to clients by name (legacy schema choice).
      const { data: invoiceData, error: invoiceError } = await supabase
        .from("invoices")
        .select("*")
        .eq("user_id", user.id)
        .eq("client_name", row.name)
        .order("created_at", { ascending: false });

      if (invoiceError) {
        console.error("Load client invoices error:", invoiceError);
        toast("Could not load this client's invoices.", "error");
      } else {
        setInvoices(
          ((invoiceData as DatabaseInvoiceRow[]) || []).map((invoice) => ({
            id: invoice.id,
            clientName: invoice.client_name,
            invoiceNumber: invoice.invoice_number,
            issueDate: invoice.issue_date || "",
            dueDate: invoice.due_date || "",
            status: invoice.status === "Paid" ? "Paid" : "Pending",
            items: Array.isArray(invoice.items) ? invoice.items : [],
            paymentDate: invoice.payment_date || "",
            total: Number(invoice.total) || 0,
          }))
        );
      }

      setIsLoading(false);
    }

    loadClient();
  }, [id, supabase, toast]);

  const stats = useMemo(() => {
    let totalBilled = 0;
    let outstanding = 0;
    let paidCount = 0;
    let overdueCount = 0;

    invoices.forEach((invoice) => {
      const displayStatus = getDisplayStatus(invoice);
      totalBilled += invoice.total;

      if (displayStatus === "Paid") {
        paidCount += 1;
      } else {
        outstanding += invoice.total;
        if (displayStatus === "Overdue") overdueCount += 1;
      }
    });

    return { totalBilled, outstanding, paidCount, overdueCount };
  }, [invoices]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <CardSkeleton lines={3} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <CardSkeleton lines={6} />
      </div>
    );
  }

  if (notFound || !client) {
    return (
      <div className="space-y-6">
        <Link
          href="/clients"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          <ArrowLeft size={16} /> Back to Clients
        </Link>

        <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center shadow-sm">
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Client not found</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            This client may have been deleted, or the link is incorrect.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/clients"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          <ArrowLeft size={16} /> Back to Clients
        </Link>

        <Link
          href="/new-invoice"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
        >
          <Plus size={15} /> New Invoice
        </Link>
      </div>

      {/* Client header */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-white/10 text-xl font-bold text-white ring-1 ring-white/15">
              {getInitials(client.name)}
            </div>

            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight text-white">
                {client.name}
              </h1>

              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-300">
                {client.email && (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail size={14} /> {client.email}
                  </span>
                )}
                {client.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone size={14} /> {client.phone}
                  </span>
                )}
                {Number(client.rate) > 0 && (
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-0.5 font-semibold text-white">
                    ${Number(client.rate)}/hr
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-5 sm:grid-cols-2 xl:grid-cols-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-5">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Billed</p>
            <p className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">
              ${stats.totalBilled.toFixed(2)}
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Across {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Outstanding</p>
            <p className="mt-2 text-3xl font-bold text-amber-600">
              ${stats.outstanding.toFixed(2)}
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Unpaid balance</p>
          </div>

          <div className="rounded-2xl border border-green-200 bg-green-50/40 p-5">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Paid Invoices</p>
            <p className="mt-2 text-3xl font-bold text-green-600">
              {stats.paidCount}
            </p>
          </div>

          <div className="rounded-2xl border border-red-200 bg-red-50/40 p-5">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Overdue</p>
            <p className="mt-2 text-3xl font-bold text-red-600">
              {stats.overdueCount}
            </p>
          </div>
        </div>
      </div>

      {/* Payment defaults */}
      {(client.default_payment_method || client.default_payment_notes) && (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
            Payment Defaults
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {client.default_payment_method && (
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Method
                </p>
                <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">
                  {client.default_payment_method}
                </p>
              </div>
            )}

            {client.default_payment_notes && (
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Notes
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">
                  {client.default_payment_notes}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invoice history */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div className="border-b border-slate-200 dark:border-slate-700 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
            Invoice History
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Every invoice billed to {client.name}.
          </p>
        </div>

        {invoices.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="mx-auto text-slate-300" size={36} />
            <p className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">
              No invoices yet
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Create the first invoice for this client to start tracking.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {invoices.map((invoice) => {
              const displayStatus = getDisplayStatus(invoice);

              return (
                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-slate-50 sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950 dark:text-white">
                      {invoice.invoiceNumber}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                      {invoice.issueDate || "No issue date"}
                      {invoice.dueDate ? ` · Due ${invoice.dueDate}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-950 dark:text-white">
                      ${invoice.total.toFixed(2)}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                        displayStatus
                      )}`}
                    >
                      {displayStatus}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
