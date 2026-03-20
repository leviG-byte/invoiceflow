import Link from "next/link";

export default function CreateInvoiceButton() {
  return (
    <Link
      href="/new-invoice"
      className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700"
    >
      Create Invoice
    </Link>
  );
}