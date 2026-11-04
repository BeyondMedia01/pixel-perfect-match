import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// A linked credential alone is not a working staff-alert delivery path.
export const getNotificationChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [internal, frontdesk] = await Promise.all([
      context.supabase.rpc("is_internal"),
      context.supabase.rpc("is_frontdesk"),
    ]);
    if (internal.error || frontdesk.error) throw new Error("Could not check notification access.");
    if (!internal.data && !frontdesk.data) throw new Error("Staff access required.");
    return {
      email: process.env["BREVO_API_KEY"] ? "setup_required" as const : "not_connected" as const,
      whatsapp: process.env["WHATSAPP_API_KEY"] ? "setup_required" as const : "not_connected" as const,
    };
  });