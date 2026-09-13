-- Files sent to Mo$ha (founder, 13 Sep 2026).
--
-- Anyone can hand Mo$ha files from either chat: songs and artwork for a
-- release, screenshots of something broken. This adds what that needs.
--
-- 1. mosha_messages.attachments, a jsonb array of MoshaAttachment
--    (src/lib/moshaAttachments.ts). mosha-chat stores the list on the newest
--    user row. At most 15 per line. A person may only ever write attachments
--    on their own 'user' rows (the insert policy already pins user_id and
--    role), and any private file they name must sit under their own folder,
--    so nobody can point Mo$ha at somebody else's screenshot.
-- 2. A PRIVATE storage bucket, mosha-attachments, for pictures and any other
--    file (screenshots can hold private details). A person reads and writes
--    only <their user id>/...; the service role reads everything, so Mo$ha and
--    the founder inbox can sign a link. 25 MB a file, any type.
-- 3. upload_failures accepts kind 'mosha', so a clip for Mo$ha that fails on
--    the R2 road is written down like every other upload.
--
-- Audio does NOT come here: it takes the R2 road through upload-url purpose
-- 'mosha', which reserves no songs row.

alter table public.mosha_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.mosha_messages drop constraint if exists mosha_messages_attachments_check;
alter table public.mosha_messages
  add constraint mosha_messages_attachments_check
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 15);

drop policy if exists mosha_messages_own_insert on public.mosha_messages;
create policy mosha_messages_own_insert on public.mosha_messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and role = 'user'
    and source = any (array['chat', 'inbox'])
    and read_at is null
    and legacy_dm_id is null
    and not exists (
      select 1
      from jsonb_array_elements(attachments) a
      where a->>'storage' = 'private'
        and coalesce(a->>'path', '') not like ((select auth.uid())::text || '/%')
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mosha-attachments', 'mosha-attachments', false, 26214400, null)
on conflict (id) do update set public = false, file_size_limit = 26214400, allowed_mime_types = null;

drop policy if exists mosha_attachments_own_read on storage.objects;
create policy mosha_attachments_own_read on storage.objects
  for select to authenticated
  using (bucket_id = 'mosha-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists mosha_attachments_own_insert on storage.objects;
create policy mosha_attachments_own_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'mosha-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists mosha_attachments_own_update on storage.objects;
create policy mosha_attachments_own_update on storage.objects
  for update to authenticated
  using (bucket_id = 'mosha-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'mosha-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists mosha_attachments_own_delete on storage.objects;
create policy mosha_attachments_own_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'mosha-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter table public.upload_failures drop constraint if exists upload_failures_kind_check;
alter table public.upload_failures
  add constraint upload_failures_kind_check check (kind = any (array['visual', 'song', 'episode', 'mosha']));
