import type { SupabaseClient } from "@supabase/supabase-js";

// Minimal invoice shape needed to keep a receipt record in sync. Kept loose so
// every caller (edit page, create page, list quick-toggle) can pass what it has.
export type ReceiptSourceInvoice = {
  id: string;
  invoiceNumber: string;
  clientName: string;
  total: number;
  isPaid: boolean;
  paymentDate?: string | null;
  paymentMethod?: string | null;
};

export function receiptNumberFor(invoiceNumber: string): string {
  return `REC-${(invoiceNumber || "").trim()}`.replace(/-+$/, "");
}

// Keeps the receipts table in sync with an invoice's paid state:
//   Paid    -> upsert a receipt record (idempotent, one per invoice)
//   Unpaid  -> remove any receipt so the ledger stays accurate
// Failures are logged but never block the invoice save that triggered them.
export async function syncReceiptForInvoice(
  supabase: SupabaseClient,
  userId: string,
  invoice: ReceiptSourceInvoice
): Promise<void> {
  try {
    if (invoice.isPaid) {
      const { error } = await supabase.from("receipts").upsert(
        {
          user_id: userId,
          invoice_id: invoice.id,
          receipt_number: receiptNumberFor(invoice.invoiceNumber),
          client_name: invoice.clientName || null,
          amount: invoice.total || 0,
          payment_date: invoice.paymentDate || null,
          payment_method: invoice.paymentMethod || null,
        },
        { onConflict: "invoice_id" }
      );

      if (error) {
        console.error("Receipt upsert error:", error);
      }
    } else {
      const { error } = await supabase
        .from("receipts")
        .delete()
        .eq("invoice_id", invoice.id)
        .eq("user_id", userId);

      if (error) {
        console.error("Receipt cleanup error:", error);
      }
    }
  } catch (error) {
    console.error("Receipt sync failed:", error);
  }
}
