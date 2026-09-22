"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BillItem,
  SavedBill,
  formatSaleDate,
  generateNextBillNumber,
} from "@/lib/bill-of-sale-utils";
import { getInitials } from "@/lib/invoice-utils";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { StatCardSkeleton, TableRowSkeleton } from "@/components/ui/Skeleton";

type BillRow = {
  id: string;
  bill_number: string;
  buyer_name: string;
  buyer_email: string | null;
  sale_date: string | null;
  items: BillItem[] | null;
  total: number | string | null;
  created_at?: string;
};

type UIBill = SavedBill & { id: string };

function mapRowToUI(row: BillRow): UIBill {
  return {
    id: row.id,
    billNumber: row.bill_number,
    buyerName: row.buyer_name,
    buyerEmail: row.buyer_email || "",
    saleDate: row.sale_date || "",
    items: Array.isArray(row.items) ? row.items : [],
    asIs: true,
    total: Number(row.total) || 0,
  };
}

export default function BillsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();
  const [bills, setBills] = useState<UIBill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [pendingDelete, setPendingDelete] = useState<UIBill | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    async function loadBills() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("bills_of_sale")
        .select("id, bill_number, buyer_name, buyer_email, sale_date, items, total, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setIsLoading(false);

      if (error) {
        console.error("Load bills error:", error);
        toast("Could not load bills of sale.", "error");
        return;
      }

      setBills(((data as BillRow[]) || []).map(mapRowToUI));
    }

    loadBills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function performDelete() {
    if (!pendingDelete) return;
    const bill = pendingDelete;
    setIsDeleting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast("You must be logged in.", "error");
      setIsDeleting(false);
      setPendingDelete(null);
      return;
    }

    const { error } = await supabase
      .from("bills_of_sale")
      .delete()
      .eq("id", bill.id)
      .eq("user_id", user.id);

    setIsDeleting(false);
    setPendingDelete(null);

    if (error) {
      console.error("Delete bill error:", error);
      toast("Could not delete bill of sale.", "error");
      return;
    }

    setBills((prev) => prev.filter((b) => b.id !== bill.id));
    toast(`Bill of sale ${bill.billNumber} deleted.`, "success");
  }

  const filteredBills = useMemo(() => {
    let filtered = [...bills];
    const term = searchTerm.trim().toLowerCase();

    if (term) {
      filtered = filtered.filter(
        (bill) =>
          bill.buyerName.toLowerCase().includes(term) ||
          bill.billNumber.toLowerCase().includes(term)
      );
    }

    filtered.sort((a, b) => {
      if (sortBy === "newest")
        return new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime();
      if (sortBy === "oldest")
        return new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime();
      if (sortBy === "highest") return b.total - a.total;
      if (sortBy === "lowest") return a.total - b.total;
      if (sortBy === "buyer-az") return a.buyerName.localeCompare(b.buyerName);
      return 0;
    });

    return filtered;
  }, [bills, searchTerm, sortBy]);

  const nextNumber = useMemo(() => generateNextBillNumber(bills), [bills]);
  const totalValue = bills.reduce((sum, bill) => sum + bill.total, 0);

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
                Bills of Sale
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Record the sale and transfer of goods to a buyer, with an
                as-is clause and downloadable PDF.
              </p>
            </div>

            <Link
              href="/bills/new"
              className="inline-flex items-center justify-center rounded-2xl bg-white dark:bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-950 dark:text-white transition hover:bg-slate-100"
            >
              + New Bill of Sale
            </Link>
          </div>
        </div>

        <div className="grid gap-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-5 sm:grid-cols-3 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-5">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Bills</p>
            <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">
              {bills.length}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-5">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Value</p>
            <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">
              ${totalValue.toFixed(2)}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Next Number</p>
            <p className="mt-2 text-2xl font-bold text-emerald-600">{nextNumber}</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-200">
              Search
            </label>
            <input
              type="text"
              placeholder="Search by buyer or document #"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-200">
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="highest">Highest Value</option>
              <option value="lowest">Lowest Value</option>
              <option value="buyer-az">Buyer A-Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-4 md:hidden">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : filteredBills.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center shadow-sm">
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
              No bills of sale yet
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Create your first bill of sale to record a transfer of goods.
            </p>
            <Link
              href="/bills/new"
              className="mt-4 inline-flex rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              New Bill of Sale
            </Link>
          </div>
        ) : (
          filteredBills.map((bill) => (
            <div
              key={bill.id}
              className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-white">
                  {getInitials(bill.buyerName)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-slate-950 dark:text-white">
                    {bill.buyerName}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {bill.billNumber}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 dark:bg-slate-800 p-4 text-sm">
                <div>
                  <p className="font-medium text-slate-500 dark:text-slate-400">Sale Date</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatSaleDate(bill.saleDate)}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-slate-500 dark:text-slate-400">Total</p>
                  <p className="font-bold text-slate-950 dark:text-white">
                    ${bill.total.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <Link
                  href={`/bills/${bill.id}`}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2.5 text-center text-sm font-semibold text-slate-800 dark:text-slate-200 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  View
                </Link>
                <Link
                  href={`/bills/${bill.id}/edit`}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2.5 text-center text-sm font-semibold text-slate-800 dark:text-slate-200 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Edit
                </Link>
                <button
                  onClick={() => setPendingDelete(bill)}
                  className="rounded-xl border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                >
                  Delete
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
              <th className="px-5 py-4 font-semibold">Buyer</th>
              <th className="px-5 py-4 font-semibold">Document #</th>
              <th className="px-5 py-4 font-semibold">Sale Date</th>
              <th className="px-5 py-4 font-semibold">Total</th>
              <th className="px-5 py-4 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="p-0">
                  <TableRowSkeleton cols={5} />
                  <TableRowSkeleton cols={5} />
                  <TableRowSkeleton cols={5} />
                </td>
              </tr>
            ) : filteredBills.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12">
                  <div className="text-center">
                    <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      No bills of sale yet
                    </p>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                      Create your first bill of sale to record a transfer of goods.
                    </p>
                    <Link
                      href="/bills/new"
                      className="mt-4 inline-flex rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      New Bill of Sale
                    </Link>
                  </div>
                </td>
              </tr>
            ) : (
              filteredBills.map((bill) => (
                <tr key={bill.id} className="transition hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-white">
                        {getInitials(bill.buyerName)}
                      </div>
                      <span className="font-semibold text-slate-950 dark:text-white">
                        {bill.buyerName}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-700 dark:text-slate-300">
                    {bill.billNumber}
                  </td>
                  <td className="px-5 py-4 text-slate-700 dark:text-slate-300">
                    {formatSaleDate(bill.saleDate)}
                  </td>
                  <td className="px-5 py-4 font-bold text-slate-950 dark:text-white">
                    ${bill.total.toFixed(2)}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/bills/${bill.id}`}
                        className="rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-200 transition hover:border-slate-400 hover:bg-slate-50"
                      >
                        View
                      </Link>
                      <Link
                        href={`/bills/${bill.id}/edit`}
                        className="rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-200 transition hover:border-slate-400 hover:bg-slate-50"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => setPendingDelete(bill)}
                        className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete bill of sale ${pendingDelete?.billNumber ?? ""}?`}
        description="This permanently removes the bill of sale and cannot be undone."
        confirmLabel="Delete Bill of Sale"
        destructive
        busy={isDeleting}
        onConfirm={performDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
