import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { needsPassword } from "@/lib/onboarding";

const navigate = vi.fn();
const rpc = vi.fn(async (..._args: unknown[]) => ({ error: null }));
const updateUser = vi.fn(async (..._args: unknown[]) => ({ error: null }));
let user: Record<string, unknown> | null;
let role: string | null;
let profile: Record<string, unknown>;
let firm: Record<string, unknown>;

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => opts,
  useNavigate: () => navigate,
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user } }),
      getSession: async () => ({ data: { session: user ? {} : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      updateUser: (...a: unknown[]) => updateUser(...a),
    },
    rpc: (...a: unknown[]) => rpc(...a),
    from: (table: string) => ({
      select: () => ({
        // firm_settings: row security picks the firm, so no filter
        maybeSingle: async () => ({ data: firm, error: null }),
        eq: () =>
          table === "user_roles"
            ? Promise.resolve({ data: role ? [{ role }] : [], error: null })
            : { maybeSingle: async () => ({ data: profile, error: null }) },
      }),
    }),
  },
}));

import { Route } from "@/routes/welcome";
const Welcome = (Route as unknown as { component: React.ComponentType }).component;

function show() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Welcome />
    </QueryClientProvider>,
  );
}
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  navigate.mockReset();
  rpc.mockClear();
  updateUser.mockClear();
  user = {
    id: "u1",
    email: "pat@moyo.test",
    invited_at: "2026-11-04T08:00:00Z",
    user_metadata: { invited: true },
  };
  role = "partner";
  profile = { full_name: "Pat Moyo", title: null, phone: null, onboarded_at: null };
  firm = { firm_name: "Moyo & Co", vat_rate: 0 };
});

describe("onboarding", () => {
  it("knows who still has to choose a password", () => {
    expect(needsPassword({ user_metadata: { invited: true } })).toBe(true);
    expect(needsPassword({ invited_at: "2026-11-01", user_metadata: {} })).toBe(true);
    expect(needsPassword({ invited_at: "2026-11-01", user_metadata: { password_set: true } })).toBe(
      false,
    );
    expect(needsPassword({ user_metadata: {} })).toBe(false);
  });

  it("takes an invited managing partner through password, their details and the firm", async () => {
    show();
    expect(await screen.findByRole("heading", { name: "Welcome to Acta" })).toBeInTheDocument();
    type("Password", "short");
    type("Type it again", "short");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("at least 8");
    type("Password", "correct horse");
    type("Type it again", "correct horse");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "About you" })).toBeInTheDocument();
    expect(updateUser).toHaveBeenCalledWith({
      password: "correct horse",
      data: { invited: false, password_set: true },
    });
    expect(screen.getByText(/joining as a partner at Moyo & Co/)).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Pat Moyo");
    type("Job title", "Managing Partner");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByRole("heading", { name: "Check your firm's details" }),
    ).toBeInTheDocument();
    type("Firm name", " ");
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("firm's name");
    type("Firm name", "Moyo & Partners");
    type("VAT rate (%)", "15");
    expect(screen.getByLabelText("How your invoices will look")).toHaveTextContent(
      "Moyo & Partners",
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));

    expect(await screen.findByRole("heading", { name: /You're all set, Pat/ })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith(
      "complete_onboarding",
      expect.objectContaining({
        _full_name: "Pat Moyo",
        _title: "Managing Partner",
        _firm: expect.objectContaining({ firm_name: "Moyo & Partners", vat_rate: "15" }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Invite your team" }));
    expect(navigate).toHaveBeenCalledWith({ to: "/team" });
  });

  it("asks a team member for a password and their own details only", async () => {
    role = "lawyer";
    user = { id: "u2", email: "lee@moyo.test", user_metadata: {} };
    show();
    expect(await screen.findByRole("heading", { name: "Welcome to Acta" })).toBeInTheDocument();
    type("Password", "correct horse");
    type("Type it again", "correct horse");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "About you" })).toBeInTheDocument();
    expect(screen.queryByText("Your firm")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByText("Welcome to Moyo & Co.")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("complete_onboarding", {
      _full_name: "Pat Moyo",
      _title: "",
      _phone: "",
    });
  });

  it("sends people who already finished straight to the dashboard", async () => {
    profile = { ...profile, onboarded_at: "2026-10-01T00:00:00Z" };
    show();
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/dashboard", replace: true }),
    );
  });
});
