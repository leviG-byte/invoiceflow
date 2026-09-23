// Bill of sale = a document recording the transfer of goods from a seller
// (the business) to a buyer. General-goods flavor: quantity × unit price lines.

export type BillItem = {
  description: string;
  quantity: string;
  unitPrice: string;
};

// Which side of the sale the account owner (the business) is on. "seller" is the
// classic bill of sale; "buyer" lets the owner document a purchase they made from
// a private seller who provided no paperwork (proof of purchase). Either way the
// other party is stored in the buyer_* columns and relabeled by role.
export type BusinessRole = "seller" | "buyer";

export type SavedBill = {
  id?: string;
  billNumber: string;
  businessRole: BusinessRole;
  // The counterparty (the other person): the buyer when the owner is the seller,
  // or the seller when the owner is the buyer. Stored in buyer_* columns.
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

// The counterparty's role is the opposite of the business's role.
export function counterpartyLabel(businessRole: BusinessRole): "Seller" | "Buyer" {
  return businessRole === "seller" ? "Buyer" : "Seller";
}

export function businessLabel(businessRole: BusinessRole): "Seller" | "Buyer" {
  return businessRole === "seller" ? "Seller" : "Buyer";
}

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
