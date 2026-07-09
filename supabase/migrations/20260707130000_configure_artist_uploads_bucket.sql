-- Reconfigure the existing (previously unused, unreferenced) artist-uploads
-- bucket for artist submission audio + cover art uploads: private with
-- size/type restrictions, downloadable only via signed URLs from the
-- submit-artist-application edge function (service role).
update storage.buckets
set public = false,
    file_size_limit = 26214400, -- 25MB
    allowed_mime_types = array[
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4',
      'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/flac',
      'image/jpeg', 'image/png', 'image/webp'
    ]
where id = 'artist-uploads';

create policy "Anyone can upload artist submission files"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'artist-uploads');
