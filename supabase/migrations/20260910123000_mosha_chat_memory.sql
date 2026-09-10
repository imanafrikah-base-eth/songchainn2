-- Mo$ha remembers. Every exchange with a signed-in person is kept: the last
-- 48 hours stay in view when the chat opens again, everything older is the
-- archive the person can pull up at will. Mo$ha also keeps a short private
-- note per person (how they like to be spoken to, what they are doing here)
-- that it rewrites every few exchanges, so it gets more personal each time.
-- Both go with the account when the account is deleted.

create table if not exists public.mosha_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 4000),
  action jsonb,
  created_at timestamptz not null default now()
);
create index if not exists mosha_messages_user_time_idx on public.mosha_messages (user_id, created_at desc);

alter table public.mosha_messages enable row level security;
drop policy if exists mosha_messages_own_read on public.mosha_messages;
create policy mosha_messages_own_read on public.mosha_messages for select to authenticated using (user_id = auth.uid());
drop policy if exists mosha_messages_own_insert on public.mosha_messages;
create policy mosha_messages_own_insert on public.mosha_messages for insert to authenticated with check (user_id = auth.uid());
drop policy if exists mosha_messages_own_delete on public.mosha_messages;
create policy mosha_messages_own_delete on public.mosha_messages for delete to authenticated using (user_id = auth.uid());
grant select, insert, delete on public.mosha_messages to authenticated;

create table if not exists public.mosha_memory (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notes text not null default '' check (char_length(notes) <= 2000),
  turns_since int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.mosha_memory enable row level security;
drop policy if exists mosha_memory_own_read on public.mosha_memory;
create policy mosha_memory_own_read on public.mosha_memory for select to authenticated using (user_id = auth.uid());
drop policy if exists mosha_memory_own_delete on public.mosha_memory;
create policy mosha_memory_own_delete on public.mosha_memory for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.mosha_memory to authenticated;
