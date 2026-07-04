import jsPDF from "jspdf";
import {
  DEFAULT_ACCENT,
  SavedInvoice,
  accentTextColor,
  getItemAmount,
  hexToRgb,
} from "@/lib/invoice-utils";
import type { BusinessProfilePdf } from "@/lib/generate-invoice-pdf";

type ReceiptInvoice = SavedInvoice & {
  paymentMethod?: string;
  paymentDate?: string;
};

function money(value: number | string) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function safe(value?: string | null) {
  return value && value.trim() ? value.trim() : "-";
}

async function loadImageAsDataUrl(imageUrl: string) {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  const format =
    blob.type === "image/png"
      ? "PNG"
      : blob.type === "image/webp"
      ? "WEBP"
      : "JPEG";
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("bad image"));
    reader.onerror = () => reject(new Error("read error"));
    reader.readAsDataURL(blob);
  });
  return { dataUrl, format: format as "PNG" | "WEBP" | "JPEG" };
}

// A receipt is a payment-confirmation document generated for a Paid invoice.
export async function generateReceiptPdf(
  invoice: ReceiptInvoice,
  businessProfile: BusinessProfilePdf
) {
  const pdf = new jsPDF("p", "mm", "a4");
  const left = 20;
  const right = 190;

  const accentHex = businessProfile.accentColor || DEFAULT_ACCENT;
  const [ar, ag, ab] = hexToRgb(accentHex);
  const accentTxt = accentTextColor(accentHex);
  const [tr, tg, tb] = hexToRgb(accentTxt);

  // Accent banner
  pdf.setFillColor(ar, ag, ab);
  pdf.rect(0, 0, 210, 6, "F");

  // Title
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(26);
  pdf.setTextColor(ar, ag, ab);
  pdf.text("RECEIPT", right, 22, { align: "right" });

  pdf.setFontSize(11);
  pdf.setTextColor(16, 185, 129); // emerald — payment received
  pdf.text("PAID", right, 30, { align: "right" });
  pdf.setTextColor(0);

  // Business identity (left)
  let leftY = 20;
  if (businessProfile.logoUrl) {
    try {
      const { dataUrl, format } = await loadImageAsDataUrl(
        businessProfile.logoUrl
      );
      pdf.addImage(dataUrl, format, left, 12, 38, 18);
      leftY = 36;
    } catch (error) {
      console.error("Receipt logo load error:", error);
    }
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(businessProfile.businessName || "InvoiceFlow", left, leftY);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  let cy = leftY + 6;
  if (businessProfile.email) {
    pdf.text(businessProfile.email, left, cy);
    cy += 5;
  }
  if (businessProfile.phone) {
    pdf.text(businessProfile.phone, left, cy);
    cy += 5;
  }
  if (businessProfile.address) {
    pdf.text(businessProfile.address, left, cy);
  }

  pdf.setDrawColor(ar, ag, ab);
  pdf.setLineWidth(0.6);
  pdf.line(left, 44, right, 44);
  pdf.setLineWidth(0.2);

  // Receipt meta
  const receiptNumber = `REC-${invoice.invoiceNumber || ""}`.trim();

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("Receipt Number", 130, 56);
  pdf.text("Invoice Number", 130, 64);
  pdf.text("Payment Date", 130, 72);
  pdf.text("Payment Method", 130, 80);

  pdf.setFont("helvetica", "normal");
  pdf.text(safe(receiptNumber), right, 56, { align: "right" });
  pdf.text(safe(invoice.invoiceNumber), right, 64, { align: "right" });
  pdf.text(safe(invoice.paymentDate || invoice.dueDate), right, 72, {
    align: "right",
  });
  pdf.text(safe(invoice.paymentMethod), right, 80, { align: "right" });

  // Received from
  pdf.setFillColor(248, 250, 252);
  pdf.rect(left, 92, 80, 22, "F");
  pdf.setFont("helvetica", "bold");
  pdf.text("Received From", left + 3, 98);
  pdf.setFont("helvetica", "normal");
  pdf.text(safe(invoice.clientName), left + 3, 105);

  // Line items summary
  const tableTop = 126;
  pdf.setFillColor(243, 244, 246);
  pdf.rect(left, tableTop, 170, 10, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("Description", 24, tableTop + 6.5);
  pdf.text("Amount", 170, tableTop + 6.5);

  let y = tableTop + 18;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  items.forEach((item, index) => {
    const lines = pdf.splitTextToSize(item.description || "-", 120);
    const rowH = Math.max(8, lines.length * 5);
    if (index % 2 === 0) {
      pdf.setFillColor(252, 252, 252);
      pdf.rect(left, y - 5, 170, rowH, "F");
    }
    pdf.text(lines, 24, y);
    pdf.text(money(getItemAmount(item)), 170, y, { align: "right" });
    y += rowH;
  });

  // Amount paid box
  y += 10;
  pdf.setFillColor(ar, ag, ab);
  pdf.rect(110, y - 6, 80, 16, "F");
  pdf.setTextColor(tr, tg, tb);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text("Amount Paid", 115, y + 3.5);
  pdf.text(money(invoice.total), right, y + 3.5, { align: "right" });
  pdf.setTextColor(0);

  // Payment notes
  if (invoice.paymentNotes && invoice.paymentNotes.trim()) {
    y += 22;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text("Payment Notes", left, y);
    y += 6;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    const noteLines = pdf.splitTextToSize(invoice.paymentNotes, 170);
    pdf.text(noteLines, left, y);
    y += noteLines.length * 5;
  }

  y += 18;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.setTextColor(120);
  pdf.text(
    "This receipt confirms payment has been received in full. Thank you!",
    105,
    Math.min(y, 285),
    { align: "center" }
  );

  return pdf;
}
