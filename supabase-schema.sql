create extension if not exists pgcrypto;

-- Legacy key/value store kept only so existing data can be migrated automatically.
create table if not exists public.auralis_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.auralis_audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.auralis_members (
  id text primary key,
  data jsonb not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.auralis_transactions (
  id text primary key,
  data jsonb not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.auralis_projects (
  id text primary key,
  data jsonb not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.auralis_announcements (
  id text primary key,
  data jsonb not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.auralis_meetings (
  id text primary key,
  data jsonb not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.auralis_chat_messages (
  id text primary key,
  data jsonb not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.auralis_avatars (
  member_id text primary key,
  image text not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.auralis_reports (
  id text primary key,
  data jsonb not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.auralis_audit_row()
returns trigger
language plpgsql
as $$
declare
  record_key text;
begin
  record_key := coalesce(
    to_jsonb(new)->>'id',
    to_jsonb(old)->>'id',
    to_jsonb(new)->>'member_id',
    to_jsonb(old)->>'member_id'
  );

  insert into public.auralis_audit_log (
    table_name,
    record_id,
    action,
    old_data,
    new_data
  )
  values (
    tg_table_name,
    record_key,
    tg_op,
    case
      when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old)
      else null
    end,
    case
      when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new)
      else null
    end
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_auralis_members on public.auralis_members;
create trigger audit_auralis_members
after insert or update or delete on public.auralis_members
for each row execute function public.auralis_audit_row();

drop trigger if exists audit_auralis_transactions on public.auralis_transactions;
create trigger audit_auralis_transactions
after insert or update or delete on public.auralis_transactions
for each row execute function public.auralis_audit_row();

drop trigger if exists audit_auralis_projects on public.auralis_projects;
create trigger audit_auralis_projects
after insert or update or delete on public.auralis_projects
for each row execute function public.auralis_audit_row();

drop trigger if exists audit_auralis_announcements on public.auralis_announcements;
create trigger audit_auralis_announcements
after insert or update or delete on public.auralis_announcements
for each row execute function public.auralis_audit_row();

drop trigger if exists audit_auralis_meetings on public.auralis_meetings;
create trigger audit_auralis_meetings
after insert or update or delete on public.auralis_meetings
for each row execute function public.auralis_audit_row();

drop trigger if exists audit_auralis_chat_messages on public.auralis_chat_messages;
create trigger audit_auralis_chat_messages
after insert or update or delete on public.auralis_chat_messages
for each row execute function public.auralis_audit_row();

drop trigger if exists audit_auralis_avatars on public.auralis_avatars;
create trigger audit_auralis_avatars
after insert or update or delete on public.auralis_avatars
for each row execute function public.auralis_audit_row();

drop trigger if exists audit_auralis_reports on public.auralis_reports;
create trigger audit_auralis_reports
after insert or update or delete on public.auralis_reports
for each row execute function public.auralis_audit_row();

alter table public.auralis_state enable row level security;
alter table public.auralis_audit_log enable row level security;
alter table public.auralis_members enable row level security;
alter table public.auralis_transactions enable row level security;
alter table public.auralis_projects enable row level security;
alter table public.auralis_announcements enable row level security;
alter table public.auralis_meetings enable row level security;
alter table public.auralis_chat_messages enable row level security;
alter table public.auralis_avatars enable row level security;
alter table public.auralis_reports enable row level security;

drop policy if exists "auralis_state_read" on public.auralis_state;
create policy "auralis_state_read" on public.auralis_state
for select to anon, authenticated using (true);

drop policy if exists "auralis_state_write" on public.auralis_state;
create policy "auralis_state_write" on public.auralis_state
for all to anon, authenticated using (true) with check (true);

drop policy if exists "auralis_audit_log_read" on public.auralis_audit_log;
create policy "auralis_audit_log_read" on public.auralis_audit_log
for select to anon, authenticated using (true);

drop policy if exists "auralis_members_read" on public.auralis_members;
create policy "auralis_members_read" on public.auralis_members
for select to anon, authenticated using (true);

drop policy if exists "auralis_members_write" on public.auralis_members;
create policy "auralis_members_write" on public.auralis_members
for all to anon, authenticated using (true) with check (true);

drop policy if exists "auralis_transactions_read" on public.auralis_transactions;
create policy "auralis_transactions_read" on public.auralis_transactions
for select to anon, authenticated using (true);

drop policy if exists "auralis_transactions_write" on public.auralis_transactions;
create policy "auralis_transactions_write" on public.auralis_transactions
for all to anon, authenticated using (true) with check (true);

drop policy if exists "auralis_projects_read" on public.auralis_projects;
create policy "auralis_projects_read" on public.auralis_projects
for select to anon, authenticated using (true);

drop policy if exists "auralis_projects_write" on public.auralis_projects;
create policy "auralis_projects_write" on public.auralis_projects
for all to anon, authenticated using (true) with check (true);

drop policy if exists "auralis_announcements_read" on public.auralis_announcements;
create policy "auralis_announcements_read" on public.auralis_announcements
for select to anon, authenticated using (true);

drop policy if exists "auralis_announcements_write" on public.auralis_announcements;
create policy "auralis_announcements_write" on public.auralis_announcements
for all to anon, authenticated using (true) with check (true);

drop policy if exists "auralis_meetings_read" on public.auralis_meetings;
create policy "auralis_meetings_read" on public.auralis_meetings
for select to anon, authenticated using (true);

drop policy if exists "auralis_meetings_write" on public.auralis_meetings;
create policy "auralis_meetings_write" on public.auralis_meetings
for all to anon, authenticated using (true) with check (true);

drop policy if exists "auralis_chat_messages_read" on public.auralis_chat_messages;
create policy "auralis_chat_messages_read" on public.auralis_chat_messages
for select to anon, authenticated using (true);

drop policy if exists "auralis_chat_messages_write" on public.auralis_chat_messages;
create policy "auralis_chat_messages_write" on public.auralis_chat_messages
for all to anon, authenticated using (true) with check (true);

drop policy if exists "auralis_avatars_read" on public.auralis_avatars;
create policy "auralis_avatars_read" on public.auralis_avatars
for select to anon, authenticated using (true);

drop policy if exists "auralis_avatars_write" on public.auralis_avatars;
create policy "auralis_avatars_write" on public.auralis_avatars
for all to anon, authenticated using (true) with check (true);

drop policy if exists "auralis_reports_read" on public.auralis_reports;
create policy "auralis_reports_read" on public.auralis_reports
for select to anon, authenticated using (true);

drop policy if exists "auralis_reports_write" on public.auralis_reports;
create policy "auralis_reports_write" on public.auralis_reports
for all to anon, authenticated using (true) with check (true);
