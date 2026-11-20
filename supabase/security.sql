-- Run in the Supabase SQL editor as project owner. Review existing policies first.
-- This migration does not remove other policies; permissive policies must be removed separately.
alter table public.notebook_items enable row level security;
drop policy if exists "Users manage own notebook items" on public.notebook_items;
create policy "Users manage own notebook items" on public.notebook_items
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- SECURITY INVOKER retains RLS. PostgreSQL rolls the whole function back on error.
create or replace function public.replace_notebook_items(items jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or jsonb_typeof(items) is distinct from 'array' then
    raise exception 'Authentication and an array of items are required';
  end if;
  if exists (select 1 from jsonb_array_elements(items) x
    where x->>'user_id' is distinct from uid::text
      or coalesce(x->>'item_id', '') = ''
      or coalesce(x->>'item_type', '') not in ('subject','exam','question','meta')
      or jsonb_typeof(x->'data') is distinct from 'object') then
    raise exception 'Invalid notebook item';
  end if;
  delete from public.notebook_items where user_id = uid;
  insert into public.notebook_items (user_id, item_type, item_id, data, updated_at, deleted)
  select uid, x->>'item_type', x->>'item_id', x->'data',
         (x->>'updated_at')::timestamptz, coalesce((x->>'deleted')::boolean, false)
  from jsonb_array_elements(items) x;
end $$;
revoke all on function public.replace_notebook_items(jsonb) from public, anon;
grant execute on function public.replace_notebook_items(jsonb) to authenticated;
