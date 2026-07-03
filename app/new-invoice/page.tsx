"use client";

import { createClient } from "@/lib/supabase/client";
import { generateInvoicePdf } from "@/lib/generate-invoice-pdf";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DRAFT_INVOICE_STORAGE_KEY,
  InvoiceItem,
  InvoiceItemType,
  InvoiceStatus,
  SavedInvoice,
  calculateInvoiceTotals,
  generateNextInvoiceNumber,
  getDisplayStatus,
  getItemType,
  getStatusClasses,
  isItemComplete,
  sortItemsByDate,
} from "@/lib/invoice-utils";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
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

type BusinessProfile = {
  id?: string;
  businessName: string;
  email: string;
  phone: string;
  address: string;
  logoUrl?: string;
  defaultItemType?: InvoiceItemType;
};

type DraftInvoice = {
  clientName: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  items: InvoiceItem[];
  paymentNotes?: string;
  paymentMethod?: string;
  paymentDate?: string;
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
  created_at?: string;
};

type DatabaseClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  rate: number | string | null;
  default_payment_method: string | null;
  default_payment_notes: string | null;
  created_at?: string;
};

type DatabaseBusinessProfileRow = {
  id: string;
  user_id: string;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  default_item_type: string | null;
};

type UIInvoice = SavedInvoice & {
  id: string;
  paymentMethod?: string;
  paymentDate?: string;
};

