// upload-relay: the second road into storage.
//
// Files normally go straight from the browser to the R2 bucket on a presigned
// PUT handed out by upload-url, and never touch our servers. That is the fast
// road and it stays the first one. On 10 Sep 2026 it simply stopped working
// for one artist on her connection: the row was reserved, the signed link was
// handed over, and the file never arrived, over and over, with nothing on our
// side to show why.
//
// When the direct PUT fails, the browser sends the same file here instead,
// over the same connection it already uses to talk to Supabase, and this
// function puts it into the bucket. It only ever writes to a storage key that
// upload-url already reserved for the caller's own row, so it cannot be used
// to put anything anywhere else.
//
// Request:  POST ?kind=visual|song|episode&id=<artist_media.id | songs.id | world_episodes.id>
//           body: the raw file bytes, Content-Type the file's type,
//           Authorization: the artist's JWT.
// Response: { ok: true } | { error, status? }

import { createClient } from "npm:@supabase/supabase-js@2";

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

// The whole file is held in memory while it is passed on, so the relay only
// carries what an edge function can comfortably hold. Pictures are shrunk on
// the phone before they are sent, so nearly every picture fits; long videos
// still need the direct road. Keep in step with RELAY_MAX_BYTES in
// src/lib/storageUpload.ts.
const RELAY_MAX_BYTES = 25 * 1024 * 1024;

const AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ------------------------------------------------- AWS SigV4 presign --- */
// The same signing upload-url uses. Kept as a copy rather than a shared file
// because each function is deployed on its own.

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

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(msg: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(msg)));
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
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
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
  const canonicalQuery = params.map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`).join("&");

  const canonicalRequest = ["PUT", canonicalUri, canonicalQuery, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256Hex(canonicalRequest)].join("\n");

  const kDate = await hmac(enc.encode(`AWS4${opts.secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = hex(await hmac(kSigning, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/* --------------------------------------------------------------- main --- */

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(origin) });
  if (req.method !== "POST") return json(origin, { error: "Method not allowed" }, 405);

  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_UPLOAD_BUCKET");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return json(origin, { error: "Uploads are not configured yet." }, 503);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await asUser.auth.getUser();
  const user = userData?.user;
  if (!user) return json(origin, { error: "Sign in to upload." }, 401);

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const id = url.searchParams.get("id") ?? "";
  if ((kind !== "visual" && kind !== "song" && kind !== "episode") || !UUID.test(id)) {
    return json(origin, { error: "Bad request." }, 400);
  }

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > RELAY_MAX_BYTES) {
    return json(origin, { error: `Too big for this road. Files over ${RELAY_MAX_BYTES / (1024 * 1024)} MB only go the direct way.` }, 413);
  }

  const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // The key is read from the caller's own reserved row, never taken from the
  // request, so this can only ever finish an upload upload-url started for them.
  let key: string;
  let expected: number | null;
  let contentType: string;
  if (kind === "visual") {
    const { data: row } = await db
      .from("artist_media")
      .select("storage_key, bytes, mime_type")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!row?.storage_key) return json(origin, { error: "That upload was not started, or is not yours." }, 404);
    key = row.storage_key as string;
    expected = typeof row.bytes === "number" ? row.bytes : null;
    contentType = (row.mime_type as string | null) ?? "application/octet-stream";
  } else if (kind === "episode") {
    const { data: row } = await db
      .from("world_episodes")
      .select("storage_key, bytes, mime_type")
      .eq("id", id)
      .eq("host_id", user.id)
      .maybeSingle();
    if (!row?.storage_key) return json(origin, { error: "That upload was not started, or is not yours." }, 404);
    key = row.storage_key as string;
    expected = typeof row.bytes === "number" ? row.bytes : null;
    contentType = (row.mime_type as string | null) ?? "audio/webm";
  } else {
    const { data: row } = await db
      .from("songs")
      .select("storage_key, file_bytes, status")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!row?.storage_key) return json(origin, { error: "That upload was not started, or is not yours." }, 404);
    if (row.status !== "uploading") return json(origin, { error: "That record already has its file." }, 409);
    key = row.storage_key as string;
    expected = typeof row.file_bytes === "number" ? row.file_bytes : null;
    contentType = (req.headers.get("content-type") ?? "").toLowerCase();
    if (!AUDIO_TYPES.has(contentType)) return json(origin, { error: "Send a WAV or an MP3." }, 415);
  }

  let body: Uint8Array;
  try {
    body = new Uint8Array(await req.arrayBuffer());
  } catch (err) {
    console.error("upload-relay: could not read the body", err);
    return json(origin, { error: "The file did not arrive in one piece. Try again." }, 400);
  }
  if (body.byteLength === 0 || body.byteLength > RELAY_MAX_BYTES) {
    return json(origin, { error: "The file did not arrive in one piece. Try again." }, 400);
  }
  if (expected !== null && body.byteLength !== expected) {
    return json(origin, { error: "That is not the file this upload was started for." }, 400);
  }

  const signed = await presignPut({ accountId, accessKeyId, secretAccessKey, bucket, key, expiresIn: 300 });
  const put = await fetch(signed, { method: "PUT", body, headers: { "Content-Type": contentType } });
  if (!put.ok) {
    const detail = (await put.text().catch(() => "")).slice(0, 300);
    console.error("upload-relay: storage refused the file", put.status, detail);
    return json(origin, { error: "Storage refused the file. Try again in a minute.", status: put.status }, 502);
  }

  return json(origin, { ok: true });
});
