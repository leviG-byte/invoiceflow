import jsPDF from "jspdf";
import {
  InvoiceItem,
  SavedInvoice,
  calculateInvoiceTotals,
  getDisplayStatus,
  getItemAmount,
  getItemType,
  sortItemsByDate,
} from "@/lib/invoice-utils";

export type BusinessProfilePdf = {
  businessName: string;
  email: string;
  phone: string;
  address: string;
  logoUrl?: string;
};

export type PdfInvoice = SavedInvoice & {
  paymentMethod?: string;
  paymentDate?: string;
};

type ImageFormat = "PNG" | "JPEG" | "WEBP";

async function loadImageAsDataUrl(
  imageUrl: string
): Promise<{ dataUrl: string; format: ImageFormat }> {
  const response = await fetch(imageUrl);
  const blob = await response.blob();

  const format: ImageFormat =
    blob.type === "image/png"
      ? "PNG"
      : blob.type === "image/webp"
      ? "WEBP"
      : "JPEG";

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not convert image to data URL."));
      }
    };

    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(blob);
  });

  return { dataUrl, format };
}

function money(value: number | string) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function safeText(value?: string | null) {
  return value && value.trim() ? value.trim() : "-";
}

function drawWrappedText(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight = 5
) {
  const lines = pdf.splitTextToSize(text || "-", maxWidth);
  pdf.text(lines, x, y);
  return y + lines.length * lineHeight;
}

