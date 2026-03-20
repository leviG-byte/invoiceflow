import jsPDF from "jspdf";

type InvoiceItem = {
  date: string;
  description: string;
  hours: string;
  rate: string;
};

type InvoiceStatus = "Pending" | "Paid";

export type SavedInvoice = {
  clientName: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  items: InvoiceItem[];
  total: number;
};

export function downloadInvoicePdf(invoice: SavedInvoice) {
  const doc = new jsPDF();

  doc.setFontSize(20);
  doc.text("Invoice", 20, 20);

  doc.setFontSize(12);
  doc.text(`Invoice Number: ${invoice.invoiceNumber}`, 20, 40);
  doc.text(`Client: ${invoice.clientName}`, 20, 50);
  doc.text(`Issue Date: ${invoice.issueDate || "-"}`, 20, 60);
  doc.text(`Due Date: ${invoice.dueDate || "-"}`, 20, 70);
  doc.text(`Status: ${invoice.status}`, 20, 80);

  let y = 100;

  doc.setFontSize(14);
  doc.text("Items", 20, y);
  y += 10;

  doc.setFontSize(11);

  invoice.items.forEach((item) => {
    const line = `${item.date} | ${item.description} | ${item.hours}h x $${item.rate}`;
    doc.text(line, 20, y);
    y += 8;
  });

  y += 10;

  doc.setFontSize(14);
  doc.text(`Total: $${invoice.total.toFixed(2)}`, 20, y);

  doc.save(`${invoice.invoiceNumber}.pdf`);
}