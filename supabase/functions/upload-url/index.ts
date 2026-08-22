// upload-url — hands an artist a short-lived, presigned PUT straight into
// SONGCHAINN's own Cloudflare R2 bucket.
//
// Why R2 and not Supabase Storage: R2 egress is free forever. Every play of
// every track costs us nothing. Supabase bills egress, so the same catalog on
// Supabase Storage would bill us for listening, which is the cost that kills
// music apps. The bytes never pass through this function either; the browser
// PUTs directly to R2.
//
// The artist needs an account. The artist does NOT need a wallet: a wallet is
// only required to coin a track, never to release one.
//
// Request:  POST { title, artistName, fileName, contentType, fileBytes, genre? }
// Response: { songId, uploadUrl, storageKey, publicUrl, expiresIn }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ALLOWED_ORIGINS = new Set<string>(
  (Deno.env.get("ALLOWED_ORIGINS") ??
    "https://songchainn.xyz,https://app.songchainn.xyz,https://www.songchainn.xyz,https://beta.songchainn.xyz,http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map((s) => s.trim()).filter(Boolean),
);

function corsFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(origin), "Content-Type": "application/json" },
  });
}

/* ------------------------------------------------------------ limits --- */

// 100 MB. A WAV master runs about 10.6 MB per minute at 44.1k/16-bit stereo,
// so a 25 MB cap would have turned away almost every real WAV in the catalog
// (the founding masters average around 30 MB). R2 storage is ~$0.015/GB/month,
// so the generous cap costs us almost nothing and keeps lossless the norm.
const MAX_BYTES = 100 * 1024 * 1024;
const MIN_BYTES = 128 * 1024;         // below this it is not a song
const UPLOADS_PER_DAY = 10;
const PRESIGN_TTL = 900;              // 15 minutes to finish the PUT

// WAV and MP3 only, deliberately. The audition can only decode what the
// measurement engine decodes, and accepting a FLAC we cannot judge would leave
// the artist stuck in 'auditioning' forever. Widen this and _audio.mjs together.
const ALLOWED_TYPES: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/vnd.wave": "wav",
};

/* ------------------------------------------------- AWS SigV4 presign --- */

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    "raw",
    key instanceof Uint8Array ? key : new Uint8Array(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", k, enc.encode(msg));
}

async function sha256Hex(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(msg));
  return hex(buf);
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** RFC 3986 encoding. S3 canonical requests do NOT encode the path slashes. */
function uriEncode(value: string, encodeSlash = true): string {
  let out = "";
  for (const ch of value) {
    if (/[A-Za-z0-9\-._~]/.test(ch)) {
      out += ch;
    } else if (ch === "/") {
      out += encodeSlash ? "%2F" : "/";
    } else {
      for (const byte of enc.encode(ch)) {
        out += "%" + byte.toString(16).toUpperCase().padStart(2, "0");
      }
    }
  }
  return out;
}

/**
 * Query-string presigned PUT for an S3-compatible endpoint (R2). Nothing is
 * signed but the host header, and the payload is UNSIGNED-PAYLOAD, so the
 * browser can stream the file without knowing its hash up front.
 */
