import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { intakeSchema } from "./intake-schema";

export const submitIntake = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => intakeSchema.parse(input))
  .handler(async ({ data }) => {
    // Public write only: validated fields, no caller-selected workflow state or user ID.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ip = getRequestHeader("cf-connecting-ip");
    const ipHash = ip
      ? Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip))),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("")
      : null;
    const { error } = await supabaseAdmin.rpc("submit_client_intake", {
      _name: data.name,
      _email: data.email,
      _phone: data.phone,
      _area: data.practice_area,
      _opposing: data.opposing_party,
      _related: data.related_names,
      _summary: data.summary,
      ...(ipHash ? { _ip_hash: ipHash } : {}),
    });
    if (error)
      return {
        ok: false,
        error: error.message.includes("INTAKE_RATE_LIMIT")
          ? "Too many requests. Please try again in an hour."
          : "Your inquiry could not be saved. Please try again.",
      };
    return { ok: true, error: null };
  });
