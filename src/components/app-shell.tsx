import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, Briefcase, Users, CalendarDays, CheckSquare, FileText, Receipt, BarChart3, Inbox,
  Settings, Scale, Search, LogOut, Moon, Sun, Menu,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, isPartner } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/legal";
import { Button } from "@/components/ui/button";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Sheet, SheetContent } from "@/components/ui/sheet";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inquiries", label: "Inquiries", icon: Inbox },
  { to: "/matters", label: "Matters", icon: Briefcase },
  { to: "/clients", label: "Clients", icon: Users, hideFor: ["frontdesk"] },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/tasks", label: "Tasks", icon: CheckSquare, hideFor: ["frontdesk"] },
  { to: "/documents", label: "Documents", icon: FileText, hideFor: ["frontdesk"] },
  { to: "/billing", label: "Billing", icon: Receipt, hideFor: ["staff", "paralegal", "frontdesk"] },
  { to: "/reports", label: "Reports", icon: BarChart3, adminOnly: true },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { data: me } = useMe();
  const role = me?.role;
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-5 pb-4 pt-6">
        <div className="flex items-center gap-2.5">
          <Scale className="h-[22px] w-[22px] text-sidebar-primary" />
          <span className="font-serif text-[15px] font-semibold uppercase tracking-[0.08em] text-sidebar-accent-foreground">Docket</span>
        </div>
        <div className="ml-[31px] mt-3 h-px w-8 bg-sidebar-primary" />
        <p className="ml-[31px] mt-2 text-xs text-sidebar-quiet">Case management</p>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.filter((n) => {
          if ("adminOnly" in n && n.adminOnly) return isPartner(role);
          if ("hideFor" in n) return !(n.hideFor as readonly string[]).includes(role ?? "");
          return true;
        }).map((n) => (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
          >
            <n.icon className="h-4 w-4" />
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-4 text-xs">
        <div className="truncate text-sm text-sidebar-accent-foreground">{me?.profile?.full_name ?? "…"}</div>
        <div className="text-sidebar-primary">{role ? ROLE_LABELS[role] : ""}</div>
      </div>
    </div>
  );
}

function GlobalSearch({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["search", q],
    enabled: open && q.trim().length > 1,
    queryFn: async () => {
      const term = `%${q.trim()}%`;
      const [m, c, d] = await Promise.all([
        supabase.from("matters").select("id, title, matter_number").or(`title.ilike.${term},matter_number.ilike.${term},case_number.ilike.${term}`).limit(8),
        supabase.from("clients").select("id, name").ilike("name", term).limit(8),
        supabase.from("documents").select("id, name, matter_id").ilike("name", term).limit(8),
      ]);
      return { matters: m.data ?? [], clients: c.data ?? [], documents: d.data ?? [] };
    },
  });
  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search matters, clients, documents…" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>{q.length < 2 ? "Type at least 2 characters." : "No results."}</CommandEmpty>
        {!!data?.matters.length && (
          <CommandGroup heading="Matters">
            {data.matters.map((m) => (
              <CommandItem key={m.id} value={`m-${m.id}-${m.title}`} onSelect={() => { setOpen(false); navigate({ to: "/matters/$id", params: { id: m.id } }); }}>
                <span className="tabular mr-2 text-xs text-muted-foreground">{m.matter_number}</span>{m.title}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {!!data?.clients.length && (
          <CommandGroup heading="Clients">
            {data.clients.map((c) => (
              <CommandItem key={c.id} value={`c-${c.id}-${c.name}`} onSelect={() => { setOpen(false); navigate({ to: "/clients/$id", params: { id: c.id } }); }}>
                {c.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {!!data?.documents.length && (
          <CommandGroup heading="Documents">
            {data.documents.map((d) => (
              <CommandItem key={d.id} value={`d-${d.id}-${d.name}`} onSelect={() => { setOpen(false); navigate(d.matter_id ? { to: "/matters/$id", params: { id: d.matter_id } } : { to: "/documents" }); }}>
                <FileText className="mr-2 h-4 w-4 text-muted-foreground" />{d.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("docket-theme", next ? "dark" : "light");
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 md:block"><SidebarNav /></aside>
      <Sheet open={mobile} onOpenChange={setMobile}>
        <SheetContent side="left" className="w-64 border-0 p-0"><SidebarNav onNavigate={() => setMobile(false)} /></SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur md:px-8">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobile(true)} aria-label="Menu"><Menu className="h-4 w-4" /></Button>
          <button onClick={() => setOpen(true)} className="flex h-9 w-full max-w-md items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground hover:bg-accent">
            <Search className="h-4 w-4" /> Search…
            <kbd className="ml-auto rounded border bg-muted px-1.5 text-[10px]">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <UserChip />
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out"><LogOut className="h-4 w-4" /></Button>
          </div>
        </header>
        <main className="flex-1 px-4 py-8 md:px-8"><Outlet /></main>
      </div>
      <GlobalSearch open={open} setOpen={setOpen} />
    </div>
  );
}

function UserChip() {
  const { data: me } = useMe();
  const name = me?.profile?.full_name;
  if (!name) return null;
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <Link to="/settings" className="mr-1 flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-accent" aria-label="Your profile settings">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{initials}</span>
      <span className="hidden max-w-32 truncate text-sm sm:block">{name}</span>
    </Link>
  );
}

export function PageHeader({ eyebrow, title, actions }: { eyebrow?: string; title: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title mt-1">{title}</h1>
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-card px-6 py-14 text-center">
      <h3 className="text-lg">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
