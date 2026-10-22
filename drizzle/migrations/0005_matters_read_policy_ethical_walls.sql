drop policy "read accessible matters" on public.matters;
create policy "read accessible matters" on public.matters for select to authenticated using (
  public.can_access_matter(id)
  or (created_by = auth.uid() and not exists (
    select 1 from public.matter_ethical_walls w
    where w.matter_id = id and w.user_id = auth.uid()
  ))
);