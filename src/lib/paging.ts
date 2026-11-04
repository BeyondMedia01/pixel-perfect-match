import { useEffect, useMemo, useState } from "react";

/** The most rows the database hands back for one request. */
export const DB_PAGE = 1000;

type RangeQuery<T> = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

/**
 * Every row a query matches, fetched 1,000 at a time. The database silently
 * stops at 1,000 rows per request, so lists and totals built from a single
 * request go wrong once a firm has more than that. Give the query a stable
 * order (add .order("id") as a tie-breaker) so pages don't overlap.
 */
export async function allRows<T>(query: RangeQuery<T>, pageSize = DB_PAGE): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) return out;
  }
}

/** Shows a long list a page at a time. Resets to page 1 when the list's filters change. */
export function usePager<T>(rows: T[], pageSize = 50, resetKey?: unknown) {
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [resetKey]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = useMemo(
    () => rows.slice(current * pageSize, (current + 1) * pageSize),
    [rows, current, pageSize],
  );
  return {
    visible,
    page: current,
    pages,
    total: rows.length,
    from: rows.length ? current * pageSize + 1 : 0,
    to: Math.min(rows.length, (current + 1) * pageSize),
    setPage,
  };
}
