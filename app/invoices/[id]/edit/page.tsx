"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  InvoiceItem,
  InvoiceItemType,
  InvoiceStatus,
  calculateInvoiceTotals,
  getItemType,
  isItemComplete,
  sortItemsByDate,
} from "@/lib/invoice-utils";
import { useToast } from "@/components/ui/Toast";
import DescriptionField from "@/components/ui/DescriptionField";

type SavedClient = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  rate: string | number;
  defaultPaymentMethod?: string;
  defaultPaymentNotes?: string;
};

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
  name: string;
  email: string | null;
  phone: string | null;
  rate: number | string | null;
  default_payment_method: string | null;
  default_payment_notes: string | null;
};

export default function EditInvoicePage() {
  const supabase = useMemo(() => createClient(), []);
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;

  const [clientName, setClientName] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [savedClients, setSavedClients] = useState<SavedClient[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<InvoiceStatus>("Pending");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [discount, setDiscount] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([
    { date: "", description: "", hours: "", rate: "", type: "hourly", amount: "" },
  ]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  function getTodayDate() {
    return new Date().toISOString().split("T")[0];
  }

  function mapDatabaseClientToUI(client: DatabaseClientRow): SavedClient {
    return {
      id: client.id,
      name: client.name,
      email: client.email || "",
      phone: client.phone || "",
      rate:
        client.rate !== null && client.rate !== undefined
          ? String(client.rate)
          : "",
      defaultPaymentMethod: client.default_payment_method || "",
      defaultPaymentNotes: client.default_payment_notes || "",
    };
  }

  function getStatusBadgeClasses(currentStatus: InvoiceStatus) {
    return currentStatus === "Paid"
      ? "border border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
      : "border border-amber-400/30 bg-amber-500/15 text-amber-100";
  }

  function getStatusCardClasses(currentStatus: InvoiceStatus) {
    return currentStatus === "Paid"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-amber-200 bg-amber-50 text-amber-700";
  }

  useEffect(() => {
    async function loadInvoice() {
      setIsLoading(true);

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

      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error || !data) {
        console.error("Load invoice error:", error);
        setMessage(error?.message || "Invoice not found.");
        setIsLoading(false);
        return;
      }

      const invoice = data as DatabaseInvoiceRow;

      setClientName(invoice.client_name);
      setSelectedClient(invoice.client_name);
      setInvoiceNumber(invoice.invoice_number);
      setIssueDate(invoice.issue_date || "");
      setDueDate(invoice.due_date || "");
      setStatus(
        invoice.payment_date
          ? "Paid"
          : invoice.status === "Paid"
          ? "Paid"
          : "Pending"
      );
      setPaymentNotes(invoice.payment_notes || "");
      setPaymentMethod(invoice.payment_method || "");
      setPaymentDate(invoice.payment_date || "");
      setTaxRate(Number(invoice.tax_rate) ? String(invoice.tax_rate) : "");
      setDiscount(Number(invoice.discount) ? String(invoice.discount) : "");

      setItems(
        Array.isArray(invoice.items) && invoice.items.length > 0
          ? invoice.items.map((item) => ({
              date: item.date ?? "",
              description: item.description ?? "",
              hours: item.hours ?? "",
              rate: item.rate ?? "",
              type: getItemType(item),
              amount: item.amount ?? "",
            }))
          : [{ date: "", description: "", hours: "", rate: "", type: "hourly" as const, amount: "" }]
      );

      setIsLoading(false);
    }

    async function loadClients() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Load clients error:", error);
        return;
      }

      const formattedClients = ((data as DatabaseClientRow[]) || []).map(
        mapDatabaseClientToUI
      );

      setSavedClients(formattedClients);
    }

    loadInvoice();
    loadClients();
  }, [id, supabase]);

  const totals = useMemo(
    () =>
      calculateInvoiceTotals(items, Number(taxRate) || 0, Number(discount) || 0),
    [items, taxRate, discount]
  );

  const total = totals.total;

  function handleClientSelect(value: string) {
    setSelectedClient(value);

    const selected = savedClients.find((client) => client.name === value);

    if (selected) {
      setClientName(selected.name);
      setPaymentMethod(selected.defaultPaymentMethod || "");
      setPaymentNotes(selected.defaultPaymentNotes || "");

      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          rate: String(selected.rate),
        }))
      );
    } else {
      setClientName(value);
      setPaymentMethod("");
      setPaymentNotes("");
    }
  }

  function handleStatusChange(newStatus: InvoiceStatus) {
    setStatus(newStatus);

    if (newStatus === "Paid" && !paymentDate) {
      setPaymentDate(getTodayDate());
    }

    if (newStatus === "Pending") {
      setPaymentDate("");
    }
  }

  function handlePaymentDateChange(value: string) {
    setPaymentDate(value);

    if (value) {
      setStatus("Paid");
    } else {
      setStatus("Pending");
    }
  }

  function handleItemChange(
    index: number,
    field: keyof InvoiceItem,
    value: string
  ) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function handleAddItem() {
    const selected = savedClients.find(
      (client) => client.name === selectedClient
    );

    const previousRate = items.length > 0 ? items[items.length - 1].rate : "";
    const autoRate = selected ? String(selected.rate) : previousRate;

    const inheritedType =
      items.length > 0 ? getItemType(items[items.length - 1]) : "hourly";

    setItems((prev) => [
      ...prev,
      { date: "", description: "", hours: "", rate: autoRate, type: inheritedType, amount: "" },
    ]);
  }

  function handleItemTypeChange(index: number, type: InvoiceItemType) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, type } : item))
    );
  }

  function handleRemoveItem(index: number) {
    if (items.length === 1) {
      toast("At least one invoice item is required.", "error");
      return;
    }

    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleUpdateInvoice() {
    const hasInvalidItem = items.some((item) => !isItemComplete(item));

    const finalStatus: InvoiceStatus = paymentDate ? "Paid" : status;

    if (!clientName || !invoiceNumber || hasInvalidItem) {
      toast("Please complete all fields.", "error");
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("User error:", userError);
      toast("You must be logged in.", "error");
      return;
    }

    const { error } = await supabase
      .from("invoices")
      .update({
        client_name: clientName,
        invoice_number: invoiceNumber,
        issue_date: issueDate || null,
        due_date: dueDate || null,
        status: finalStatus,
        items: sortItemsByDate(items),
        payment_notes: paymentNotes || null,
        payment_method: paymentMethod || null,
        payment_date: paymentDate || null,
        tax_rate: Number(taxRate) || 0,
        discount: Number(discount) || 0,
        total,
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("Update invoice error:", error);
      toast(error.message || "Error updating invoice.", "error");
      return;
    }

    toast("Invoice updated successfully.", "success");

    setTimeout(() => {
      router.push(`/invoices/${id}`);
    }, 700);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            href={`/invoices/${id}`}
            className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            ← Back to Invoice
          </Link>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 px-6 py-8 sm:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-blue-200/90">
                  InvoiceFlow
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Edit Invoice
                </h1>
                <p className="mt-3 max-w-2xl text-sm text-slate-200 sm:text-base">
                  Update invoice details, payment info, and line items while
                  keeping the same clean style across the app.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <div
                  className={`rounded-2xl px-4 py-3 backdrop-blur ${getStatusBadgeClasses(
                    status
                  )}`}
                >
                  <p className="text-xs font-medium uppercase tracking-wide opacity-80">
                    Status
                  </p>
                  <p className="mt-1 text-sm font-semibold">{status}</p>
                </div>

                <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-300">
                    Total
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    ${total.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="px-6 py-10 sm:px-8">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
                Loading invoice...
              </div>
            </div>
          ) : (
            <>
              <div className="px-6 py-6 sm:px-8 sm:py-8">
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-6">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                      <div className="mb-5">
                        <h2 className="text-xl font-semibold text-slate-900">
                          Invoice Details
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                          Basic invoice info, client selection, dates, and
                          payment status.
                        </p>
                      </div>

                      <div className="grid gap-5 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">
                            Saved Client
                          </label>
                          <select
                            value={selectedClient}
                            onChange={(e) => handleClientSelect(e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                          >
                            <option value="">Select a client</option>
                            {savedClients.map((client) => (
                              <option key={client.id} value={client.name}>
                                {client.name} — ${client.rate}/hr
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">
                            Client Name
                          </label>
                          <input
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">
                            Invoice Number
                          </label>
                          <input
                            value={invoiceNumber}
                            onChange={(e) => setInvoiceNumber(e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">
                            Status
                          </label>
                          <select
                            value={status}
                            onChange={(e) =>
                              handleStatusChange(
                                e.target.value as InvoiceStatus
                              )
                            }
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                          >
                            <option value="Pending">Pending</option>
                            <option value="Paid">Paid</option>
                          </select>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">
                            Issue Date
                          </label>
                          <input
                            type="date"
                            value={issueDate}
                            onChange={(e) => setIssueDate(e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">
                            Due Date
                          </label>
                          <input
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">
                            Payment Method
                          </label>
                          <input
                            type="text"
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            placeholder="Zelle, Bank Transfer, Cash, PayPal..."
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">
                            Payment Date
                          </label>
                          <input
                            type="date"
                            value={paymentDate}
                            onChange={(e) =>
                              handlePaymentDateChange(e.target.value)
                            }
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">
                            Tax Rate (%)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0"
                            value={taxRate}
                            onChange={(e) => setTaxRate(e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">
                            Discount ($)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0"
                            value={discount}
                            onChange={(e) => setDiscount(e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                          />
                        </div>
                      </div>

                      <div className="mt-5">
                        <label className="mb-2 block text-sm font-medium text-slate-700">
                          Payment Notes
                        </label>
                        <textarea
                          value={paymentNotes}
                          onChange={(e) => setPaymentNotes(e.target.value)}
                          rows={4}
                          placeholder="Example: Zelle, bank transfer details, payment instructions, late fee note..."
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h2 className="text-xl font-semibold text-slate-900">
                            Invoice Items
                          </h2>
                          <p className="mt-1 text-sm text-slate-500">
                            Add services, hours, rates, and review amounts per
                            row.
                          </p>
                        </div>

                        <button
                          onClick={handleAddItem}
                          className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                        >
                          + Add Row
                        </button>
                      </div>

                      <div className="space-y-4">
                        {items.map((item, index) => {
                          const itemType = getItemType(item);
                          const amount =
                            itemType === "fixed"
                              ? Number(item.amount) || 0
                              : (Number(item.hours) || 0) *
                                (Number(item.rate) || 0);

                          return (
                            <div
                              key={index}
                              className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5"
                            >
                              <div className="mb-4 flex items-center justify-between">
                                <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                                  Item {index + 1}
                                </div>

                                <button
                                  onClick={() => handleRemoveItem(index)}
                                  className="inline-flex items-center justify-center rounded-xl bg-red-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-600"
                                >
                                  Remove
                                </button>
                              </div>

                              <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
                                <div className="min-w-0">
                                  <label className="mb-2 block text-sm font-medium text-slate-700">
                                    Type
                                  </label>
                                  <select
                                    value={itemType}
                                    onChange={(e) =>
                                      handleItemTypeChange(
                                        index,
                                        e.target.value as InvoiceItemType
                                      )
                                    }
                                    className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                                  >
                                    <option value="hourly">Hourly</option>
                                    <option value="fixed">Flat Fee</option>
                                  </select>
                                </div>

                                <div className="min-w-0">
                                  <label className="mb-2 block text-sm font-medium text-slate-700">
                                    Date
                                  </label>
                                  <input
                                    type="date"
                                    value={item.date}
                                    onChange={(e) =>
                                      handleItemChange(
                                        index,
                                        "date",
                                        e.target.value
                                      )
                                    }
                                    className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                                  />
                                </div>

                                {itemType === "fixed" ? (
                                  <div className="min-w-0 xl:col-span-2">
                                    <label className="mb-2 block text-sm font-medium text-slate-700">
                                      Flat Amount ($)
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={item.amount || ""}
                                      onChange={(e) =>
                                        handleItemChange(
                                          index,
                                          "amount",
                                          e.target.value
                                        )
                                      }
                                      className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                                    />
                                  </div>
                                ) : (
                                  <>
                                    <div className="min-w-0">
                                      <label className="mb-2 block text-sm font-medium text-slate-700">
                                        Hours
                                      </label>
                                      <input
                                        type="number"
                                        value={item.hours}
                                        onChange={(e) =>
                                          handleItemChange(
                                            index,
                                            "hours",
                                            e.target.value
                                          )
                                        }
                                        className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                                      />
                                    </div>

                                    <div className="min-w-0">
                                      <label className="mb-2 block text-sm font-medium text-slate-700">
                                        Rate
                                      </label>
                                      <input
                                        type="number"
                                        value={item.rate}
                                        onChange={(e) =>
                                          handleItemChange(
                                            index,
                                            "rate",
                                            e.target.value
                                          )
                                        }
                                        className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                                      />
                                    </div>
                                  </>
                                )}

                                <div className="min-w-0">
                                  <label className="mb-2 block text-sm font-medium text-slate-700">
                                    Amount
                                  </label>
                                  <div className="flex h-[50px] w-full min-w-0 items-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm">
                                    <span className="block w-full min-w-0 whitespace-nowrap">
                                      ${amount.toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-4 min-w-0">
                                <label className="mb-2 block text-sm font-medium text-slate-700">
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
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:sticky xl:top-6">
                      <h2 className="text-xl font-semibold text-slate-900">
                        Summary
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Quick overview before saving your changes.
                      </p>

                      <div className="mt-6 space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Client
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {clientName || "No client selected"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Invoice Number
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {invoiceNumber || "Not set"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Total
                          </p>

                          <div className="mt-2 space-y-1 text-sm text-slate-600">
                            <div className="flex justify-between">
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
                              <div className="flex justify-between">
                                <span>Tax ({Number(taxRate) || 0}%)</span>
                                <span>${totals.taxAmount.toFixed(2)}</span>
                              </div>
                            )}
                          </div>

                          <p className="mt-2 border-t border-slate-200 pt-2 text-3xl font-semibold tracking-tight text-slate-900">
                            ${total.toFixed(2)}
                          </p>
                        </div>

                        <div
                          className={`rounded-2xl border p-4 ${getStatusCardClasses(
                            status
                          )}`}
                        >
                          <p className="text-xs font-medium uppercase tracking-wide opacity-80">
                            Status
                          </p>
                          <p className="mt-2 text-sm font-semibold">{status}</p>
                          <p className="mt-1 text-sm opacity-80">
                            {paymentDate
                              ? `Paid on ${paymentDate}`
                              : "No payment date"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Payment Method
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {paymentMethod || "Not specified"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 space-y-3">
                        <button
                          onClick={handleUpdateInvoice}
                          className="w-full rounded-2xl bg-emerald-600 px-5 py-3 font-medium text-white transition hover:bg-emerald-700"
                        >
                          Save Changes
                        </button>

                        <Link
                          href={`/invoices/${id}`}
                          className="block w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          Cancel
                        </Link>
                      </div>

                      {message && (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                          {message}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}