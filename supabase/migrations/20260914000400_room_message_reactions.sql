-- Reactions in the Room are kept (founder, 14 Sep 2026).
--
-- Ernest reacted to a message in the listening Room, left, came back, and the
-- reaction was gone: reactions were only a live broadcast to whoever was in the
-- room at that second, never written anywhere. They now live in a table and are
-- read back with the messages; the broadcast stays for the instant update.

create table if not exists public.room_message_reactions (
  message_id uuid not null references public.room_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists room_message_reactions_message_idx on public.room_message_reactions (message_id);

alter table public.room_message_reactions enable row level security;

drop policy if exists room_reactions_read on public.room_message_reactions;
create policy room_reactions_read on public.room_message_reactions
  for select to authenticated using (true);

drop policy if exists room_reactions_insert_own on public.room_message_reactions;
create policy room_reactions_insert_own on public.room_message_reactions
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists room_reactions_delete_own on public.room_message_reactions;
create policy room_reactions_delete_own on public.room_message_reactions
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, delete on public.room_message_reactions to authenticated;
