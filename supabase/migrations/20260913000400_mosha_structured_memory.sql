-- Mo$ha's structured memory per person.
--
-- Until now mosha_memory held one free-text paragraph (notes). That was good
-- for tone and bad for anything that has to be acted on: a problem somebody
-- hit, whether it was fixed and how, and things they explicitly asked Mo$ha to
-- keep in mind all melted into prose and fell out on the next rewrite.
--
-- These columns hold those things as short lists, merged deterministically by
-- the mosha-chat edge function (dedupe, caps, open -> solved, recurrence
-- counts) after the model proposes changes. `notes` stays for tone and for
-- backward compatibility with the function version already deployed.
--
--   preferences      text[] as jsonb  how they like to be spoken to, language, what they like   (cap 12)
--   remember         text[] as jsonb  things they asked Mo$ha to keep in mind                    (cap 20)
--   open_problems    jsonb array      {id, text, first_seen, last_seen, count, returned_after_fix?} (cap 10)
--   solved_problems  jsonb array      {id, text, how_solved, solved_at}                           (cap 20)
--   facts            text[] as jsonb  short stable facts: makes music or listens, city, goals    (cap 12)
--
-- RLS is unchanged: the person may read and delete their own row
-- (mosha_memory_own_read, mosha_memory_own_delete); only the service role
-- (the edge function) writes. The row still goes with the account on deletion.

alter table public.mosha_memory
  add column if not exists preferences     jsonb not null default '[]'::jsonb,
  add column if not exists remember        jsonb not null default '[]'::jsonb,
  add column if not exists open_problems   jsonb not null default '[]'::jsonb,
  add column if not exists solved_problems jsonb not null default '[]'::jsonb,
  add column if not exists facts           jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mosha_memory_lists_are_arrays') then
    alter table public.mosha_memory
      add constraint mosha_memory_lists_are_arrays check (
        jsonb_typeof(preferences) = 'array'
        and jsonb_typeof(remember) = 'array'
        and jsonb_typeof(open_problems) = 'array'
        and jsonb_typeof(solved_problems) = 'array'
        and jsonb_typeof(facts) = 'array'
      );
  end if;
end $$;

comment on column public.mosha_memory.preferences is 'How the person likes Mo$ha to speak to them, language, what they like. Short strings, cap 12. Written by mosha-chat only.';
comment on column public.mosha_memory.remember is 'Things the person explicitly asked Mo$ha to keep in mind. Short strings, cap 20.';
comment on column public.mosha_memory.open_problems is 'Problems the person hit that are not known to be fixed: {id, text, first_seen, last_seen, count, returned_after_fix?}. Cap 10.';
comment on column public.mosha_memory.solved_problems is 'Problems that were solved, and how: {id, text, how_solved, solved_at}. Cap 20.';
comment on column public.mosha_memory.facts is 'Short stable facts: makes music or listens, city, goals. Cap 12.';
