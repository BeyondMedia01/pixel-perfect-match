import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Download, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Pager } from "@/components/pager";
import { allRows, usePager } from "@/lib/paging";
import { isPartner, useMe, useProfiles } from "@/lib/auth";
import { EmptyState } from "./app-shell";
import { useConfirm } from "./confirm";
import { Button } from "@/components/ui/button";

const BUCKET = "matter-documents";

function sizeLabel(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentList({ matterId, clientId }: { matterId?: string; clientId?: string }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: profiles } = useProfiles();
  const fileRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const { data: docs } = useQuery({
    queryKey: ["documents", matterId ?? null, clientId ?? null],
    queryFn: async () => {
      let q = supabase
        .from("documents")
        .select("*, matters(matter_number, title)")
        .order("created_at", { ascending: false })
        .order("id");
      if (matterId) q = q.eq("matter_id", matterId);
      if (clientId) q = q.eq("client_id", clientId);
      return allRows(q);
    },
  });

  const pager = usePager(docs ?? [], 50);
  const uploaderName = (id: string | null) => profiles?.find((p) => p.id === id)?.full_name ?? "—";

  async function upload(files: FileList | null) {
    if (!files?.length || !me) return;
    setBusy(true);
    let failed = 0;
    for (const file of Array.from(files)) {
      const path = `${me.user.id}/${crypto.randomUUID()}-${file.name}`;
      const up = await supabase.storage
        .from(BUCKET)
        .upload(path, file, file.type ? { contentType: file.type } : {});
      if (up.error) {
        failed++;
        toast.error(`${file.name}: ${up.error.message}`);
        continue;
      }
      const { error } = await supabase.from("documents").insert({
        matter_id: matterId ?? null,
        client_id: clientId ?? null,
        name: file.name,
        file_path: path,
        size_bytes: file.size,
        content_type: file.type || null,
        uploaded_by: me.user.id,
      });
      if (error) {
        failed++;
        toast.error(`${file.name}: ${error.message}`);
      }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    qc.invalidateQueries({ queryKey: ["documents"] });
    if (!failed) toast.success(files.length > 1 ? "Files uploaded" : "File uploaded");
  }

  async function download(doc: { file_path: string; name: string }) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 60);
    if (error || !data) {
      toast.error(error?.message ?? "Could not open the file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function remove(doc: { id: string; file_path: string; name: string }) {
    if (
      !(await confirm({
        title: `Delete ${doc.name}?`,
        body: "The file is removed for everyone at the firm. This can't be undone.",
        action: "Delete",
        destructive: true,
      }))
    )
      return;
    const { data: deleted, error } = await supabase
      .from("documents")
      .delete()
      .eq("id", doc.id)
      .select("id");
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!deleted?.length) {
      toast.error("Only the person who uploaded this file or a partner can delete it.");
      return;
    }
    await supabase.storage.from(BUCKET).remove([doc.file_path]);
    qc.invalidateQueries({ queryKey: ["documents"] });
    toast.success(`Deleted ${doc.name}`);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {docs?.length ?? 0} document{docs?.length === 1 ? "" : "s"}
        </p>
        <div>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" /> {busy ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>
      {!docs?.length ? (
        <EmptyState
          title="No documents yet"
          body="Upload pleadings, contracts, correspondence and other files here. Files are private to the firm."
        />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {pager.visible.map((d) => (
            <li key={d.id} className="flex items-center gap-4 px-4 py-3 text-sm">
              <button
                onClick={() => download(d)}
                className="flex-1 truncate text-left font-medium hover:underline"
              >
                {d.name}
              </button>
              {d.matters && !matterId && (
                <span className="tabular hidden text-xs text-muted-foreground sm:block">
                  {d.matters.matter_number}
                </span>
              )}
              <span className="hidden w-20 text-xs text-muted-foreground sm:block">
                {sizeLabel(d.size_bytes)}
              </span>
              <span className="hidden w-28 truncate text-xs text-muted-foreground md:block">
                {uploaderName(d.uploaded_by)}
              </span>
              <span className="tabular w-24 text-xs text-muted-foreground">
                {format(new Date(d.created_at), "d MMM yyyy")}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Download ${d.name}`}
                onClick={() => download(d)}
              >
                <Download className="h-4 w-4" />
              </Button>
              {(d.uploaded_by === me?.user.id || isPartner(me?.role)) && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${d.name}`}
                  onClick={() => remove(d)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager pager={pager} noun="documents" />
    </div>
  );
}
