import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, isPartner } from "@/lib/auth";
import { TASK_STATUS_LABELS, type TaskPriority, type TaskStatus } from "@/lib/legal";
import { useConfirm } from "@/components/confirm";
import { Field } from "@/components/matter-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// eslint-disable-next-line react-refresh/only-export-components
export const PRIORITY_LABELS: Record<TaskPriority, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
const INTERNAL_ROLES = ["partner", "admin", "lawyer", "paralegal", "staff"];
const NONE = "__none__";

export type EditableTask = {
  id: string;
  title: string;
  description: string | null;
  matter_id: string | null;
  assignee_id: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  created_by: string | null;
};

/** People a task can be assigned to: partners, lawyers and paralegals. */
// eslint-disable-next-line react-refresh/only-export-components
export function useStaff() {
  return useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const internal = new Set((r.data ?? []).filter((x) => INTERNAL_ROLES.includes(x.role)).map((x) => x.user_id));
      return (p.data ?? []).filter((u) => internal.has(u.id));
    },
  });
}

function friendlyError(message: string) {
  return /row-level security/i.test(message)
    ? "That person can't be given this task. They may be screened from the matter by an ethical wall."
    : message;
}

/**
 * Create a task (no `task`) or edit one. `matterId` fixes the matter, for use
 * on a matter's Tasks tab.
 */
export function TaskDialog({ open, onOpenChange, task, matterId, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: EditableTask | null;
  matterId?: string;
  onSaved?: () => void;
}) {
  const { data: me } = useMe();
  const { data: staff } = useStaff();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const blank = { title: "", description: "", matter_id: matterId ?? NONE, assignee_id: me?.user.id ?? NONE, due_date: "", priority: "medium" as TaskPriority, status: "todo" as TaskStatus };
  const [f, setF] = useState(blank);

  useEffect(() => {
    if (!open) return;
    setF(task
      ? { title: task.title, description: task.description ?? "", matter_id: task.matter_id ?? NONE, assignee_id: task.assignee_id ?? NONE, due_date: task.due_date ?? "", priority: task.priority, status: task.status }
      : { ...blank, assignee_id: me?.user.id ?? NONE });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  const { data: matters } = useQuery({
    queryKey: ["task-matters"],
    enabled: open && !matterId,
    queryFn: async () => (await supabase.from("matters").select("id, title, matter_number").neq("status", "closed").order("matter_number", { ascending: false })).data ?? [],
  });

  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const canDelete = !!task && (task.created_by === me?.user.id || isPartner(me?.role));

  function done() {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["matter"] });
    qc.invalidateQueries({ queryKey: ["staff-notifications"] });
    onSaved?.();
    onOpenChange(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) { toast.error("Give the task a title"); return; }
    setBusy(true);
    const values = {
      title: f.title.trim(),
      description: f.description.trim() || null,
      matter_id: f.matter_id === NONE ? null : f.matter_id,
      assignee_id: f.assignee_id === NONE ? null : f.assignee_id,
      due_date: f.due_date || null,
      priority: f.priority,
    };
    const { error } = task
      ? await supabase.from("tasks").update({ ...values, status: f.status }).eq("id", task.id)
      : await supabase.from("tasks").insert({ ...values, created_by: me?.user.id ?? null });
    setBusy(false);
    if (error) { toast.error(friendlyError(error.message)); return; }
    const who = staff?.find((s) => s.id === values.assignee_id);
    toast.success(task ? "Task updated" : who && who.id !== me?.user.id ? `Task assigned to ${who.full_name || who.email}` : "Task added");
    done();
  }

  async function remove() {
    if (!task) return;
    if (!(await confirm({ title: `Delete "${task.title}"?`, body: "The task is removed for everyone.", action: "Delete", destructive: true }))) return;
    const { data, error } = await supabase.from("tasks").delete().eq("id", task.id).select("id");
    if (error || !data?.length) { toast.error(error?.message ?? "Only the person who created this task or a partner can delete it."); return; }
    toast.success("Task deleted");
    done();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="text-xl font-semibold">{task ? "Edit task" : "New task"}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Task" className="sm:col-span-2">
            <Input required autoFocus value={f.title} onChange={(e) => set("title")(e.target.value)} placeholder="e.g. Draft heads of argument" />
          </Field>
          <Field label="Details (optional)" className="sm:col-span-2">
            <Textarea value={f.description} onChange={(e) => set("description")(e.target.value)} rows={3} />
          </Field>
          <Field label="Assigned to">
            <Select value={f.assignee_id} onValueChange={set("assignee_id")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {staff?.map((s) => <SelectItem key={s.id} value={s.id}>{(s.full_name || s.email) + (s.id === me?.user.id ? " (me)" : "")}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Due date">
            <Input type="date" value={f.due_date} onChange={(e) => set("due_date")(e.target.value)} />
          </Field>
          {!matterId && (
            <Field label="Matter (optional)" className="sm:col-span-2">
              <Select value={f.matter_id} onValueChange={set("matter_id")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not linked to a matter</SelectItem>
                  {matters?.map((m) => <SelectItem key={m.id} value={m.id}>{m.matter_number} · {m.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Priority">
            <Select value={f.priority} onValueChange={(v) => set("priority")(v as TaskPriority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          {task && (
            <Field label="Status">
              <Select value={f.status} onValueChange={(v) => set("status")(v as TaskStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((s) => <SelectItem key={s} value={s}>{TASK_STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            {canDelete ? <Button type="button" variant="ghost" className="text-destructive" onClick={remove}>Delete</Button> : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : task ? "Save" : "Add task"}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
