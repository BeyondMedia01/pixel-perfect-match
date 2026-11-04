import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const saved: Record<string, unknown>[] = [];
let row: Record<string, unknown> | null = null;

vi.mock("@/lib/auth", () => ({
  useMe: () => ({ data: { user: { id: "u1", email: "ruth@firm.test" }, role: "lawyer" } }),
  isInternalRole: () => true,
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => async () => ({ email: "not_connected", whatsapp: "setup_required" }),
}));
vi.mock("@/lib/notification-channels.functions", () => ({ getNotificationChannels: {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      upsert: (patch: Record<string, unknown>) => {
        saved.push(patch);
        row = { ...row, ...patch };
        return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
      },
    }),
  },
}));

import { NotificationPreferences } from "@/components/notification-preferences";

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NotificationPreferences />
    </QueryClientProvider>,
  );
}

describe("notification preferences", () => {
  it("lists every alert type with a switch per channel and flags unconnected channels", async () => {
    row = null;
    show();
    expect(await screen.findByText("Tasks assigned to me")).toBeInTheDocument();
    for (const label of ["Court dates and hearings", "Announcements", "New inquiries"])
      expect(screen.getByText(label)).toBeInTheDocument();
    expect(await screen.findAllByText("Not connected")).not.toHaveLength(0);
    expect(screen.getAllByText("Setup incomplete")).not.toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Email and WhatsApp aren't connected yet",
    );
    expect(screen.getByText("ruth@firm.test")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Announcements by In-app" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Announcements by WhatsApp" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Announcements by Email" })).toHaveAttribute(
      "aria-describedby",
      "channel-note-email",
    );
  });

  it("saves one channel choice and asks for a WhatsApp number when needed", async () => {
    row = null;
    saved.length = 0;
    show();
    fireEvent.click(await screen.findByRole("switch", { name: "Announcements by WhatsApp" }));
    expect(await screen.findByText(/Add your number/)).toBeInTheDocument();
    expect(saved[0]).toMatchObject({ user_id: "u1", whatsapp_announcements: true });

    const form = screen.getByLabelText("Your WhatsApp number").closest("form")!;
    fireEvent.change(screen.getByLabelText("Your WhatsApp number"), {
      target: { value: "0771234567" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("international format");

    fireEvent.change(screen.getByLabelText("Your WhatsApp number"), {
      target: { value: "+263 77 123 4567" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Only you can see this number.")).toBeInTheDocument();
    expect(saved.at(-1)).toMatchObject({ whatsapp_number: "+263771234567" });
  });
});
