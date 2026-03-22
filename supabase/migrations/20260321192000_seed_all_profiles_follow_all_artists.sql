INSERT INTO public.liked_artists (user_id, artist_id)
SELECT p.id AS user_id, a.artist_id
FROM public.audience_profiles p
CROSS JOIN (
  VALUES
    ('1'),
    ('2'),
    ('3'),
    ('4'),
    ('5'),
    ('6'),
    ('7'),
    ('8'),
    ('9'),
    ('10')
) AS a(artist_id)
ON CONFLICT (user_id, artist_id) DO NOTHING;
