-- Builder worlds open by loyalty points until their artist picks a key (13 Sep 2026).
--
-- Applied live on 13 Sep 2026 as a data change; kept here as the record.
--
-- Every world made in the World Builder was created with world_gates.kind =
-- 'songchainn', the shared $ONGCHAINN key. world-gate only answers 'token' and
-- 'points', so none of those worlds could ever open an inner door. GESD1's
-- world had been set to points, but its gate row was back on 'songchainn'
-- (the builder saved its default over it). Ernest: give every such world a
-- points key like GESD1's until the artist changes their settings.
--
-- Only rows still on 'songchainn' change; a world whose artist set a coin or a
-- pass is untouched. Thresholds stay at 1,000 points (fans) and 10,000 points
-- (insiders). src/worlds/builder/useWorldBuilder.ts DEFAULT_GATE now starts new
-- worlds on 'points' too.
--
-- Result on 13 Sep 2026: highstarians, n3m (published) and imanzzy,
-- mbwif-the-jungle, ologo5g, theeyesofsora, velvet-static-rebellion (drafts).

update public.world_gates
set kind = 'points'
where kind = 'songchainn';

update public.worlds w
set token_symbol = 'points'
from public.world_gates g
where g.world_id = w.id
  and g.kind = 'points'
  and coalesce(trim(w.token_symbol), '') = '';
