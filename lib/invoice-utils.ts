export type InvoiceItem = {
  date: string;
  description: string;
  hours: string;
  rate: string;
};

export type InvoiceStatus = "Pending" | "Paid";

export type SavedInvoice = {
  id?: string;
  clientName: string;
  clientEmail?: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  items: InvoiceItem[];
  paymentNotes?: string;
  total: number;
};

export type DisplayStatus = "Pending" | "Paid" | "Overdue";

export const INVOICES_STORAGE_KEY = "invoiceflow-saved-invoices";
export const DRAFT_INVOICE_STORAGE_KEY = "invoiceflow-draft-invoice";

export function getDisplayStatus(invoice: SavedInvoice): DisplayStatus {
  if (invoice.status === "Paid") {
    return "Paid";
  }

  if (invoice.dueDate) {
    const today = new Date();
    const due = new Date(`${invoice.dueDate}T23:59:59`);

    if (due < today) {
      return "Overdue";
    }
  }

  return "Pending";
}

export function getStatusClasses(status: DisplayStatus) {
  if (status === "Paid") {
    return "bg-green-100 text-green-700";
  }

  if (status === "Overdue") {
    return "bg-red-100 text-red-700";
  }

  return "bg-yellow-100 text-yellow-700";
}

export function generateNextInvoiceNumber(invoices: SavedInvoice[]): string {
  if (invoices.length === 0) {
    return "INV-001";
  }

  let maxNumber = 0;

  invoices.forEach((invoice) => {
    const match = invoice.invoiceNumber.match(/(\d+)/);

    if (match) {
      const parsedNumber = Number(match[1]);

      if (parsedNumber > maxNumber) {
        maxNumber = parsedNumber;
      }
    }
  });

  const nextNumber = maxNumber + 1;
  return `INV-${String(nextNumber).padStart(3, "0")}`;
}

export function loadSavedInvoices(): SavedInvoice[] {
  if (typeof window === "undefined") return [];

  const storedInvoices = localStorage.getItem(INVOICES_STORAGE_KEY);

  if (!storedInvoices) return [];

  try {
    return JSON.parse(storedInvoices) as SavedInvoice[];
  } catch (error) {
    console.error("Failed to parse saved invoices:", error);
    return [];
  }
}

export function saveSavedInvoices(invoices: SavedInvoice[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(invoices));
}

export function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}