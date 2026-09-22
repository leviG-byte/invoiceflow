// Bill of sale = a document recording the transfer of goods from a seller
// (the business) to a buyer. General-goods flavor: quantity × unit price lines.

export type BillItem = {
  description: string;
  quantity: string;
  unitPrice: string;
};

export type SavedBill = {
  id?: string;
  billNumber: string;
  buyerName: string;
  buyerEmail?: string;
  buyerPhone?: string;
  buyerAddress?: string;
  saleDate: string;
  paymentMethod?: string;
  items: BillItem[];
  notes?: string;
  asIs: boolean;
  total: number;
};

export const AS_IS_CLAUSE =
  "The above item(s) are sold in \"AS-IS\" condition, without any warranty of " +
  "any kind, express or implied. The buyer accepts the item(s) in their present " +
  "condition and acknowledges having had the opportunity to inspect them. The " +
  "seller certifies that the item(s) are sold free and clear of all liens and " +
  "encumbrances, and that the seller is the lawful owner with full authority to sell.";

export function getBillItemAmount(item: BillItem): number {
  const quantity = Number(item.quantity);
  const unitPrice = Number(item.unitPrice) || 0;
  // A blank quantity is treated as a single unit so a simple one-line sale
  // ("one lawn mower — $150") does not require typing a quantity.
  const effectiveQuantity = item.quantity === "" ? 1 : quantity || 0;
  return effectiveQuantity * unitPrice;
}

export function calculateBillTotal(items: BillItem[]): number {
  return items.reduce((sum, item) => sum + getBillItemAmount(item), 0);
}

export function isBillItemComplete(item: BillItem): boolean {
  return Boolean(item.description.trim() && item.unitPrice !== "");
}

export function generateNextBillNumber(bills: SavedBill[]): string {
  if (bills.length === 0) {
    return "BOS-001";
  }

  let maxNumber = 0;

  bills.forEach((bill) => {
    const match = bill.billNumber.match(/(\d+)/);

    if (match) {
      const parsedNumber = Number(match[1]);

      if (parsedNumber > maxNumber) {
        maxNumber = parsedNumber;
      }
    }
  });

  return `BOS-${String(maxNumber + 1).padStart(3, "0")}`;
}

export function formatSaleDate(dateString?: string) {
  if (!dateString) return "—";

  const [year, month, day] = dateString.split("-");
  if (!year || !month || !day) return dateString;

  return `${month}/${day}/${year}`;
}
