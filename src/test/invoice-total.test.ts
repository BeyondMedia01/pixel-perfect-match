import { describe, expect, it } from "vitest";
import { invoiceSubtotal, invoiceTotal } from "@/components/matter-billing";

const items = [
  { quantity: 2, unit_price: 300 },
  { quantity: 1.5, unit_price: 120 },
];

describe("invoice totals", () => {
  it("adds line items", () => expect(invoiceSubtotal({ invoice_items: items })).toBe(780));
  it("adds VAT at the invoice's own rate", () =>
    expect(invoiceTotal({ invoice_items: items, tax_rate: 15 })).toBe(897));
  it("treats a missing rate as no VAT", () =>
    expect(invoiceTotal({ invoice_items: items, tax_rate: null })).toBe(780));
  it("rounds to cents", () =>
    expect(invoiceTotal({ invoice_items: [{ quantity: 1, unit_price: 0.1 }], tax_rate: 15 })).toBe(
      0.12,
    ));
});
