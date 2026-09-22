"use client";

import { useParams } from "next/navigation";
import BillForm from "@/components/BillForm";

export default function EditBillPage() {
  const params = useParams();
  const id = params.id as string;

  return <BillForm mode="edit" billId={id} />;
}
