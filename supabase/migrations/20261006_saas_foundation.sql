-- FinPilot SaaS foundation: organizations, roles, plans, usage and audit trail.
-- Run after supabase/schema.sql.

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan text not null default 'free' check (plan in ('free','pro','business')),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin','member','viewer')),
  token text not null unique default encode(gen_random_bytes(24),'hex'),
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  provider text not null default 'stripe',
  provider_customer_id text,
  provider_subscription_id text,
  status text not null default 'inactive',
  plan text not null default 'free',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  units integer not null default 1 check (units > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workspace_members_user_idx on public.workspace_members(user_id);
create index if not exists usage_events_workspace_idx on public.usage_events(workspace_id,created_at desc);
create index if not exists audit_logs_workspace_idx on public.audit_logs(workspace_id,created_at desc);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_events enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace and user_id = auth.uid()
  );
$$;

create or replace function public.workspace_role(target_workspace uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.workspace_members
  where workspace_id = target_workspace and user_id = auth.uid()
  limit 1;
$$;

drop policy if exists "workspace members can read workspace" on public.workspaces;
create policy "workspace members can read workspace" on public.workspaces
for select using (public.is_workspace_member(id));

drop policy if exists "workspace members can read memberships" on public.workspace_members;
create policy "workspace members can read memberships" on public.workspace_members
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace admins manage memberships" on public.workspace_members;
create policy "workspace admins manage memberships" on public.workspace_members
for all using (public.workspace_role(workspace_id) in ('owner','admin'))
with check (public.workspace_role(workspace_id) in ('owner','admin'));

drop policy if exists "workspace admins manage invites" on public.workspace_invites;
create policy "workspace admins manage invites" on public.workspace_invites
for all using (public.workspace_role(workspace_id) in ('owner','admin'))
with check (public.workspace_role(workspace_id) in ('owner','admin'));

drop policy if exists "workspace members read subscriptions" on public.subscriptions;
create policy "workspace members read subscriptions" on public.subscriptions
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members read usage" on public.usage_events;
create policy "workspace members read usage" on public.usage_events
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members read audit" on public.audit_logs;
create policy "workspace members read audit" on public.audit_logs
for select using (public.is_workspace_member(workspace_id));

-- Create one personal workspace for each existing user that does not have one.
insert into public.workspaces (name,slug,owner_id)
select
  coalesce(split_part(coalesce(u.email,'workspace'),'@',1),'Workspace') || '''s Workspace',
  'ws-' || substr(replace(u.id::text,'-',''),1,16),
  u.id
from auth.users u
where not exists (select 1 from public.workspaces w where w.owner_id=u.id);

insert into public.workspace_members(workspace_id,user_id,role)
select w.id,w.owner_id,'owner'
from public.workspaces w
where not exists (
  select 1 from public.workspace_members m
  where m.workspace_id=w.id and m.user_id=w.owner_id
);

insert into public.subscriptions(workspace_id,plan,status)
select w.id,w.plan,'inactive'
from public.workspaces w
where not exists (select 1 from public.subscriptions s where s.workspace_id=w.id);

-- Keep legacy records isolated per user's first workspace until the app is migrated fully.
alter table public.invoices add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.workflow_runs add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.documents add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.policies add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

update public.invoices i set workspace_id=w.id
from public.workspaces w
where i.workspace_id is null and w.owner_id=i.user_id;
update public.workflow_runs r set workspace_id=w.id
from public.workspaces w
where r.workspace_id is null and w.owner_id=r.user_id;
update public.documents d set workspace_id=w.id
from public.workspaces w
where d.workspace_id is null and w.owner_id=d.user_id;
update public.policies p set workspace_id=w.id
from public.workspaces w
where p.workspace_id is null and w.owner_id=p.user_id;

alter table public.invoices enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.documents enable row level security;
alter table public.policies enable row level security;

drop policy if exists "invoices workspace access" on public.invoices;
create policy "invoices workspace access" on public.invoices
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "workflow workspace access" on public.workflow_runs;
create policy "workflow workspace access" on public.workflow_runs
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "documents workspace access" on public.documents;
create policy "documents workspace access" on public.documents
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "policies workspace access" on public.policies;
create policy "policies workspace access" on public.policies
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create or replace function public.create_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare new_id uuid; clean_slug text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  clean_slug := regexp_replace(lower(trim(workspace_name)), '[^a-z0-9]+', '-', 'g');
  clean_slug := trim(both '-' from clean_slug);
  if clean_slug = '' then clean_slug := 'workspace'; end if;
  clean_slug := clean_slug || '-' || substr(replace(auth.uid()::text,'-',''),1,8);
  insert into public.workspaces(name,slug,owner_id) values (trim(workspace_name),clean_slug,auth.uid()) returning id into new_id;
  insert into public.workspace_members(workspace_id,user_id,role) values (new_id,auth.uid(),'owner');
  insert into public.subscriptions(workspace_id,plan,status) values (new_id,'free','inactive');
  return new_id;
end;
$$;
