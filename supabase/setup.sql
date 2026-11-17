-- Blockhaven: run this once in the Supabase SQL editor.
create table if not exists public.bh_docs(
  world text not null,
  path text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(world,path)
);
alter table public.bh_docs enable row level security;
drop policy if exists "bh read" on public.bh_docs;
drop policy if exists "bh insert" on public.bh_docs;
drop policy if exists "bh update" on public.bh_docs;
create policy "bh read" on public.bh_docs for select using (true);
create policy "bh insert" on public.bh_docs for insert with check (true);
create policy "bh update" on public.bh_docs for update using (true) with check (true);

-- merges block edits into a chunk document in one step, so two players editing the same chunk don't overwrite each other
create or replace function public.bh_merge_e(p_world text,p_path text,p_patch jsonb) returns boolean
language plpgsql as $$
declare n int;
begin
  update public.bh_docs set data=jsonb_set(data,'{e}',coalesce(data->'e','{}'::jsonb)||p_patch,true),updated_at=now()
   where world=p_world and path=p_path;
  get diagnostics n=row_count;
  return n>0;
end $$;
grant execute on function public.bh_merge_e(text,text,jsonb) to anon, authenticated;

-- live updates for everyone looking at the same world
alter table public.bh_docs replica identity full;
alter publication supabase_realtime add table public.bh_docs;