export default function NewInvoicePage() {
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();

  const [clientName, setClientName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("INV-001");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<InvoiceStatus>("Pending");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [discount, setDiscount] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [savedInvoices, setSavedInvoices] = useState<UIInvoice[]>([]);
  const [previewInvoice, setPreviewInvoice] = useState<UIInvoice | null>(null);

  const [savedClients, setSavedClients] = useState<SavedClient[]>([]);
  const [selectedClient, setSelectedClient] = useState("");

  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>({
    businessName: "",
    email: "",
    phone: "",
    address: "",
    logoUrl: "",
  });

  const [items, setItems] = useState<InvoiceItem[]>([
    { date: "", description: "", hours: "", rate: "", type: "hourly", amount: "" },
  ]);

  function getTodayDate() {
    return new Date().toISOString().split("T")[0];
  }

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
      paymentNotes: invoice.payment_notes || "",
      paymentMethod: invoice.payment_method || "",
      paymentDate: invoice.payment_date || "",
      taxRate: Number(invoice.tax_rate) || 0,
      discount: Number(invoice.discount) || 0,
      total: Number(invoice.total) || 0,
    };
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

  function findNextAvailableInvoiceNumber(invoices: UIInvoice[]) {
    const usedNumbers = new Set(
      invoices.map((invoice) => invoice.invoiceNumber.trim().toUpperCase())
    );

    let nextNumber = generateNextInvoiceNumber(invoices).trim().toUpperCase();

    while (usedNumbers.has(nextNumber)) {
      const match = nextNumber.match(/(\d+)$/);

      if (!match) {
        break;
      }

      const currentNumericPart = match[1];
      const nextNumericValue = String(Number(currentNumericPart) + 1).padStart(
        currentNumericPart.length,
        "0"
      );

      nextNumber = nextNumber.replace(/(\d+)$/, nextNumericValue);
    }

    return nextNumber;
  }

  useEffect(() => {
    loadInvoices();
    loadClients();
    loadBusinessProfile();

    const draftInvoice = localStorage.getItem(DRAFT_INVOICE_STORAGE_KEY);
    if (draftInvoice) {
      try {
        const parsedDraft: DraftInvoice = JSON.parse(draftInvoice);

        setClientName(parsedDraft.clientName || "");
        setIssueDate(parsedDraft.issueDate || "");
        setDueDate(parsedDraft.dueDate || "");
        setStatus(
          parsedDraft.paymentDate
            ? "Paid"
            : parsedDraft.status === "Paid"
            ? "Paid"
            : "Pending"
        );
        setPaymentNotes(parsedDraft.paymentNotes || "");
        setPaymentMethod(parsedDraft.paymentMethod || "");
        setPaymentDate(parsedDraft.paymentDate || "");

        if (Array.isArray(parsedDraft.items) && parsedDraft.items.length > 0) {
          setItems(
            parsedDraft.items.map((item) => ({
              date: item.date ?? "",
              description: item.description ?? "",
              hours: item.hours ?? "",
              rate: item.rate ?? "",
              type: getItemType(item),
              amount: item.amount ?? "",
            }))
          );
        }

        toast("Duplicated invoice loaded. Review and save when ready.", "info");
      } catch {
        toast("Could not load duplicated invoice.", "error");
      } finally {
        localStorage.removeItem(DRAFT_INVOICE_STORAGE_KEY);
      }
    }
  }, []);

  const totals = useMemo(
    () =>
      calculateInvoiceTotals(items, Number(taxRate) || 0, Number(discount) || 0),
    [items, taxRate, discount]
  );

  const total = totals.total;

  async function loadInvoices() {
    // Waiting on getUser() ensures the session is hydrated before querying;
    // otherwise the request can go out unauthenticated and RLS returns [].
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      toast("Could not load invoices from database.", "error");
      return;
    }

    const formattedInvoices: UIInvoice[] = (
      (data as DatabaseInvoiceRow[]) || []
    ).map(mapDatabaseInvoiceToUI);

    setSavedInvoices(formattedInvoices);
    setInvoiceNumber(findNextAvailableInvoiceNumber(formattedInvoices));

    if (formattedInvoices.length > 0) {
      setPreviewInvoice(formattedInvoices[0]);
    } else {
      setPreviewInvoice(null);
    }
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
      console.error(error);
      toast("Could not load clients.", "error");
      return;
    }

    const formattedClients = ((data as DatabaseClientRow[]) || []).map(
      mapDatabaseClientToUI
    );

    setSavedClients(formattedClients);
  }

  async function loadBusinessProfile() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("Load business profile user error:", userError);
      return;
    }

    const { data, error } = await supabase
      .from("business_profile")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Load business profile error:", error);
      toast("Could not load business profile.", "error");
      return;
    }

    if (data) {
      const profile = data as DatabaseBusinessProfileRow;
      const defaultItemType: InvoiceItemType =
        profile.default_item_type === "fixed" ? "fixed" : "hourly";

      setBusinessProfile({
        id: profile.id,
        businessName: profile.business_name || "",
        email: profile.email || "",
        phone: profile.phone || "",
        address: profile.address || "",
        logoUrl: profile.logo_url || "",
        defaultItemType,
      });

      // Apply the business's preferred invoice format to the untouched
      // starter row only — never rewrite rows the user already edited.
      setItems((prev) =>
        prev.length === 1 &&
        !prev[0].description &&
        !prev[0].hours &&
        !prev[0].amount
          ? [{ ...prev[0], type: defaultItemType }]
          : prev
      );
    }
  }

  function handleAddItem() {
    const selectedClientData = savedClients.find(
      (client) => client.name === clientName
    );

    const previousRate = items.length > 0 ? items[items.length - 1].rate : "";

    const autoRate = selectedClientData
      ? String(selectedClientData.rate)
      : previousRate;

    const inheritedType: InvoiceItemType =
      items.length > 0
        ? getItemType(items[items.length - 1])
        : businessProfile.defaultItemType || "hourly";

    setItems((previous) => [
      ...previous,
      { date: "", description: "", hours: "", rate: autoRate, type: inheritedType, amount: "" },
    ]);
  }

  function handleItemTypeChange(index: number, type: InvoiceItemType) {
    setItems((previous) =>
      previous.map((item, itemIndex) =>
        itemIndex === index ? { ...item, type } : item
      )
    );
  }

  function handleRemoveItem(indexToRemove: number) {
    if (items.length === 1) {
      toast("At least one invoice item is required.", "error");
      return;
    }

    setItems((previous) =>
      previous.filter((_, index) => index !== indexToRemove)
    );
  }

  function handleItemChange(
    index: number,
    field: keyof InvoiceItem,
    value: string
  ) {
    setItems((previous) =>
      previous.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  }

  function handleClientSelect(value: string) {
    setSelectedClient(value);

    const selected = savedClients.find((client) => client.name === value);

    if (selected) {
      setClientName(selected.name);
      setPaymentMethod(selected.defaultPaymentMethod || "");
      setPaymentNotes(selected.defaultPaymentNotes || "");

      setItems((previous) =>
        previous.map((item) => ({
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

  async function handleSaveInvoice() {
    const hasInvalidItem = items.some((item) => !isItemComplete(item));

    const normalizedInvoiceNumber = invoiceNumber.trim().toUpperCase();
    const finalStatus: InvoiceStatus = paymentDate ? "Paid" : status;

    if (!clientName || !normalizedInvoiceNumber || hasInvalidItem) {
      toast(
        "Please complete all invoice fields and item rows before saving.",
        "error"
      );
      return;
    }

    const duplicateInState = savedInvoices.some(
      (invoice) =>
        invoice.invoiceNumber.trim().toUpperCase() === normalizedInvoiceNumber
    );

    if (duplicateInState) {
      toast(
        `Invoice number ${normalizedInvoiceNumber} already exists. Please use a different number.`,
        "error"
      );
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast("You must be logged in to save an invoice.", "error");
      return;
    }

    const { data, error } = await supabase
      .from("invoices")
      .insert([
        {
          client_name: clientName,
          invoice_number: normalizedInvoiceNumber,
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
          user_id: user.id,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error(error);

      if ((error as { code?: string }).code === "23505") {
        toast(
          `Invoice number ${normalizedInvoiceNumber} already exists. Please use a different number.`,
          "error"
        );
      } else {
        toast("Error saving invoice to database.", "error");
      }
      return;
    }

    const newInvoice = mapDatabaseInvoiceToUI(data as DatabaseInvoiceRow);
    const updatedInvoices = [newInvoice, ...savedInvoices];

    setSavedInvoices(updatedInvoices);
    setPreviewInvoice(newInvoice);
    toast(`Invoice ${normalizedInvoiceNumber} saved.`, "success");

    setInvoiceNumber(findNextAvailableInvoiceNumber(updatedInvoices));
    setClientName("");
    setSelectedClient("");
    setIssueDate("");
    setDueDate("");
    setStatus("Pending");
    setPaymentNotes("");
    setPaymentMethod("");
    setPaymentDate("");
    setTaxRate("");
    setDiscount("");
    setItems([{ date: "", description: "", hours: "", rate: "", type: "hourly", amount: "" }]);
  }

  async function performDeleteInvoice() {
    if (!pendingDeleteId) return;
    const invoiceId = pendingDeleteId;

    const invoiceToDelete = savedInvoices.find(
      (invoice) => invoice.id === invoiceId
    );

    setIsDeleting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast("You must be logged in to delete an invoice.", "error");
      setIsDeleting(false);
      setPendingDeleteId(null);
      return;
    }

    const { error } = await supabase
      .from("invoices")
      .delete()
      .eq("id", invoiceId)
      .eq("user_id", user.id);

    setIsDeleting(false);
    setPendingDeleteId(null);

    if (error) {
      console.error(error);
      toast("Error deleting invoice from database.", "error");
      return;
    }

    const updatedInvoices = savedInvoices.filter(
      (invoice) => invoice.id !== invoiceId
    );

    setSavedInvoices(updatedInvoices);
    setInvoiceNumber(findNextAvailableInvoiceNumber(updatedInvoices));

    if (updatedInvoices.length === 0) {
      setPreviewInvoice(null);
    } else if (previewInvoice?.id === invoiceId) {
      setPreviewInvoice(updatedInvoices[0]);
    }

    toast(
      invoiceToDelete
        ? `Invoice ${invoiceToDelete.invoiceNumber} deleted.`
        : "Invoice deleted.",
      "success"
    );
  }

  async function handleSavedInvoiceStatusChange(
    invoiceId: string,
    newStatus: InvoiceStatus
  ) {
    const today = getTodayDate();

    const updatePayload: { status: InvoiceStatus; payment_date?: string | null } = {
      status: newStatus,
    };

    if (newStatus === "Paid") {
      updatePayload.payment_date = today;
    }

    if (newStatus === "Pending") {
      updatePayload.payment_date = null;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast("You must be logged in to update an invoice.", "error");
      return;
    }

    const { error } = await supabase
      .from("invoices")
      .update(updatePayload)
      .eq("id", invoiceId)
      .eq("user_id", user.id);

    if (error) {
      console.error(error);
      toast("Error updating invoice status.", "error");
      return;
    }

    const updatedInvoices = savedInvoices.map((invoice) =>
      invoice.id === invoiceId
        ? {
            ...invoice,
            status: newStatus,
            paymentDate: newStatus === "Paid" ? today : "",
          }
        : invoice
    );

    setSavedInvoices(updatedInvoices);

    const updatedPreviewInvoice = updatedInvoices.find(
      (invoice) => invoice.id === previewInvoice?.id
    );

    if (updatedPreviewInvoice) {
      setPreviewInvoice(updatedPreviewInvoice);
    }

    const updatedInvoice = updatedInvoices.find((invoice) => invoice.id === invoiceId);

    toast(
      updatedInvoice
        ? `Invoice ${updatedInvoice.invoiceNumber} updated to ${newStatus}.`
        : `Invoice updated to ${newStatus}.`,
      "success"
    );
  }

  async function handleDownloadInvoicePDF(invoice: UIInvoice) {
    try {
      const pdf = await generateInvoicePdf(invoice, businessProfile);
      pdf.save(`${invoice.invoiceNumber}.pdf`);
      toast(`PDF downloaded for ${invoice.invoiceNumber}.`, "success");
    } catch (error) {
      console.error(error);
      toast("There was a problem generating the PDF.", "error");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-6 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">
                  InvoiceFlow
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
                  Create New Invoice
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-300">
                  Build invoices, review the latest saved version, and manage recent
                  records from one clean workspace.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm text-emerald-200">
                  Next number: <span className="font-semibold">{invoiceNumber}</span>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-200">
                  {savedInvoices.length} saved invoice{savedInvoices.length === 1 ? "" : "s"}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6 lg:px-8">
            <Link
              href="/invoices"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              ← Back to Invoices
            </Link>
          </div>
        </div>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:p-8">
            <div className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                  Invoice Details
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Fill out the invoice information, payment details, and line items
                  below.
                </p>
              </div>

              <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:w-auto">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Current total
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  ${total.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Client
                </label>

                <select
                  value={selectedClient}
                  onChange={(e) => handleClientSelect(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                >
                  <option value="">Select a saved client</option>

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
                  type="text"
                  placeholder="Client name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Invoice Number
                </label>
                <input
                  type="text"
                  placeholder="INV-001"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase())}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => handleStatusChange(e.target.value as InvoiceStatus)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
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
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
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
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
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
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Payment Date
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => handlePaymentDateChange(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Payment Notes
              </label>
              <textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                rows={4}
                placeholder="Example: Zelle, bank transfer details, payment instructions, late fee note..."
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="mt-8 min-w-0">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-xl font-semibold text-slate-900">Invoice Items</h3>
                  <p className="text-sm text-slate-500">
                    Add the work details that will appear on this invoice.
                  </p>
                </div>

                <button
                  onClick={handleAddItem}
                  className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Add Row
                </button>
              </div>

              <div className="space-y-4">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                        Row {index + 1}
                      </div>

                      <button
                        onClick={() => handleRemoveItem(index)}
                        className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                      <select
                        value={getItemType(item)}
                        onChange={(e) =>
                          handleItemTypeChange(
                            index,
                            e.target.value as InvoiceItemType
                          )
                        }
                        aria-label="Item type"
                        className="w-full min-w-0 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      >
                        <option value="hourly">Hourly</option>
                        <option value="fixed">Flat Fee</option>
                      </select>

                      <input
                        type="date"
                        value={item.date}
                        onChange={(e) =>
                          handleItemChange(index, "date", e.target.value)
                        }
                        aria-label="Item date"
                        className="w-full min-w-0 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      />

                      {getItemType(item) === "fixed" ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Amount ($)"
                          value={item.amount || ""}
                          onChange={(e) =>
                            handleItemChange(index, "amount", e.target.value)
                          }
                          className="col-span-2 w-full min-w-0 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        />
                      ) : (
                        <>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Hours"
                            value={item.hours}
                            onChange={(e) =>
                              handleItemChange(index, "hours", e.target.value)
                            }
                            className="w-full min-w-0 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                          />

                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Rate"
                            value={item.rate}
                            onChange={(e) =>
                              handleItemChange(index, "rate", e.target.value)
                            }
                            className="w-full min-w-0 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                          />
                        </>
                      )}
                    </div>

                    <div className="mt-4 min-w-0">
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

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
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
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
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
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between gap-8 text-slate-300 sm:justify-start">
                    <span className="w-24">Subtotal</span>
                    <span className="font-medium text-white">
                      ${totals.subtotal.toFixed(2)}
                    </span>
                  </div>

                  {totals.discountAmount > 0 && (
                    <div className="flex items-center justify-between gap-8 text-slate-300 sm:justify-start">
                      <span className="w-24">Discount</span>
                      <span className="font-medium text-emerald-400">
                        −${totals.discountAmount.toFixed(2)}
                      </span>
                    </div>
                  )}

                  {totals.taxAmount > 0 && (
                    <div className="flex items-center justify-between gap-8 text-slate-300 sm:justify-start">
                      <span className="w-24">Tax ({Number(taxRate) || 0}%)</span>
                      <span className="font-medium text-white">
                        ${totals.taxAmount.toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-8 border-t border-white/10 pt-2 sm:justify-start">
                    <span className="w-24 text-slate-300">Total</span>
                    <span className="text-3xl font-bold">${total.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  onClick={handleSaveInvoice}
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                >
                  Save Invoice
                </button>
              </div>
            </div>
          </section>

          <aside className="min-w-0 space-y-6">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold text-slate-900">
                      Latest Invoice Preview
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Quick look at the most recently saved invoice.
                    </p>
                  </div>

                  {previewInvoice && (
                    <span
                      className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                        getDisplayStatus(previewInvoice)
                      )}`}
                    >
                      {getDisplayStatus(previewInvoice)}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-5 sm:p-6">
                {previewInvoice ? (
                  <>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Invoice Number
                          </p>
                          <p className="mt-1 break-words text-lg font-bold text-slate-900">
                            {previewInvoice.invoiceNumber}
                          </p>
                        </div>

                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Client
                          </p>
                          <p className="mt-1 break-words text-sm font-medium text-slate-900">
                            {previewInvoice.clientName}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Issue Date
                          </p>
                          <p className="mt-1 text-sm text-slate-700">
                            {previewInvoice.issueDate || "-"}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Due Date
                          </p>
                          <p className="mt-1 text-sm text-slate-700">
                            {previewInvoice.dueDate || "-"}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Payment Method
                          </p>
                          <p className="mt-1 break-words text-sm text-slate-700">
                            {previewInvoice.paymentMethod || "-"}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Payment Date
                          </p>
                          <p className="mt-1 text-sm text-slate-700">
                            {previewInvoice.paymentDate || "-"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Total
                        </p>
                        <p className="mt-1 text-2xl font-bold text-slate-900">
                          ${previewInvoice.total.toFixed(2)}
                        </p>
                      </div>

                      {previewInvoice.paymentNotes && (
                        <div className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Payment Notes
                          </p>
                          <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-slate-700">
                            {previewInvoice.paymentNotes}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <Link
                        href={`/invoices/${previewInvoice.id}`}
                        className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                      >
                        Open Invoice
                      </Link>

                      <button
                        onClick={() => handleDownloadInvoicePDF(previewInvoice)}
                        className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        Download PDF
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
                    No invoices saved yet.
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">
                      Saved Invoices
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Recent invoices in a cleaner, easier-to-scan layout.
                    </p>
                  </div>

                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {savedInvoices.length} total
                  </div>
                </div>
              </div>

              <div className="p-5 sm:p-6">
                {savedInvoices.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
                    No invoices found.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {savedInvoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition hover:border-slate-300 hover:bg-white"
                      >
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-words text-base font-semibold text-slate-900">
                              {invoice.invoiceNumber}
                            </p>
                            <p className="mt-1 break-words text-sm text-slate-600">
                              {invoice.clientName}
                            </p>
                          </div>

                          <select
                            value={invoice.status}
                            onChange={(e) =>
                              handleSavedInvoiceStatusChange(
                                invoice.id,
                                e.target.value as InvoiceStatus
                              )
                            }
                            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClasses(
                              getDisplayStatus(invoice)
                            )}`}
                          >
                            <option value="Pending">Pending</option>
                            <option value="Paid">Paid</option>
                          </select>
                        </div>

                        <div className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-slate-500">Total</span>
                            <span className="text-base font-semibold text-slate-900">
                              ${invoice.total.toFixed(2)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-slate-500">Issue Date</span>
                            <span className="text-sm text-slate-700">
                              {invoice.issueDate || "-"}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-slate-500">Due Date</span>
                            <span className="text-sm text-slate-700">
                              {invoice.dueDate || "-"}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                          >
                            Open
                          </Link>

                          <Link
                            href={`/invoices/${invoice.id}/edit`}
                            className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600"
                          >
                            Edit
                          </Link>

                          <button
                            onClick={() => handleDownloadInvoicePDF(invoice)}
                            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                          >
                            PDF
                          </button>

                          <button
                            onClick={() => setPendingDeleteId(invoice.id)}
                            className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete this invoice?"
        description="This permanently removes the invoice and cannot be undone."
        confirmLabel="Delete Invoice"
        destructive
        busy={isDeleting}
        onConfirm={performDeleteInvoice}
        onCancel={() => setPendingDeleteId(null)}
      />
    </main>
  );
}