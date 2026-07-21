// Edge Function : ferme le coffre actuellement affiche sur l'overlay
// (passe son evenement 'triggered' a 'consumed'). Appelee par le bouton
// "Fermer le coffre" de chest-control.html. chest-overlay.html ecoute ce
// changement de statut en Realtime pour masquer le coffre/la recompense et
// enchainer sur le prochain evenement en attente, s'il y en a un.
//
// Meme verification que open-chest/create-test-event : seul le token du
// broadcaster peut declencher la fermeture.
//
// Deploiement : supabase functions deploy close-chest
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
    return json({ error: 'seul le broadcaster peut fermer le coffre' }, 403);
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: shown, error: fetchError } = await sb
    .from('chest_events')
    .select('*')
    .eq('status', 'triggered')
    .order('triggered_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fetchError) return json({ error: 'lecture impossible' }, 500);
  if (!shown) return json({ ok: true, event: null }); // rien n'est affiche actuellement

  const { data: updated, error: updateError } = await sb
    .from('chest_events')
    .update({ status: 'consumed' })
    .eq('id', shown.id)
    .eq('status', 'triggered')
    .select()
    .maybeSingle();

  if (updateError) return json({ error: 'fermeture impossible' }, 500);
  return json({ ok: true, event: updated });
});