export async function generateInvoicePdf(
  invoice: PdfInvoice,
  businessProfile: BusinessProfilePdf
) {
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = 210;
  const left = 20;
  const right = 190;

  const displayStatus = getDisplayStatus(invoice);
  const isPaid = displayStatus === "Paid";
  const paymentDate = invoice.paymentDate;

  // HEADER TITLE
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(26);
  pdf.text("INVOICE", right, 20, { align: "right" });

  // STATUS BADGE
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");

  if (isPaid) {
    pdf.setTextColor(34, 197, 94);
    pdf.text("PAID", right, 28, { align: "right" });

    if (paymentDate) {
      pdf.setFontSize(9);
      pdf.setTextColor(100);
      pdf.text(`Paid on ${paymentDate}`, right, 33, { align: "right" });
    }
  } else {
    pdf.setTextColor(245, 158, 11);
    pdf.text("PENDING", right, 28, { align: "right" });
  }

  pdf.setTextColor(0);

  let headerLeftY = 20;

  if (businessProfile.logoUrl) {
    try {
      const { dataUrl, format } = await loadImageAsDataUrl(
        businessProfile.logoUrl
      );
      pdf.addImage(dataUrl, format, left, 12, 38, 18);
      headerLeftY = 36;
    } catch (error) {
      console.error("Logo load error:", error);
    }
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(businessProfile.businessName || "InvoiceFlow", left, headerLeftY);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);

  let contactY = headerLeftY + 6;

  if (businessProfile.email) {
    pdf.text(businessProfile.email, left, contactY);
    contactY += 5;
  }

  if (businessProfile.phone) {
    pdf.text(businessProfile.phone, left, contactY);
    contactY += 5;
  }

  if (businessProfile.address) {
    contactY = drawWrappedText(pdf, businessProfile.address, left, contactY, 65, 5);
  }

  pdf.setDrawColor(225, 225, 225);
  pdf.line(left, 42, right, 42);

  // RIGHT INFO BLOCK
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);

  pdf.text("Invoice Number", 135, 52);
  pdf.text("Issue Date", 135, 60);
  pdf.text("Due Date", 135, 68);
  pdf.text("Payment Method", 135, 76);
  pdf.text("Payment Date", 135, 84);

  pdf.setFont("helvetica", "normal");

  pdf.text(safeText(invoice.invoiceNumber), right, 52, { align: "right" });
  pdf.text(safeText(invoice.issueDate), right, 60, { align: "right" });
  pdf.text(safeText(invoice.dueDate), right, 68, { align: "right" });
  pdf.text(safeText(invoice.paymentMethod), right, 76, { align: "right" });
  pdf.text(safeText(invoice.paymentDate), right, 84, { align: "right" });

  // BILL TO
  const billToTop = 96;

  pdf.setFillColor(248, 250, 252);
  pdf.rect(left, billToTop - 6, 80, 22, "F");

  pdf.setFont("helvetica", "bold");
  pdf.text("Bill To", left + 3, billToTop);

  pdf.setFont("helvetica", "normal");
  drawWrappedText(pdf, invoice.clientName || "-", left + 3, billToTop + 7, 70, 5);

  // TABLE
  const tableTop = 128;

  const items: InvoiceItem[] = sortItemsByDate(
    Array.isArray(invoice.items) ? invoice.items : []
  );

  // Flat-rate invoices drop the Hours/Rate columns and give the
  // description the extra width.
  const allFixed =
    items.length > 0 && items.every((item) => getItemType(item) === "fixed");
  const descriptionWidth = allFixed ? 110 : 68;

  pdf.setFillColor(243, 244, 246);
  pdf.rect(left, tableTop, 170, 10, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);

  pdf.text("Date", 24, tableTop + 6.5);
  pdf.text("Description", 48, tableTop + 6.5);

  if (!allFixed) {
    pdf.text("Hours", 126, tableTop + 6.5);
    pdf.text("Rate", 145, tableTop + 6.5);
  }

  pdf.text("Amount", 170, tableTop + 6.5);

  let y = tableTop + 18;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);

  items.forEach((item, index) => {
    const isFixed = getItemType(item) === "fixed";
    const amount = getItemAmount(item);
    const descriptionLines = pdf.splitTextToSize(
      item.description || "-",
      descriptionWidth
    );
    const rowHeight = Math.max(8, descriptionLines.length * 5);

    if (index % 2 === 0) {
      pdf.setFillColor(252, 252, 252);
      pdf.rect(left, y - 5, 170, rowHeight, "F");
    }

    pdf.text(safeText(item.date), 24, y);
    pdf.text(descriptionLines, 48, y);

    if (!allFixed) {
      pdf.text(isFixed ? "-" : String(Number(item.hours) || 0), 128, y);
      pdf.text(isFixed ? "Flat" : money(item.rate), 145, y);
    }

    pdf.text(money(amount), 170, y);

    y += rowHeight;
  });

  // TOTALS BOX
  y += 10;

  const taxRate = Number(invoice.taxRate) || 0;
  const discount = Number(invoice.discount) || 0;
  const totals = calculateInvoiceTotals(items, taxRate, discount);
  const hasBreakdown = totals.discountAmount > 0 || totals.taxAmount > 0;

  if (hasBreakdown) {
    pdf.setFillColor(249, 250, 251);
    pdf.rect(120, y - 6, 70, 34, "F");

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);

    pdf.text("Subtotal", 125, y);
    pdf.text(money(totals.subtotal), right, y, { align: "right" });
    y += 6;

    if (totals.discountAmount > 0) {
      pdf.text("Discount", 125, y);
      pdf.text(`-${money(totals.discountAmount)}`, right, y, { align: "right" });
      y += 6;
    }

    if (totals.taxAmount > 0) {
      pdf.text(`Tax (${taxRate}%)`, 125, y);
      pdf.text(money(totals.taxAmount), right, y, { align: "right" });
      y += 6;
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("Total", 125, y + 2);
    pdf.text(money(invoice.total), right, y + 2, { align: "right" });
    y += 4;
  } else {
    pdf.setFillColor(249, 250, 251);
    pdf.rect(120, y - 6, 70, 14, "F");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);

    pdf.text("Total", 125, y + 2);
    pdf.text(money(invoice.total), right, y + 2, { align: "right" });
  }

  // PAYMENT NOTES
  if (invoice.paymentNotes && invoice.paymentNotes.trim()) {
    y += 20;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text("Payment Notes", left, y);

    y += 6;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);

    y = drawWrappedText(pdf, invoice.paymentNotes, left, y, 170, 5);
  }

  y += 18;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.setTextColor(100);

  pdf.text("Thank you for your business.", pageWidth / 2, Math.min(y, 285), {
    align: "center",
  });

  return pdf;
}