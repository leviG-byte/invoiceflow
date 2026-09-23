"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { generateBillOfSalePdf } from "@/lib/generate-bill-of-sale-pdf";
import type { BusinessProfilePdf } from "@/lib/generate-invoice-pdf";
import {
  AS_IS_CLAUSE,
  BillItem,
  SavedBill,
  calculateBillTotal,
  formatSaleDate,
  getBillItemAmount,
} from "@/lib/bill-of-sale-utils";
import {
  DEFAULT_ACCENT,
  accentTextColor,
} from "@/lib/invoice-utils";
import { useToast } from "@/components/ui/Toast";
import { CardSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { ArrowLeft, Download, Pencil } from "lucide-react";

type BillRow = {
  id: string;
  bill_number: string;
  business_role: string | null;
  buyer_name: string;
  buyer_email: string | null;
  buyer_phone: string | null;
  buyer_address: string | null;
  sale_date: string | null;
  payment_method: string | null;
  items: BillItem[] | null;
  notes: string | null;
  as_is: boolean | null;
  total: number | string | null;
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

export default function BillDetailPage() {
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();
  const params = useParams();
  const id = params.id as string;

  const [bill, setBill] = useState<SavedBill | null>(null);
  const [notFoundMessage, setNotFoundMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfilePdf>({
    businessName: "",
    email: "",
    phone: "",
    address: "",
  });

  useEffect(() => {
    async function load() {
      setIsLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setNotFoundMessage("You must be logged in.");
        setIsLoading(false);
        return;
      }

      const [billResponse, profileResponse] = await Promise.all([
        supabase
          .from("bills_of_sale")
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

      if (billResponse.error || !billResponse.data) {
        console.error("Load bill error:", billResponse.error);
        setNotFoundMessage(
          billResponse.error?.message || "Bill of sale not found."
        );
        setIsLoading(false);
        return;
      }

      const row = billResponse.data as BillRow;
      setBill({
        id: row.id,
        billNumber: row.bill_number,
        businessRole: row.business_role === "buyer" ? "buyer" : "seller",
        buyerName: row.buyer_name,
        buyerEmail: row.buyer_email || "",
        buyerPhone: row.buyer_phone || "",
        buyerAddress: row.buyer_address || "",
        saleDate: row.sale_date || "",
        paymentMethod: row.payment_method || "",
        items: Array.isArray(row.items) ? row.items : [],
        notes: row.notes || "",
        asIs: row.as_is !== false,
        total: Number(row.total) || 0,
      });

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

      setIsLoading(false);
    }

    load();
  }, [id, supabase]);

  async function handleDownloadPdf() {
    if (!bill) return;
    try {
      const pdf = await generateBillOfSalePdf(bill, businessProfile);
      pdf.save(`${bill.billNumber}.pdf`);
    } catch (error) {
      console.error(error);
      toast("There was a problem generating the PDF.", "error");
    }
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

  if (!bill) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-6 sm:px-6 lg:px-8">
            <Link
              href="/bills"
              className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
            >
              <ArrowLeft size={16} /> Back to Bills of Sale
            </Link>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">
              Bill of Sale
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              {notFoundMessage || "Bill of sale not found."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const accent = businessProfile.accentColor || DEFAULT_ACCENT;
  const accentText = accentTextColor(accent);
  const hasCustomAccent = !!businessProfile.accentColor;
  const total = bill.total || calculateBillTotal(bill.items);

  // The business (account owner) sits on one side of the sale; the counterparty
  // (buyer_* fields) on the other. Swap the two by role so a purchase renders
  // with the business as the buyer.
  const businessParty = {
    name: businessProfile.businessName || "InvoiceFlow",
    email: businessProfile.email,
    phone: businessProfile.phone,
    address: businessProfile.address,
  };
  const counterParty = {
    name: bill.buyerName,
    email: bill.buyerEmail,
    phone: bill.buyerPhone,
    address: bill.buyerAddress,
  };
  const seller = bill.businessRole === "seller" ? businessParty : counterParty;
  const buyer = bill.businessRole === "seller" ? counterParty : businessParty;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/bills"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          <ArrowLeft size={16} /> Back to Bills of Sale
        </Link>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/bills/${id}/edit`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-200 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Pencil size={15} /> Edit
          </Link>
          <button
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <Download size={15} /> Download PDF
          </button>
        </div>
      </div>

      {/* The document — always renders on white paper, even in dark mode */}
      <div className="force-light relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {hasCustomAccent ? (
          <div className="h-2" style={{ background: accent }} />
        ) : (
          <div className="h-2 bg-gradient-to-r from-slate-950 via-blue-800 to-blue-500" />
        )}

        <div className="p-6 sm:p-10">
          {/* Letterhead */}
          <div className="flex flex-col gap-6 border-b border-slate-200 pb-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
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
              <h2 className="text-xl font-bold text-slate-950">
                {businessProfile.businessName || "InvoiceFlow"}
              </h2>
              <div className="mt-2 space-y-0.5 text-sm text-slate-500">
                {businessProfile.email && <p>{businessProfile.email}</p>}
                {businessProfile.phone && <p>{businessProfile.phone}</p>}
                {businessProfile.address && <p>{businessProfile.address}</p>}
              </div>
            </div>

            <div className="text-left sm:text-right">
              <p
                className="text-3xl font-black uppercase tracking-tight sm:text-4xl"
                style={{ color: hasCustomAccent ? accent : "#0f172a" }}
              >
                Bill of Sale
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-500">
                {bill.billNumber}
              </p>
            </div>
          </div>

          {/* Seller / Buyer / details */}
          <div className="grid gap-6 border-b border-slate-200 py-8 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Seller
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {seller.name}
              </p>
              <div className="mt-1 space-y-0.5 text-sm text-slate-500">
                {seller.email && <p>{seller.email}</p>}
                {seller.phone && <p>{seller.phone}</p>}
                {seller.address && <p>{seller.address}</p>}
              </div>
            </div>

            <div className="sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Buyer
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {buyer.name}
              </p>
              <div className="mt-1 space-y-0.5 text-sm text-slate-500">
                {buyer.email && <p>{buyer.email}</p>}
                {buyer.phone && <p>{buyer.phone}</p>}
                {buyer.address && <p>{buyer.address}</p>}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Sale Date
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {formatSaleDate(bill.saleDate)}
              </p>
            </div>

            {bill.paymentMethod && (
              <div className="sm:text-right">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Payment Method
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {bill.paymentMethod}
                </p>
              </div>
            )}
          </div>

          {/* Items */}
          <div className="py-8">
            <div className="hidden grid-cols-[minmax(0,1fr)_70px_110px_110px] gap-3 border-b border-slate-200 pb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 md:grid">
              <p>Description</p>
              <p className="text-right">Qty</p>
              <p className="text-right">Unit Price</p>
              <p className="text-right">Amount</p>
            </div>

            <div className="hidden md:block">
              {bill.items.map((item, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[minmax(0,1fr)_70px_110px_110px] gap-3 border-b border-slate-100 py-4 text-sm text-slate-700"
                >
                  <p className="whitespace-pre-line break-words font-medium text-slate-900">
                    {item.description}
                  </p>
                  <p className="text-right">
                    {item.quantity === "" ? "1" : Number(item.quantity) || 0}
                  </p>
                  <p className="text-right">
                    ${Number(item.unitPrice || 0).toFixed(2)}
                  </p>
                  <p className="text-right font-semibold text-slate-950">
                    ${getBillItemAmount(item).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            {/* Mobile items */}
            <div className="space-y-3 md:hidden">
              {bill.items.map((item, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 break-words text-sm font-medium text-slate-900">
                      {item.description}
                    </p>
                    <p className="shrink-0 text-sm font-bold text-slate-950">
                      ${getBillItemAmount(item).toFixed(2)}
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {(item.quantity === "" ? "1" : Number(item.quantity) || 0)} × $
                    {Number(item.unitPrice || 0).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <div className="w-full max-w-xs">
                <div
                  className="flex items-center justify-between rounded-2xl px-5 py-4"
                  style={{ background: accent, color: accentText }}
                >
                  <span className="text-sm font-medium opacity-80">
                    Total Sale Price
                  </span>
                  <span className="text-2xl font-bold">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* As-is clause */}
          {bill.asIs && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Terms of Sale
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {AS_IS_CLAUSE}
              </p>
            </div>
          )}

          {/* Notes */}
          {bill.notes && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Additional Notes
              </p>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
                {bill.notes}
              </p>
            </div>
          )}

          {/* Signatures */}
          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            <div>
              <div className="h-10 border-b border-slate-400" />
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                Seller Signature
              </p>
              <p className="mt-1 text-sm text-slate-600">{seller.name}</p>
            </div>
            <div>
              <div className="h-10 border-b border-slate-400" />
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                Buyer Signature
              </p>
              <p className="mt-1 text-sm text-slate-600">{buyer.name}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
