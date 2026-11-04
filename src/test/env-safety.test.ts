import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// `.env` is committed because Lovable Cloud writes it and builds from it. It may
// only ever hold public values; secrets belong in Lovable Cloud's secret store.
const ALLOWED = new Set([
  "SUPABASE_PROJECT_ID",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_URL",
]);

describe(".env holds public values only", () => {
  const lines = existsSync(".env")
    ? readFileSync(".env", "utf8")
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.trim().startsWith("#"))
    : [];

  it("contains no variables beyond the known public ones", () => {
    const names = lines.map((l) => l.split("=")[0]!.trim());
    expect(names.filter((n) => !ALLOWED.has(n))).toEqual([]);
  });

  it("contains nothing that looks like a secret key", () => {
    const secretish = lines.filter((l) =>
      /sb_secret_|service_role|SERVICE_ROLE|PRIVATE|PASSWORD|-----BEGIN/i.test(l),
    );
    expect(secretish).toEqual([]);
  });
});
