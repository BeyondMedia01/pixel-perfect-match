import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Scale, ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { intakeSchema } from "@/lib/intake-schema";
import { submitIntake } from "@/lib/intake.functions";
import { PRACTICE_AREAS } from "@/lib/legal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/intake")({
  head: () => ({ meta: [
    { title: "Client inquiry — Acta" },
    { name: "description", content: "Submit a confidential new-client inquiry for review by the legal team." },
    { property: "og:title", content: "Client inquiry — Acta" },
    { property: "og:description", content: "Submit a confidential new-client inquiry for review by the legal team." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: IntakePage,
});

function IntakePage() {
  const submit = useServerFn(submitIntake);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [area, setArea] = useState("other");
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = intakeSchema.safeParse({ ...values, practice_area: area, consent });
    setError("");
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map(i => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({}); setBusy(true);
    try {
      const result = await submit({ data: parsed.data });
      if (result.ok) setDone(true);
      else setError(result.error ?? "Please try again.");
    } catch { setError("Your inquiry could not be sent. Please try again."); }
    finally { setBusy(false); }
  }
  function field(name: string, label: string, options: { required?: boolean; type?: string; maxLength: number; placeholder?: string }) {
    return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} {...options} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `${name}-error` : undefined} />{errors[name] && <p id={`${name}-error`} className="text-xs text-destructive">{errors[name]}</p>}</div>;
  }
  return <div className="min-h-screen bg-background">
    <header className="border-b bg-sidebar text-sidebar-foreground"><div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-5"><Scale className="h-6 w-6 text-sidebar-primary" /><span className="font-serif text-2xl text-sidebar-accent-foreground">Acta</span><span className="ml-auto text-xs text-sidebar-quiet">Client inquiries</span></div></header>
    <main className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      {done ? <section className="py-12 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-success" /><h1 className="mt-6 text-4xl">Inquiry received</h1><p className="mx-auto mt-4 max-w-md text-muted-foreground">Your details have been sent to the legal team for review. Submitting this inquiry does not create a lawyer-client relationship.</p></section> : <>
        <p className="eyebrow">New-client intake</p><h1 className="mt-2 text-4xl">Tell us about your matter</h1><p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Share your contact details and a brief outline. Please do not include identity numbers, passwords, or sensitive documents at this stage.</p>
        <form onSubmit={save} className="mt-8 space-y-8" noValidate>
          <section className="border-t pt-6"><h2 className="mb-5 text-2xl">Your details</h2><div className="grid gap-5 sm:grid-cols-2">
            {field("name", "Full name", { required: true, maxLength: 100 })}
            {field("email", "Email address", { required: true, type: "email", maxLength: 255 })}
            {field("phone", "Phone number (optional)", { type: "tel", maxLength: 40, placeholder: "+263…" })}
          </div></section>
          <section className="border-t pt-6"><h2 className="mb-5 text-2xl">About your matter</h2><div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="practice_area">Area of law</Label><Select value={area} onValueChange={setArea}><SelectTrigger id="practice_area"><SelectValue /></SelectTrigger><SelectContent>{PRACTICE_AREAS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent></Select></div>
            {field("opposing_party", "Opposing party (if any)", { maxLength: 200 })}
            <div className="sm:col-span-2">{field("related_names", "Other people or organisations involved (optional)", { maxLength: 500 })}</div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="summary">Brief description</Label><Textarea id="summary" name="summary" rows={5} maxLength={3000} required aria-invalid={!!errors["summary"]} aria-describedby={errors["summary"] ? "summary-error" : undefined} />{errors["summary"] && <p id="summary-error" className="text-xs text-destructive">{errors["summary"]}</p>}</div>
          </div></section>
          <div className="hidden" aria-hidden="true"><label htmlFor="website">Website</label><input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
          <div className="border-t pt-6"><div className="flex items-start gap-3"><Checkbox id="consent" checked={consent} onCheckedChange={v => setConsent(v === true)} /><Label htmlFor="consent" className="text-sm font-normal leading-6">I agree that the legal team may use these details to review my inquiry, check for conflicts, and contact me about it.</Label></div>{errors["consent"] && <p className="mt-2 text-xs text-destructive">{errors["consent"]}</p>}<p className="mt-4 text-xs leading-5 text-muted-foreground">This is an inquiry only, not legal advice or confirmation that the firm can act for you.</p></div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-4"><span className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-signal" /> Private inquiry</span><Button type="submit" disabled={busy}>{busy ? "Sending…" : "Submit inquiry"}<ArrowRight className="ml-2 h-4 w-4" /></Button></div>
        </form>
      </>}
    </main>
  </div>;
}