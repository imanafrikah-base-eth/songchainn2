# Artist uploads: what is built, and what has to be switched on

The pipe is: **sign up, upload, audition, live, coin.** An account is all it
takes to release. A wallet is only ever needed to coin a track.

Everything below is built and deployed. Uploads stay switched off until the R2
secrets in step 1 exist, and `upload-url` says so plainly instead of failing.

---

## The pipeline

```
artist signs up                     no wallet required
      |
  POST upload-url                   edge fn, reserves the songs row + presigns R2
      |
  browser PUTs the file  ---------> Cloudflare R2 (bytes never touch our servers)
      |
  POST /api/audition                Vercel Node fn, 300 s budget
      |
      +-- measure       scripts/audio-standard/core.mjs (BS.1770-4, 26/26 checks)
      +-- judge         api/_standard.mjs, the gate
      +-- speak         hikulu-judge action "audition", $HIKULU + NAKULU
      |
  pass  -> status 'published' -> New Releases, same minute, nobody approves it
  fail  -> status 'workshop'  -> private to that artist, unlimited re-uploads
```

## 1. Cloudflare R2 (required, uploads are off without it)

Create an R2 API token with **Object Read & Write** on the upload bucket, then
set these as Supabase edge function secrets:

```bash
supabase secrets set \
  R2_ACCOUNT_ID=<cloudflare account id> \
  R2_ACCESS_KEY_ID=<r2 token access key id> \
  R2_SECRET_ACCESS_KEY=<r2 token secret> \
  R2_UPLOAD_BUCKET=songchainn-uploads \
  R2_PUBLIC_BASE_URL=https://pub-<bucket public id>.r2.dev
```

Use a **dedicated bucket** for uploads rather than one of the catalog buckets,
and scope the API token to that bucket only. If the token ever leaks, the blast
radius is artist uploads, not the founding catalog.

**Bucket CORS.** The browser PUTs straight to R2, so the bucket must allow it.
In the Cloudflare dashboard, R2 > your bucket > Settings > CORS policy:

```json
[
  {
    "AllowedOrigins": [
      "https://songchainn.xyz",
      "https://www.songchainn.xyz",
      "https://beta.songchainn.xyz",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

**Public URL.** `R2_PUBLIC_BASE_URL` is the bucket's public URL.

An R2 custom domain (`cdn.songchainn.xyz`) needs the DNS zone to live on
Cloudflare. `songchainn.xyz` currently uses Namecheap nameservers
(`dns1/dns2.registrar-servers.com`), so the custom domain is not available yet
and the bucket's own `https://pub-<id>.r2.dev` URL is what goes in the secret.

That is the same thing the whole existing catalog already uses, so it is not a
new risk. It is worth fixing eventually: `r2.dev` is rate limited and it buckled
under the 230-track measurement sweep. The fix is to move the `songchainn.xyz`
zone to Cloudflare and then attach `cdn.songchainn.xyz` to the bucket, which is
its own job and touches the live site's DNS records. Do it deliberately, not as
part of switching uploads on.

## 2. Vercel environment

`/api/audition` needs to reach Supabase with the service role:

```
SUPABASE_SERVICE_ROLE_KEY=<service role key>
VITE_SUPABASE_URL=https://wsjhbfmzbonxmxaaassu.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

## 3. Already done, nothing to do

- Migration `20260821000000_artist_uploads_and_audition.sql` applied to prod.
- `upload-url` deployed (v1), `hikulu-judge` deployed (v8, with `audition`).
- `/studio` route live in the app.
- All 230 existing catalog tracks untouched, still `published`.

---

## The gate

Thresholds live in `api/_standard.mjs`. They were not invented: they come from
measuring all 230 catalog tracks and isolating the 56 that are genuinely
lossless masters. That subset is the standard.

| | measured range of the 56 masters |
|---|---|
| integrated loudness | -17.9 to -13.5 LUFS (median -14.6) |
| true peak | -5.00 to -2.40 dBTP (median -3.71) |
| crest factor | 11.5 to 15.4 dB |
| loudness range | 3.1 to 8.0 LU |
| stereo correlation | 0.774 to 0.959 |
| spectral cutoff | 20,238 to 22,043 Hz |

**The gate ships looser than the standard on purpose.** Held to the full range,
it would reject most of the founding catalog (129 of 230 fail on true peak
alone), which would be dishonest while the old catalog rides. So the launch bar
is "nothing measurably broken":

- reject true peak above 0 dBTP
- reject a lossy-encoded source (brick wall below 19 kHz)
- reject crest factor under 8 dB
- reject loudness range under 2 LU
- reject out-of-phase stereo (correlation below 0)
- reject DC offset at or above 0.003
- reject anything under 45 seconds
- **loudness is advisory only, never a reject**

Applied to the founding catalog this passes 96 of 230. To tighten later, edit
`GATE` in `api/_standard.mjs`. Nothing else needs to change.

## Limits

- WAV and MP3 only. The audition can only decode what the engine decodes, and
  accepting a FLAC we cannot judge would strand the artist mid-pipeline. To
  widen, change `ALLOWED_TYPES` in `upload-url` and `measure()` in
  `api/_audio.mjs` together.
- 100 MB per file. A WAV master runs about 10.6 MB a minute, so this fits a
  nine minute lossless record.
- 10 uploads per artist per 24 hours.
- Presigned URLs live 15 minutes.

## Verified

- `node scripts/audio-standard/validate.mjs` passes 26/26, including EBU Tech
  3341 conformance at -22.99 LUFS against the required -23.0 +/-0.1.
- `api/_audio.mjs` reproduces the stored catalog measurements exactly on both a
  28.6 MB WAV and an MP3, in about 3.5 seconds each.
- The `audition` action was called against the deployed function and returned
  in-character notes from both judges.
- A non-admin artist cannot set their own `status`, cannot forge an `audition`,
  and cannot reassign `owner_id`. They can still edit their own metadata.

## Still open

**Coining a published track.** `song_coins` already holds 231 minted Zora coins
with a `payout_recipient` each, and `scripts/zora-mint/` has the working
tooling. Wiring "coin this track" for artists needs one decision that is not
mine to make: the minter is a single platform signer that pays gas, so its
private key would have to live in a server environment. Base gas is pennies,
but a hot wallet on a server is a real call. Options are (a) platform signer in
a server secret, minting on the artist's behalf with `payoutRecipientOverride`
set to their wallet, or (b) the artist signs the mint themselves from their own
wallet in the browser and pays their own gas.
