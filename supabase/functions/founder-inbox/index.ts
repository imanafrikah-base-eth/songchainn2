// founder-inbox: everything a person sends the founders lands in one inbox.
//
// Suggestions, bug reports and "pass it on" requests from the world builder
// used to scatter: a table insert that failed on a column name and fell back
// to a mailto for an address nobody reads, and a table nobody watched. Now
// every one of them is written to its table AND mailed to songchaindao@gmail.com,
// the main inbox, from here. Guests can write too: their note is mailed, and
// stored only in the tables that allow a note without an account.
//
// Request:  POST { kind: 'suggestion' | 'bug' | 'feature', text, subject?, page?,
//                  screen_size?, world_id?, world_slug?, build_step? }
//           with the caller's JWT when signed in.
// Response: { success: true, stored: boolean, emailed: boolean, dmed: boolean }
//
// Every note also reaches IMan Afrikah's DMs from Mo$ha: stored notes through
// the table triggers, unstored ones through rpc mosha_dm_founder below.

import { createClient } from "npm:@supabase/supabase-js@2";

const NOTIFY_TO = "songchaindao@gmail.com";

type Kind = "suggestion" | "bug" | "feature";
const LABEL: Record<Kind, string> = {
  suggestion: "Suggestion",
  bug: "Bug report",
  feature: "World builder request",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const kind = String(body?.kind ?? "") as Kind;
    if (!(kind in LABEL)) return json({ error: "What kind of note is this?" }, 400);
    const text = String(body?.text ?? "").trim().slice(0, 6000);
    if (!text) return json({ error: "Say what it is first." }, 400);
    const subject = String(body?.subject ?? "").trim().slice(0, 200);
    const page = String(body?.page ?? "").trim().slice(0, 200);

    const db = admin();
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    let uid: string | null = null;
    let email: string | null = null;
    if (token) {
      const { data } = await db.auth.getUser(token);
      uid = data?.user?.id ?? null;
      email = data?.user?.email ?? null;
    }

    /* ------------------------------------------------- the table --- */
    let stored: string | null = null;
    let storeError: string | null = null;
    try {
      if (kind === "suggestion" && uid) {
        const { data, error } = await db
          .from("suggestion_forms")
          .insert({ user_id: uid, subject: subject || "Suggestion", improvement_text: text, source: "songchainn-app" })
          .select("id")
          .single();
        if (error) throw error;
        stored = data?.id ?? null;
      } else if (kind === "bug") {
        const { data, error } = await db
          .from("bug_reports")
          .insert({
            user_id: uid,
            area: subject || "General",
            detail: text,
            page: page || null,
            screen_size: String(body?.screen_size ?? "").slice(0, 40) || null,
            user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300) || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        stored = data?.id ?? null;
      } else if (kind === "feature" && uid) {
        const { data, error } = await db
          .from("world_feature_requests")
          .insert({
            user_id: uid,
            world_id: typeof body?.world_id === "string" ? body.world_id : null,
            world_slug: typeof body?.world_slug === "string" ? body.world_slug.slice(0, 120) : null,
            build_step: typeof body?.build_step === "string" ? body.build_step.slice(0, 60) : null,
            request: text,
            asked_as: text.slice(0, 400),
          })
          .select("id")
          .single();
        if (error) throw error;
        stored = data?.id ?? null;
      }
    } catch (err) {
      storeError = err instanceof Error ? err.message : String(err);
      console.error("founder-inbox: could not store the note", err);
    }

    /* ------------------------------------------- IMan's DM, from Mo$ha --- */
    // A stored note already reaches IMan Afrikah's DMs through the AFTER INSERT
    // trigger on its table (migration 20260913000300), so only a note that no
    // table kept (a guest's suggestion or world request, or a failed insert) is
    // sent from here. That way nothing lands in the DM twice.
    let dmed = !!stored;
    if (!stored) {
      try {
        let name = "a guest";
        if (uid) {
          const { data: prof } = await db
            .from("audience_profiles")
            .select("display_name, profile_name, username")
            .eq("user_id", uid)
            .maybeSingle();
          name = prof?.display_name?.trim() || prof?.profile_name?.trim() || prof?.username?.trim() || email || "someone without a name yet";
        }
        const heading =
          kind === "bug"
            ? /mo\$ha/i.test(subject) ? `Report from ${name} via Mo$ha` : `Bug report from ${name}`
            : kind === "suggestion"
              ? `Feature suggestion from ${name}`
              : `World builder request from ${name} via Mo$ha`;
        const lines = [
          heading,
          subject && !/^(suggestion|feature suggestion|sent through mo\$ha)$/i.test(subject) ? `Title: ${subject}` : "",
          "",
          text.slice(0, 1500),
          "",
          page ? `Page: ${page}` : "",
          body?.screen_size ? `Screen: ${String(body.screen_size).slice(0, 40)}` : "",
          kind === "bug" ? `Device: ${(req.headers.get("user-agent") ?? "unknown").slice(0, 160)}` : "",
          body?.world_slug ? `World: /world/${String(body.world_slug).slice(0, 120)}` : "",
          body?.build_step ? `Step: ${String(body.build_step).slice(0, 60)}` : "",
          storeError ? "(It could not be saved to its table, so this message is the only copy in the app.)" : "",
        ].filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== ""));
        const { error: dmErr } = await db.rpc("mosha_dm_founder", {
          p_body: lines.join("\n").trim(),
          p_meta: { report_kind: kind, guest: !uid },
        });
        if (dmErr) throw dmErr;
        dmed = true;
      } catch (err) {
        console.error("founder-inbox: could not DM the founder", err);
      }
    }

    /* ------------------------------------------------- the inbox --- */
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("founder-inbox: RESEND_API_KEY not configured; note saved without the email");
      return json({ success: true, stored: !!stored, emailed: false, dmed, storeError });
    }

    // Send from a verified Resend domain when one exists; the sandbox sender
    // is heavily spam-filtered by Gmail.
    let fromAddress = "$ongChainn <onboarding@resend.dev>";
    try {
      const domainsRes = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
      });
      if (domainsRes.ok) {
        const domainsBody = await domainsRes.json();
        const list = Array.isArray(domainsBody?.data) ? domainsBody.data : [];
        const verified = list.find((d: { status?: string; name?: string }) => d?.status === "verified" && typeof d?.name === "string");
        if (verified) fromAddress = `$ongChainn <inbox@${verified.name}>`;
      }
    } catch {
      /* fall back to the sandbox sender */
    }

    const who = email ?? (uid ? `account ${uid}` : "a guest");
    const label = LABEL[kind];
    const subjectLine = `[${label}] ${subject || text.slice(0, 60)}`;
    const extra: string[] = [];
    if (kind === "feature") {
      if (body?.world_slug) extra.push(`World: ${String(body.world_slug)}`);
      if (body?.build_step) extra.push(`Step: ${String(body.build_step)}`);
    }
    if (kind === "bug" && body?.screen_size) extra.push(`Screen: ${String(body.screen_size)}`);
    const plain = [
      `${label} from ${who}`,
      `Page: ${page || "unknown"}`,
      ...extra,
      "",
      subject ? `${subject}\n` : "",
      text,
      "",
      stored ? `Saved in the app as ${stored}.` : `Not saved to a table${uid ? "" : " (guest)"}${storeError ? `: ${storeError}` : ""}.`,
    ].join("\n");

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddress,
        to: [NOTIFY_TO],
        reply_to: email ?? undefined,
        subject: subjectLine,
        text: plain,
        html: `
          <h2>${esc(label)}</h2>
          <p><strong>From:</strong> ${esc(who)}</p>
          <p><strong>Page:</strong> ${esc(page || "unknown")}</p>
          ${extra.map((e) => `<p>${esc(e)}</p>`).join("")}
          ${subject ? `<p><strong>${esc(subject)}</strong></p>` : ""}
          <p style="white-space:pre-wrap">${esc(text)}</p>
          <p style="color:#888;font-size:12px;">${stored ? `Saved in the app as ${esc(stored)}.` : "Not saved to a table."}</p>
        `,
      }),
    });
    const emailed = emailRes.ok;
    if (!emailed) console.error("founder-inbox: resend", emailRes.status, await emailRes.text().catch(() => ""));
    if (emailed && kind === "suggestion" && stored) {
      await db.from("suggestion_forms").update({ email_sent: true }).eq("id", stored);
    }

    return json({ success: true, stored: !!stored, emailed, dmed, storeError });
  } catch (err) {
    console.error("founder-inbox error:", err);
    return json({ error: "That did not go through. Try again in a moment." }, 500);
  }
});
