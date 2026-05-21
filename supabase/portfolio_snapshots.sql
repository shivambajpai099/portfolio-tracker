-- Run in Supabase SQL editor.

create table if not exists public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.portfolio_snapshots enable row level security;

create or replace function public.set_portfolio_snapshots_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_portfolio_snapshots_updated_at on public.portfolio_snapshots;
create trigger trg_portfolio_snapshots_updated_at
before update on public.portfolio_snapshots
for each row
execute function public.set_portfolio_snapshots_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'portfolio_snapshots'
      and policyname = 'portfolio_snapshots_select_own'
  ) then
    create policy "portfolio_snapshots_select_own"
      on public.portfolio_snapshots
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'portfolio_snapshots'
      and policyname = 'portfolio_snapshots_insert_own'
  ) then
    create policy "portfolio_snapshots_insert_own"
      on public.portfolio_snapshots
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'portfolio_snapshots'
      and policyname = 'portfolio_snapshots_update_own'
  ) then
    create policy "portfolio_snapshots_update_own"
      on public.portfolio_snapshots
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'portfolio_snapshots'
      and policyname = 'portfolio_snapshots_delete_own'
  ) then
    create policy "portfolio_snapshots_delete_own"
      on public.portfolio_snapshots
      for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

