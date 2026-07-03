export type InvoiceItemType = "hourly" | "fixed";

export type InvoiceItem = {
  date: string;
  description: string;
  hours: string;
  rate: string;
  // "fixed" items bill a flat amount; absent type means "hourly" so invoices
  // created before this field existed keep working unchanged.
  type?: InvoiceItemType;
  amount?: string;
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
  taxRate?: number;
  discount?: number;
  total: number;
};

// Stable chronological sort: dated items first (oldest to newest), undated
// items keep their relative order at the end.
export function sortItemsByDate(items: InvoiceItem[]): InvoiceItem[] {
  return [...items].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });
}

export function isItemComplete(item: InvoiceItem): boolean {
  if (!item.description) return false;

  if (getItemType(item) === "fixed") {
    return Boolean(item.amount);
  }

  return Boolean(item.hours && item.rate);
}

export function getItemType(item: InvoiceItem): InvoiceItemType {
  return item.type === "fixed" ? "fixed" : "hourly";
}

export function getItemAmount(item: InvoiceItem): number {
  if (getItemType(item) === "fixed") {
    return Number(item.amount) || 0;
  }

  return (Number(item.hours) || 0) * (Number(item.rate) || 0);
}

export function calculateInvoiceTotals(
  items: InvoiceItem[],
  taxRate: number,
  discount: number
) {
  const subtotal = items.reduce((sum, item) => sum + getItemAmount(item), 0);
  const discountAmount = Math.min(Number(discount) || 0, subtotal);
  const taxableBase = subtotal - discountAmount;
  const taxAmount = taxableBase * ((Number(taxRate) || 0) / 100);
  const total = taxableBase + taxAmount;

  return { subtotal, discountAmount, taxAmount, total };
}

export type DisplayStatus = "Pending" | "Paid" | "Overdue";

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

export function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}