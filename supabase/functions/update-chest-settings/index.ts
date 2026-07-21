// Edge Function : met a jour les reglages de chevauchement audio de
// chest_settings, ajustables depuis le panneau "Reglages audio" de
// chest-control.html. Meme verification que open-chest/create-test-event :
// seul le token du broadcaster peut ecrire.
//
// Deploiement : supabase functions deploy update-chest-settings
// Secrets requis : CHEST_TWITCH_CLIENT_ID, BROADCASTER_TWITCH_USER_ID,
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TWITCH_CLIENT_ID = Deno.env.get('CHEST_TWITCH_CLIENT_ID')!;
const BROADCASTER_TWITCH_USER_ID = Deno.env.get('BROADCASTER_TWITCH_USER_ID')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

const FIELDS = ['waiting_loop_overlap_ms', 'opening_ongoing_overlap_ms', 'ongoing_ending_overlap_ms'] as const;

function toValidMs(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 5000 ? n : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const body = await req.json().catch(() => null);
  const accessToken = body?.access_token;
  if (typeof accessToken !== 'string' || !accessToken) return json({ error: 'access_token manquant' }, 400);

  const twitchRes = await fetch('https://api.twitch.tv/helix/users', {
    headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': TWITCH_CLIENT_ID },
  });
  if (!twitchRes.ok) return json({ error: 'token Twitch invalide' }, 401);
  const twitchUser = (await twitchRes.json())?.data?.[0];
  if (!twitchUser || twitchUser.id !== BROADCASTER_TWITCH_USER_ID) {
    return json({ error: 'seul le broadcaster peut modifier les reglages' }, 403);
  }

  const update: Record<string, number> = {};
  for (const field of FIELDS) {
    const ms = toValidMs(body?.[field]);
    if (ms === null) return json({ error: `${field} invalide (0-5000 attendu)` }, 400);
    update[field] = ms;
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await sb
    .from('chest_settings')
    .upsert({ id: 1, ...update, updated_at: new Date().toISOString() })
    .select()
    .single();

  if (error) return json({ error: 'sauvegarde impossible : ' + error.message }, 500);
  return json({ ok: true, settings: data });
});
