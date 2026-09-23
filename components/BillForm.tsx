"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BillItem,
  BusinessRole,
  SavedBill,
  calculateBillTotal,
  counterpartyLabel,
  generateNextBillNumber,
  getBillItemAmount,
  isBillItemComplete,
} from "@/lib/bill-of-sale-utils";
import { useToast } from "@/components/ui/Toast";
import DescriptionField from "@/components/ui/DescriptionField";

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

type SavedClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

const emptyItem: BillItem = { description: "", quantity: "1", unitPrice: "" };

export default function BillForm({
  mode,
  billId,
}: {
  mode: "create" | "edit";
  billId?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { toast } = useToast();

  const [billNumber, setBillNumber] = useState("");
  const [businessRole, setBusinessRole] = useState<BusinessRole>("seller");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [asIs, setAsIs] = useState(true);
  const [items, setItems] = useState<BillItem[]>([{ ...emptyItem }]);

  const [savedClients, setSavedClients] = useState<SavedClientRow[]>([]);
  const [isLoading, setIsLoading] = useState(mode === "edit");
  const [isSaving, setIsSaving] = useState(false);

  function getTodayDate() {
    return new Date().toISOString().split("T")[0];
  }

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      // Buyers can be prefilled from saved clients as a convenience.
      const clientsResponse = await supabase
        .from("clients")
        .select("id, name, email, phone")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setSavedClients((clientsResponse.data as SavedClientRow[]) || []);

      if (mode === "create") {
        setSaleDate(getTodayDate());

        const { data } = await supabase
          .from("bills_of_sale")
          .select("bill_number")
          .eq("user_id", user.id);

        const existing: SavedBill[] = ((data as { bill_number: string }[]) || []).map(
          (row) => ({
            billNumber: row.bill_number,
            businessRole: "seller",
            buyerName: "",
            saleDate: "",
            items: [],
            asIs: true,
            total: 0,
          })
        );

        setBillNumber(generateNextBillNumber(existing));
        setIsLoading(false);
        return;
      }

      // Edit mode: load the existing bill.
      const { data, error } = await supabase
        .from("bills_of_sale")
        .select("*")
        .eq("id", billId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error || !data) {
        console.error("Load bill error:", error);
        toast("Bill of sale not found.", "error");
        setIsLoading(false);
        return;
      }

      const row = data as BillRow;
      setBillNumber(row.bill_number);
      setBusinessRole(row.business_role === "buyer" ? "buyer" : "seller");
      setBuyerName(row.buyer_name);
      setBuyerEmail(row.buyer_email || "");
      setBuyerPhone(row.buyer_phone || "");
      setBuyerAddress(row.buyer_address || "");
      setSaleDate(row.sale_date || "");
      setPaymentMethod(row.payment_method || "");
      setNotes(row.notes || "");
      setAsIs(row.as_is !== false);
      setItems(
        Array.isArray(row.items) && row.items.length > 0
          ? row.items.map((item) => ({
              description: item.description ?? "",
              quantity: item.quantity ?? "1",
              unitPrice: item.unitPrice ?? "",
            }))
          : [{ ...emptyItem }]
      );
      setIsLoading(false);
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = useMemo(() => calculateBillTotal(items), [items]);

  function handleClientPrefill(clientId: string) {
    const client = savedClients.find((c) => c.id === clientId);
    if (!client) return;
    setBuyerName(client.name || "");
    setBuyerEmail(client.email || "");
    setBuyerPhone(client.phone || "");
  }

  function handleItemChange(index: number, field: keyof BillItem, value: string) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function handleAddItem() {
    setItems((prev) => [...prev, { ...emptyItem }]);
  }

  function handleRemoveItem(index: number) {
    if (items.length === 1) {
      toast("At least one item is required.", "error");
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const hasInvalidItem = items.some((item) => !isBillItemComplete(item));

    if (!buyerName.trim() || !billNumber.trim() || hasInvalidItem) {
      toast(
        `Add the ${counterpartyLabel(businessRole).toLowerCase()}, a document number, and a description and price for each item.`,
        "error"
      );
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast("You must be logged in.", "error");
      return;
    }

    setIsSaving(true);

    const payload = {
      bill_number: billNumber.trim().toUpperCase(),
      business_role: businessRole,
      buyer_name: buyerName.trim(),
      buyer_email: buyerEmail.trim() || null,
      buyer_phone: buyerPhone.trim() || null,
      buyer_address: buyerAddress.trim() || null,
      sale_date: saleDate || null,
      payment_method: paymentMethod.trim() || null,
      items,
      notes: notes.trim() || null,
      as_is: asIs,
      total,
    };

    if (mode === "create") {
      const { data, error } = await supabase
        .from("bills_of_sale")
        .insert([{ ...payload, user_id: user.id }])
        .select("id")
        .single();

      setIsSaving(false);

      if (error) {
        console.error("Create bill error:", error);
        toast("Error saving bill of sale.", "error");
        return;
      }

      toast(`Bill of sale ${payload.bill_number} saved.`, "success");
      setTimeout(() => router.push(`/bills/${(data as { id: string }).id}`), 500);
    } else {
      const { error } = await supabase
        .from("bills_of_sale")
        .update(payload)
        .eq("id", billId)
        .eq("user_id", user.id);

      setIsSaving(false);

      if (error) {
        console.error("Update bill error:", error);
        toast("Error updating bill of sale.", "error");
        return;
      }

      toast("Bill of sale updated.", "success");
      setTimeout(() => router.push(`/bills/${billId}`), 500);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-10 shadow-sm">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-5 py-4 text-sm text-slate-600 dark:text-slate-400">
          Loading bill of sale...
        </div>
      </div>
    );
  }

  const backHref = mode === "edit" && billId ? `/bills/${billId}` : "/bills";

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">
                InvoiceFlow
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
                {mode === "create" ? "New Bill of Sale" : "Edit Bill of Sale"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Record the seller, buyer, and item(s) being transferred.
              </p>
            </div>
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm text-emerald-200">
              Total: <span className="font-semibold">${total.toFixed(2)}</span>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 sm:px-6 lg:px-8">
          <Link
            href={backHref}
            className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-100"
          >
            ← Back
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm sm:p-6 lg:p-8">
        {/* Role toggle */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Your Role in This Sale
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Choose whether you sold the item(s) or bought them. Use{" "}
            <span className="font-medium">I&apos;m the Buyer</span> to create proof
            of a purchase when the seller gave you no paperwork.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setBusinessRole("seller")}
              className={`rounded-2xl border p-4 text-left transition ${
                businessRole === "seller"
                  ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100 dark:bg-blue-950/40"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300"
              }`}
            >
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                I&apos;m the Seller
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                You sold the item(s). Records a standard bill of sale.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setBusinessRole("buyer")}
              className={`rounded-2xl border p-4 text-left transition ${
                businessRole === "buyer"
                  ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100 dark:bg-blue-950/40"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300"
              }`}
            >
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                I&apos;m the Buyer
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                You bought the item(s). Records proof of purchase.
              </p>
            </button>
          </div>
        </div>

        {/* Counterparty */}
        <div className="mb-2">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {counterpartyLabel(businessRole)}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {businessRole === "seller"
              ? "Who is receiving the goods. Prefill from a saved client if you like."
              : "Who you bought the item(s) from. Prefill from a saved client if you like."}
          </p>
        </div>

        {savedClients.length > 0 && (
          <div className="mb-5 mt-4">
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Prefill from Saved Client
            </label>
            <select
              defaultValue=""
              onChange={(e) => handleClientPrefill(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 md:w-1/2"
            >
              <option value="">Select a saved client (optional)</option>
              {savedClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {counterpartyLabel(businessRole)} Name
            </label>
            <input
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="Full name"
              className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Document Number
            </label>
            <input
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value.toUpperCase())}
              placeholder="BOS-001"
              className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {counterpartyLabel(businessRole)} Email
            </label>
            <input
              type="email"
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              placeholder="buyer@example.com"
              className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {counterpartyLabel(businessRole)} Phone
            </label>
            <input
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(e.target.value)}
              placeholder="(555) 555-5555"
              className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {counterpartyLabel(businessRole)} Address
            </label>
            <input
              value={buyerAddress}
              onChange={(e) => setBuyerAddress(e.target.value)}
              placeholder="Street, City, State ZIP"
              className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Sale Date
            </label>
            <input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Payment Method
            </label>
            <input
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              placeholder="Cash, Bank Transfer, Zelle..."
              className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
        </div>

        {/* Items */}
        <div className="mt-8">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                Item(s) Sold
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Describe each item, its quantity, and unit price.
              </p>
            </div>
            <button
              onClick={handleAddItem}
              className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              + Add Item
            </button>
          </div>

          <div className="space-y-4">
            {items.map((item, index) => (
              <div
                key={index}
                className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 sm:p-5"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="rounded-full bg-white dark:bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 ring-1 ring-slate-200">
                    Item {index + 1}
                  </div>
                  <button
                    onClick={() => handleRemoveItem(index)}
                    className="inline-flex items-center justify-center rounded-xl bg-red-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-600"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="min-w-0">
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={item.quantity}
                      onChange={(e) =>
                        handleItemChange(index, "quantity", e.target.value)
                      }
                      className="w-full min-w-0 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Unit Price ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) =>
                        handleItemChange(index, "unitPrice", e.target.value)
                      }
                      className="w-full min-w-0 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </div>
                  <div className="col-span-2 min-w-0">
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Line Amount
                    </label>
                    <div className="flex h-[50px] w-full items-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      ${getBillItemAmount(item).toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Description
                  </label>
                  <DescriptionField
                    value={item.description}
                    onChange={(value) =>
                      handleItemChange(index, "description", value)
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notes + terms */}
        <div className="mt-6 grid gap-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Additional Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Serial numbers, condition details, special terms..."
              className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
            <input
              type="checkbox"
              checked={asIs}
              onChange={(e) => setAsIs(e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                Include &quot;as-is&quot; clause
              </span>
              <br />
              Sells the item(s) with no warranty and certifies clear ownership.
              Recommended for private sales.
            </span>
          </label>
        </div>

        {/* Save bar */}
        <div className="mt-8 rounded-3xl border border-slate-200 dark:border-slate-700 bg-slate-950 p-5 text-white shadow-sm sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-300">Total Sale Price</p>
              <p className="text-3xl font-bold">${total.toFixed(2)}</p>
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center justify-center rounded-2xl bg-white dark:bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100 transition hover:bg-slate-100 disabled:opacity-60"
            >
              {isSaving
                ? "Saving..."
                : mode === "create"
                ? "Save Bill of Sale"
                : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
