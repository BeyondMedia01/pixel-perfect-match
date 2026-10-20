drop policy "read accessible matters" on public.matters;
create policy "read accessible matters" on public.matters for select to authenticated
  using (public.has_role(auth.uid(),'admin') or responsible_lawyer_id = auth.uid()
    or exists (select 1 from public.matter_assignments a where a.matter_id = matters.id and a.user_id = auth.uid())
    or created_by = auth.uid());