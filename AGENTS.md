<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Public client intake uses a validated server function and a service-role-only atomic database function for durable rate limiting and linked submission/inquiry inserts; anonymous visitors must never access inquiry records.
- Staff notifications derive from RLS-scoped live inquiries, own due-today tasks, and unconfirmed deadlines; per-user read receipts persist separately so workflow records are not changed by reading alerts.
