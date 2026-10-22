import type { Database } from "@/integrations/supabase/types";

export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
};

export const INVOICE_STATUS_VARIANTS: Record<InvoiceStatus, "intake" | "active" | "closed" | "quiet"> = {
  draft: "quiet",
  sent: "intake",
  paid: "closed",
  void: "quiet",
};

export function fmtMoney(amount: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount ?? 0);
}

export function fmtHours(hours: number | null | undefined) {
  return `${(hours ?? 0).toFixed(1)}h`;
}
