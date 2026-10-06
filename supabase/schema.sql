-- FinPilot production MVP schema
-- Run this once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_number text not null,
  customer text not null,
  amount numeric(14,2) not null check (amount >= 0),
  due date not null,
  status text not null check (status in ('Paid','Overdue','Pending')),
  risk text not null check (risk in ('Low','Medium','High')),
  po_amount numeric(14,2) not null default 0,
  received_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(user_id, invoice_number)
);

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'completed',
  trace jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text,
  extracted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  citation text not null,
  created_at timestamptz not null default now()
);

alter table public.invoices enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.documents enable row level security;
alter table public.policies enable row level security;

drop policy if exists "invoices own rows" on public.invoices;
create policy "invoices own rows" on public.invoices
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "workflow runs own rows" on public.workflow_runs;
create policy "workflow runs own rows" on public.workflow_runs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "documents own rows" on public.documents;
create policy "documents own rows" on public.documents
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "policies own rows" on public.policies;
create policy "policies own rows" on public.policies
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "document storage read own" on storage.objects;
create policy "document storage read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "document storage insert own" on storage.objects;
create policy "document storage insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "document storage delete own" on storage.objects;
create policy "document storage delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.seed_finpilot_workspace()
returns void
language plpgsql
security invoker
as $$
begin
  if not exists (select 1 from public.invoices where user_id = auth.uid()) then
    insert into public.invoices (user_id, invoice_number, customer, amount, due, status, risk, po_amount, received_amount)
    values
      (auth.uid(),'INV-1042','Acme Corp',480000,'2026-09-15','Overdue','High',480000,480000),
      (auth.uid(),'INV-1045','Northstar Labs',215000,'2026-09-25','Overdue','Medium',215000,205000),
      (auth.uid(),'INV-1051','Orbit Systems',98000,'2026-10-12','Pending','Low',98000,98000),
      (auth.uid(),'INV-1038','Vertex Health',620000,'2026-09-05','Overdue','High',600000,620000),
      (auth.uid(),'INV-1049','Brightline AI',126000,'2026-09-20','Paid','Low',126000,126000);
  end if;

  if not exists (select 1 from public.policies where user_id = auth.uid()) then
    insert into public.policies (user_id,title,body,citation)
    values
      (auth.uid(),'Collections Policy','Invoices become eligible for escalation after 14 days overdue.','§3.2'),
      (auth.uid(),'Invoice Approval Matrix','Invoices above ₹5L require finance lead approval.','§2.1'),
      (auth.uid(),'Vendor Payment SOP','Three-way matching must pass before payment approval.','§4.4');
  end if;
end;
$$;
