import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Until a Resend domain is verified, the sandbox can only deliver to the
// Resend account owner (songchaindao@gmail.com) — send to both individually
// so the admin address starts working the moment a domain is verified.
const NOTIFY_TO = ["music.imanafrikah@gmail.com", "songchaindao@gmail.com"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let source: string | null = null;
    let debug = false;
    try {
      const body = await req.json();
      if (typeof body?.source === "string" && body.source.trim()) {
        source = body.source.trim().slice(0, 40);
      }
      debug = body?.debug === true;
    } catch (_e) { /* empty body is fine */ }
    const emailStatus: Record<string, number | string> = {};

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { error: insertErr } = await admin
      .from("zabal_gamez_beat_downloads")
      .insert({ source });
    if (insertErr) {
      console.error("Failed to record beat download:", insertErr);
      return new Response(
        JSON.stringify({ error: "Could not record download" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const [{ count: downloads }, { count: entries }] = await Promise.all([
      admin.from("zabal_gamez_beat_downloads").select("id", { count: "exact", head: true }),
      admin.from("zabal_gamez_entries").select("id", { count: "exact", head: true }),
    ]);

    // Notify the admin (best effort — the download is already recorded).
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY) {
      try {
        let fromAddress = "$ongChainn Zabal Gamez <onboarding@resend.dev>";
        try {
          const domainsRes = await fetch("https://api.resend.com/domains", {
            headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
          });
          if (domainsRes.ok) {
            const domainsBody = await domainsRes.json();
            const list = Array.isArray(domainsBody?.data) ? domainsBody.data : [];
            const verified = list.find((d: { status?: string; name?: string }) =>
              d?.status === "verified" && typeof d?.name === "string"
            );
            if (verified) {
              fromAddress = `$ongChainn Zabal Gamez <submissions@${verified.name}>`;
            }
          }
        } catch (_e) { /* fall back to sandbox sender */ }

        for (const recipient of NOTIFY_TO) {
          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromAddress,
              to: [recipient],
              subject: `Zabal Gamez: cypher beat downloaded (#${downloads ?? "?"})`,
              text: `Someone downloaded the Zabal Gamez cypher beat${source ? ` from the ${source} page` : ""}.\n\nTotals so far:\n- Beat downloads: ${downloads ?? "unknown"}\n- Entries: ${entries ?? "unknown"}`,
            }),
          });
          const emailBody = await emailRes.text();
          emailStatus[recipient] = emailRes.ok ? emailRes.status : `${emailRes.status}: ${emailBody.slice(0, 200)}`;
          if (!emailRes.ok) {
            console.error(`Resend rejected download email to ${recipient}:`, emailRes.status, emailBody);
          } else {
            console.log(`Download email accepted for ${recipient}:`, emailRes.status, emailBody);
          }
        }
      } catch (mailErr) {
        console.error("Beat download notify email failed:", mailErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        downloads: downloads ?? null,
        entries: entries ?? null,
        ...(debug ? { emailStatus } : {}),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("track-zabal-download error:", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
