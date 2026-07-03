import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";

const resend = new Resend(process.env.RESEND_API_KEY);

// Per-user send limit: 10 emails per 10 minutes. In-memory, per serverless
// instance — a soft guard against abuse, not a billing-grade quota.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const sendLog = new Map<string, number[]>();

function isRateLimited(userId: string) {
  const now = Date.now();
  const recent = (sendLog.get(userId) || []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS
  );

  if (recent.length >= RATE_LIMIT_MAX) {
    sendLog.set(userId, recent);
    return true;
  }

  recent.push(now);
  sendLog.set(userId, recent);
  return false;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type InvoiceRow = {
  id: string;
  client_name: string | null;
  invoice_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  status: string | null;
  total: number | string | null;
  payment_notes: string | null;
  payment_method: string | null;
  payment_date: string | null;
};

export async function POST(req: Request) {
  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Missing RESEND_API_KEY" },
        { status: 500 }
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (isRateLimited(user.id)) {
      return NextResponse.json(
        { error: "Too many emails sent. Please wait a few minutes." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const invoiceId = typeof body?.invoiceId === "string" ? body.invoiceId : "";
    const kind = body?.kind === "reminder" ? "reminder" : "invoice";
    const pdfBase64 = typeof body?.pdfBase64 === "string" ? body.pdfBase64 : "";

    if (!invoiceId) {
      return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
    }

    // ~3M base64 chars ≈ 2.2MB decoded — plenty for a one-page invoice PDF.
    if (pdfBase64.length > 3_000_000) {
      return NextResponse.json(
        { error: "PDF attachment is too large." },
        { status: 413 }
      );
    }

    if (pdfBase64 && !/^[A-Za-z0-9+/=]+$/.test(pdfBase64)) {
      return NextResponse.json(
        { error: "Invalid PDF attachment." },
        { status: 400 }
      );
    }

    // RLS scopes this query to the caller's own rows; the explicit user_id
    // filter is defense in depth.
    const { data: invoiceData, error: invoiceError } = await supabase
      .from("invoices")
      .select(
        "id, client_name, invoice_number, issue_date, due_date, status, total, payment_notes, payment_method, payment_date"
      )
      .eq("id", invoiceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (invoiceError || !invoiceData) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const invoice = invoiceData as InvoiceRow;

    const { data: clientData } = await supabase
      .from("clients")
      .select("email")
      .eq("user_id", user.id)
      .eq("name", invoice.client_name)
      .maybeSingle();

    const clientEmail = (clientData?.email || "").trim();

    if (!clientEmail) {
      return NextResponse.json(
        { error: "This client does not have an email address." },
        { status: 400 }
      );
    }

    const invoiceNumber = escapeHtml(invoice.invoice_number);
    const displayStatus = invoice.payment_date
      ? "Paid"
      : invoice.status === "Paid"
      ? "Paid"
      : "Pending";

    const paymentMethodHtml = invoice.payment_method?.trim()
      ? `<p style="margin: 4px 0;"><strong>Payment Method:</strong> ${escapeHtml(invoice.payment_method)}</p>`
      : "";

    const paymentDateHtml = invoice.payment_date?.trim()
      ? `<p style="margin: 4px 0;"><strong>Payment Date:</strong> ${escapeHtml(invoice.payment_date)}</p>`
      : "";

    const paymentNotesHtml = invoice.payment_notes?.trim()
      ? `
        <div style="margin: 16px 0; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; background: #ffffff;">
          <p style="margin: 4px 0 8px 0;"><strong>Payment Notes:</strong></p>
          <p style="margin: 0; white-space: pre-line;">${escapeHtml(invoice.payment_notes)}</p>
        </div>
      `
      : "";

    const isReminder = kind === "reminder";

    const intro = isReminder
      ? `<p>This is a friendly reminder that invoice ${invoiceNumber} is past due. Please arrange payment at your earliest convenience.</p>`
      : `<p>Please find your invoice details below.</p>`;

    const heading = isReminder
      ? `Payment Reminder — Invoice ${invoiceNumber}`
      : `Invoice ${invoiceNumber}`;

    const attachmentNote = pdfBase64
      ? `<p>The invoice PDF is attached to this email.</p>`
      : "";

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2 style="margin-bottom: 8px;">${heading}</h2>
        <p>Hello ${escapeHtml(invoice.client_name)},</p>
        ${intro}

        <div style="margin: 16px 0; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb;">
          <p style="margin: 4px 0;"><strong>Invoice Number:</strong> ${invoiceNumber}</p>
          <p style="margin: 4px 0;"><strong>Issue Date:</strong> ${escapeHtml(invoice.issue_date)}</p>
          <p style="margin: 4px 0;"><strong>Due Date:</strong> ${escapeHtml(invoice.due_date)}</p>
          ${paymentMethodHtml}
          ${paymentDateHtml}
          <p style="margin: 4px 0;"><strong>Total:</strong> $${(Number(invoice.total) || 0).toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Status:</strong> ${displayStatus}</p>
        </div>

        ${paymentNotesHtml}

        ${attachmentNote}

        <p>Thank you.</p>
      </div>
    `;

    const subject = isReminder
      ? `Payment Reminder: Invoice ${invoice.invoice_number || ""}`.trim()
      : `Invoice ${invoice.invoice_number || ""}`.trim();

    const { data, error } = await resend.emails.send({
      from: "InvoiceFlow <onboarding@resend.dev>",
      to: clientEmail,
      subject,
      html: emailHtml,
      ...(pdfBase64
        ? {
            attachments: [
              {
                filename: `${invoice.invoice_number || "invoice"}.pdf`,
                content: pdfBase64,
              },
            ],
          }
        : {}),
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json(
        { error: error.message || "Resend failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Send invoice route error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error",
      },
      { status: 500 }
    );
  }
}
