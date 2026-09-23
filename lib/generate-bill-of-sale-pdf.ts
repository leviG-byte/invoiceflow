import jsPDF from "jspdf";
import {
  DEFAULT_ACCENT,
  accentTextColor,
  hexToRgb,
} from "@/lib/invoice-utils";
import {
  AS_IS_CLAUSE,
  BillItem,
  SavedBill,
  calculateBillTotal,
  getBillItemAmount,
} from "@/lib/bill-of-sale-utils";
import type { BusinessProfilePdf } from "@/lib/generate-invoice-pdf";

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
    reader.onloadend = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not convert image to data URL."));
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

export async function generateBillOfSalePdf(
  bill: SavedBill,
  businessProfile: BusinessProfilePdf
) {
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = 210;
  const pageHeight = 297;
  const left = 20;
  const right = 190;

  const accentHex = businessProfile.accentColor || DEFAULT_ACCENT;
  const [ar, ag, ab] = hexToRgb(accentHex);
  const accentTxt = accentTextColor(accentHex);

  // Accent banner
  pdf.setFillColor(ar, ag, ab);
  pdf.rect(0, 0, pageWidth, 6, "F");

  // TITLE
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.setTextColor(ar, ag, ab);
  pdf.text("BILL OF SALE", right, 22, { align: "right" });
  pdf.setTextColor(0);

  // SELLER (business) identity, left
  let headerLeftY = 20;

  if (businessProfile.logoUrl) {
    try {
      const { dataUrl, format } = await loadImageAsDataUrl(
        businessProfile.logoUrl
      );
      pdf.addImage(dataUrl, format, left, 12, 38, 18);
      headerLeftY = 36;
    } catch (error) {
      console.error("Bill of sale logo load error:", error);
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

  pdf.setDrawColor(ar, ag, ab);
  pdf.setLineWidth(0.6);
  pdf.line(left, 42, right, 42);
  pdf.setLineWidth(0.2);
  pdf.setDrawColor(225, 225, 225);

  // RIGHT INFO BLOCK
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("Document No.", 135, 52);
  pdf.text("Sale Date", 135, 60);
  pdf.text("Payment Method", 135, 68);

  pdf.setFont("helvetica", "normal");
  pdf.text(safeText(bill.billNumber), right, 52, { align: "right" });
  pdf.text(safeText(bill.saleDate), right, 60, { align: "right" });
  pdf.text(safeText(bill.paymentMethod), right, 68, { align: "right" });

  // The business (owner) sits on one side; the counterparty on the other.
  // Swap by role so a purchase prints with the business as the buyer.
  const businessParty = {
    name: businessProfile.businessName || "InvoiceFlow",
    email: businessProfile.email,
    phone: businessProfile.phone,
    address: "",
  };
  const counterParty = {
    name: bill.buyerName,
    email: bill.buyerEmail || "",
    phone: bill.buyerPhone || "",
    address: bill.buyerAddress || "",
  };
  const seller = bill.businessRole === "buyer" ? counterParty : businessParty;
  const buyer = bill.businessRole === "buyer" ? businessParty : counterParty;

  // SELLER + BUYER blocks
  const blockTop = 84;

  function drawParty(
    label: string,
    party: { name: string; email: string; phone: string; address: string },
    x: number
  ) {
    pdf.setFillColor(248, 250, 252);
    pdf.rect(x, blockTop - 6, 80, 30, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(120);
    pdf.text(label, x + 3, blockTop);
    pdf.setTextColor(0);
    pdf.setFontSize(10);
    pdf.text(safeText(party.name), x + 3, blockTop + 7);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    let py = blockTop + 12;
    if (party.email) {
      pdf.text(party.email, x + 3, py);
      py += 4.5;
    }
    if (party.phone) {
      pdf.text(party.phone, x + 3, py);
      py += 4.5;
    }
    if (party.address) {
      drawWrappedText(pdf, party.address, x + 3, py, 74, 4.5);
    }
  }

  drawParty("SELLER", seller, left);
  drawParty("BUYER", buyer, 110);

  // ITEMS TABLE
  const tableTop = 122;
  const items: BillItem[] = Array.isArray(bill.items) ? bill.items : [];

  pdf.setFillColor(243, 244, 246);
  pdf.rect(left, tableTop, 170, 10, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(0);
  pdf.text("Description", 24, tableTop + 6.5);
  pdf.text("Qty", 130, tableTop + 6.5, { align: "right" });
  pdf.text("Unit Price", 158, tableTop + 6.5, { align: "right" });
  pdf.text("Amount", 188, tableTop + 6.5, { align: "right" });

  let y = tableTop + 18;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);

  items.forEach((item, index) => {
    const descriptionLines = pdf.splitTextToSize(item.description || "-", 95);
    const rowHeight = Math.max(8, descriptionLines.length * 5);
    const quantityDisplay = item.quantity === "" ? "1" : String(Number(item.quantity) || 0);

    if (index % 2 === 0) {
      pdf.setFillColor(252, 252, 252);
      pdf.rect(left, y - 5, 170, rowHeight, "F");
    }

    pdf.text(descriptionLines, 24, y);
    pdf.text(quantityDisplay, 130, y, { align: "right" });
    pdf.text(money(item.unitPrice), 158, y, { align: "right" });
    pdf.text(money(getBillItemAmount(item)), 188, y, { align: "right" });

    y += rowHeight;
  });

  // TOTAL box
  y += 8;
  const total = bill.total || calculateBillTotal(items);
  const [txr, txg, txb] = hexToRgb(accentTxt);
  pdf.setFillColor(ar, ag, ab);
  pdf.rect(120, y - 6, 70, 14, "F");
  pdf.setTextColor(txr, txg, txb);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text("Total Sale Price", 124, y + 2);
  pdf.text(money(total), right, y + 2, { align: "right" });
  pdf.setTextColor(0);

  // AS-IS clause
  if (bill.asIs) {
    y += 18;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.text("Terms of Sale", left, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(80);
    y = drawWrappedText(pdf, AS_IS_CLAUSE, left, y, 170, 4.2);
    pdf.setTextColor(0);
  }

  // Notes
  if (bill.notes && bill.notes.trim()) {
    y += 8;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.text("Additional Notes", left, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    y = drawWrappedText(pdf, bill.notes, left, y, 170, 5);
  }

  // Signature lines — anchored near the bottom, but pushed down if content is long.
  const signatureY = Math.max(y + 24, pageHeight - 40);
  pdf.setDrawColor(120);
  pdf.setLineWidth(0.3);
  pdf.line(left, signatureY, left + 70, signatureY);
  pdf.line(right - 70, signatureY, right, signatureY);
  pdf.setFontSize(9);
  pdf.setTextColor(90);
  pdf.text("Seller Signature", left, signatureY + 5);
  pdf.text(safeText(seller.name), left, signatureY + 10);
  pdf.text("Buyer Signature", right - 70, signatureY + 5);
  pdf.text(safeText(buyer.name), right - 70, signatureY + 10);
  pdf.setTextColor(0);

  return pdf;
}
