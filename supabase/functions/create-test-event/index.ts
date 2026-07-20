// Edge Function : cree un faux evenement 'pending' dans chest_events, pour
// tester le flux complet (coffre en attente sur l'overlay + file sur
// chest-control.html + declenchement) sans attendre un vrai follow/sub ni
// passer par le SQL Editor.
//
// Meme verification que open-chest : seul le token du broadcaster
// (BROADCASTER_TWITCH_USER_ID) peut appeler cette fonction.
//
// Deploiement : supabase functions deploy create-test-event
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

// Meme mapping que twitch-eventsub - 3 paliers : commun (follow), rare
// (sub T1), epique (sub T2 et T3 confondus).
const REWARD_BY_TIER: Record<string, string> = { '1000': 'rare', '2000': 'epique', '3000': 'epique' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const body = await req.json().catch(() => null);
  const accessToken = body?.access_token;
  const eventType = body?.event_type; // 'follow' | 'subscribe'
  const tier = body?.tier ?? null; // '1000' | '2000' | '3000' | null

  if (typeof accessToken !== 'string' || !accessToken) return json({ error: 'access_token manquant' }, 400);
  if (eventType !== 'follow' && eventType !== 'subscribe') return json({ error: 'event_type invalide' }, 400);

  const twitchRes = await fetch('https://api.twitch.tv/helix/users', {
    headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': TWITCH_CLIENT_ID },
  });
  if (!twitchRes.ok) return json({ error: 'token Twitch invalide' }, 401);
  const twitchUser = (await twitchRes.json())?.data?.[0];
  if (!twitchUser || twitchUser.id !== BROADCASTER_TWITCH_USER_ID) {
    return json({ error: 'seul le broadcaster peut creer un evenement de test' }, 403);
  }

  const rewardType = eventType === 'follow' ? 'commun' : (REWARD_BY_TIER[tier] ?? 'rare');

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await sb
    .from('chest_events')
    .insert({
      twitch_event_id: `test:${crypto.randomUUID()}`,
      event_type: eventType,
      tier: eventType === 'subscribe' ? tier : null,
      twitch_user_id: 'test-viewer',
      twitch_login: 'TestViewer',
      reward_type: rewardType,
    })
    .select()
    .single();

  if (error) return json({ error: 'insertion impossible : ' + error.message }, 500);
  return json({ ok: true, event: data });
});