async function presignPut(opts: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  key: string;
  expiresIn: number;
}): Promise<string> {
  const host = `${opts.accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");   // 20260821T101530Z
  const dateStamp = amzDate.slice(0, 8);

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalUri = `/${opts.bucket}/${uriEncode(opts.key, false)}`;

  const params: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${opts.accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(opts.expiresIn)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const canonicalQuery = params
    .map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`)
    .join("&");

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmac(enc.encode(`AWS4${opts.secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = hex(await hmac(kSigning, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/* ------------------------------------------------------------ helpers --- */

/** Filesystem-safe, ASCII, never empty. The artist's title is kept in the DB. */
function slugify(value: string, fallback: string): string {
  const s = value
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return s || fallback;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/* --------------------------------------------------------------- main --- */

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(origin) });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsFor(origin) });
  }

  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_UPLOAD_BUCKET");
  const publicBase = (Deno.env.get("R2_PUBLIC_BASE_URL") ?? "").replace(/\/+$/, "");

  // Name the ones that are actually missing. "Set these five" is useless when
  // four are already right, and secret NAMES are not secrets.
  const missing = [
    ["R2_ACCOUNT_ID", accountId],
    ["R2_ACCESS_KEY_ID", accessKeyId],
    ["R2_SECRET_ACCESS_KEY", secretAccessKey],
    ["R2_UPLOAD_BUCKET", bucket],
    ["R2_PUBLIC_BASE_URL", publicBase],
  ].filter(([, v]) => !v).map(([k]) => k);

  if (missing.length) {
    return json(origin, {
      error: `Uploads are not configured yet. Missing: ${missing.join(", ")}.`,
      missing,
    }, 503);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Who is asking. verify_jwt is on, but we still need the user id.
  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) return json(origin, { error: "Sign in to upload." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(origin, { error: "Bad request." }, 400);
  }

  const title = str(body.title, 120);
  const artistName = str(body.artistName, 120);
  const fileName = str(body.fileName, 200);
  const contentType = str(body.contentType, 100).toLowerCase();
  const genre = str(body.genre, 60) || null;
  const fileBytes = Number(body.fileBytes);

  if (!title) return json(origin, { error: "Give the track a title." }, 400);
  if (!artistName) return json(origin, { error: "Tell us the artist name." }, 400);

  const ext = ALLOWED_TYPES[contentType];
  if (!ext) {
    return json(origin, {
      error: "Send a WAV or an MP3. Those are the two the audition can listen to properly.",
    }, 415);
  }
  if (!Number.isFinite(fileBytes) || fileBytes < MIN_BYTES || fileBytes > MAX_BYTES) {
    return json(origin, {
      error: `Audio must be between ${Math.round(MIN_BYTES / 1024)} KB and ${MAX_BYTES / (1024 * 1024)} MB.`,
    }, 413);
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Abuse cap. Generous enough that a real artist never meets it.
  const { data: recent, error: countErr } = await db.rpc("artist_upload_count", {
    p_user: user.id,
    p_since: "24 hours",
  });
  if (countErr) {
    console.error("upload-url quota check failed:", countErr);
    return json(origin, { error: "Could not start the upload. Try again." }, 500);
  }
  if ((recent ?? 0) >= UPLOADS_PER_DAY) {
    return json(origin, {
      error: `That is ${UPLOADS_PER_DAY} tracks today. Come back tomorrow, the door stays open.`,
    }, 429);
  }

  // Reserve the row first so the storage key is ours to choose, not the
  // client's. status 'uploading' keeps it invisible everywhere until the
  // audition moves it on.
  const songId = crypto.randomUUID();
  const key = [
    "uploads",
    user.id,
    songId,
    `${slugify(fileName.replace(/\.[^.]+$/, ""), "track")}.${ext}`,
  ].join("/");

  const { error: insertErr } = await db.from("songs").insert({
    id: songId,
    title,
    artist_name: artistName,
    genre,
    owner_id: user.id,
    status: "uploading",
    storage_key: key,
    file_bytes: Math.round(fileBytes),
    audio_url: `${publicBase}/${key}`,
  });
  if (insertErr) {
    console.error("upload-url insert failed:", insertErr);
    return json(origin, { error: "Could not start the upload. Try again." }, 500);
  }

  const uploadUrl = await presignPut({
    accountId, accessKeyId, secretAccessKey, bucket, key, expiresIn: PRESIGN_TTL,
  });

  return json(origin, {
    songId,
    uploadUrl,
    storageKey: key,
    publicUrl: `${publicBase}/${key}`,
    expiresIn: PRESIGN_TTL,
  });
});
