import { describe, expect, it, vi } from "vitest";
import { allRows } from "@/lib/paging";

function fakeQuery(total: number) {
  const calls: [number, number][] = [];
  const rows = Array.from({ length: total }, (_, i) => ({ i }));
  return {
    calls,
    range: vi.fn(async (from: number, to: number) => {
      calls.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    }),
  };
}

describe("allRows", () => {
  it("keeps going past the 1,000-row limit", async () => {
    const q = fakeQuery(2500);
    const rows = await allRows(q);
    expect(rows).toHaveLength(2500);
    expect(q.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });
  it("makes one request for short lists", async () => {
    const q = fakeQuery(12);
    expect(await allRows(q)).toHaveLength(12);
    expect(q.calls).toHaveLength(1);
  });
  it("asks once more when the list is an exact multiple", async () => {
    const q = fakeQuery(2000);
    expect(await allRows(q)).toHaveLength(2000);
    expect(q.calls).toHaveLength(3);
  });
  it("surfaces errors instead of returning a partial list", async () => {
    await expect(
      allRows({ range: async () => ({ data: null, error: { message: "boom" } }) }),
    ).rejects.toThrow("boom");
  });
});
