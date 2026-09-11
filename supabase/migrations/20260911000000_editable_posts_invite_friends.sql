-- Editable posts and comments, and the list of who came in on your invite.
-- Applied live on 11 Sep 2026; kept here so the repo history matches the DB.

-- ---------------------------------------------------------------------------
-- Who actually joined on your invite.
--
-- The invite panel could only ever show a count, which is the least
-- interesting part of inviting somebody. This returns the people, so the panel
-- can show faces and names and the day each of them arrived.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_referral_friends(_limit int default 25)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  joined_at timestamptz,
  points_awarded int
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.referred_user_id as user_id,
    coalesce(nullif(ap.display_name, ''), 'A new listener') as display_name,
    ap.profile_picture_url as avatar_url,
    r.created_at as joined_at,
    coalesce(r.referrer_points, 0) as points_awarded
  from public.referrals r
  left join public.audience_profiles ap on ap.user_id = r.referred_user_id
  where r.referrer_id = auth.uid()
  order by r.created_at desc
  limit greatest(1, least(coalesce(_limit, 25), 100));
$$;

-- ---------------------------------------------------------------------------
-- Fixing what you wrote, without deleting it.
--
-- A typo in a caption meant deleting the post and losing its likes and its
-- comments. Posts could already be updated by their author; comments could not
-- be touched at all. Both can now be edited, both carry the mark, and a reader
-- can see that the words changed after the fact.
-- ---------------------------------------------------------------------------
alter table public.social_posts add column if not exists edited_at timestamptz;
alter table public.post_comments add column if not exists edited_at timestamptz;

-- Only the words move. Media, ownership, the world it was posted in and the
-- tags all stay exactly as they were, so an edit can never turn a song card
-- into something else or move a post between worlds.
create or replace function public.edit_my_post(_post_id uuid, _content text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  if _content is null or length(btrim(_content)) = 0 then
    raise exception 'a post needs something in it';
  end if;
  if length(_content) > 5000 then
    raise exception 'that is too long';
  end if;
  if public.has_restriction(auth.uid(), 'mute') then
    raise exception 'you cannot post right now';
  end if;

  update public.social_posts
     set content = _content,
         edited_at = v_now,
         updated_at = v_now
   where id = _post_id
     and user_id = auth.uid()
     and coalesce(is_deleted, false) = false;

  if not found then
    raise exception 'that post is not yours';
  end if;
  return v_now;
end;
$$;

create or replace function public.edit_my_comment(_comment_id uuid, _content text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  if _content is null or length(btrim(_content)) = 0 then
    raise exception 'a comment needs something in it';
  end if;
  if length(_content) > 2000 then
    raise exception 'that is too long';
  end if;
  if public.has_restriction(auth.uid(), 'mute') then
    raise exception 'you cannot post right now';
  end if;

  update public.post_comments
     set content = _content,
         edited_at = v_now
   where id = _comment_id
     and user_id = auth.uid();

  if not found then
    raise exception 'that comment is not yours';
  end if;
  return v_now;
end;
$$;

-- All three refuse a caller with no auth.uid(), but a signed out visitor has no
-- business calling any of them, so the door is shut rather than merely locked
-- on the inside.
revoke all on function public.get_my_referral_friends(int) from public;
revoke all on function public.edit_my_post(uuid, text) from public;
revoke all on function public.edit_my_comment(uuid, text) from public;
revoke execute on function public.get_my_referral_friends(int) from anon;
revoke execute on function public.edit_my_post(uuid, text) from anon;
revoke execute on function public.edit_my_comment(uuid, text) from anon;
grant execute on function public.get_my_referral_friends(int) to authenticated;
grant execute on function public.edit_my_post(uuid, text) to authenticated;
grant execute on function public.edit_my_comment(uuid, text) to authenticated;
