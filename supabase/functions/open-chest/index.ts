// Edge Function : declenche l'ouverture du prochain coffre en attente.
//
// Appelee uniquement par chest-control.html. Verifie que le access_token
// fourni appartient bien a TON compte Twitch (BROADCASTER_TWITCH_USER_ID) -
// impossible pour quelqu'un d'autre de declencher une ouverture meme s'il
// trouve l'URL de la fonction ou la cle anon (publiques par design). Passe
// ensuite le plus ancien evenement 'pending' de chest_events a 'triggered' ;
// chest-overlay.html recoit ce changement via Supabase Realtime et joue
// l'animation.
//
// Deploiement : supabase functions deploy open-chest
// (JWT verifie normalement : chest-control.html appelle via
// sb.functions.invoke, qui attache automatiquement la cle anon.)
// Secrets requis : CHEST_TWITCH_CLIENT_ID (app Twitch dediee au coffre,
// distincte de celle de l'avatar), BROADCASTER_TWITCH_USER_ID,
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
    return json({ error: 'seul le broadcaster peut ouvrir le coffre' }, 403);
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: pending, error: fetchError } = await sb
    .from('chest_events')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fetchError) return json({ error: 'lecture de la file impossible' }, 500);
  if (!pending) return json({ ok: true, event: null });

  // .eq('status','pending') en plus de l'id : evite un double-declenchement
  // si le bouton est clique deux fois tres vite.
  const { data: updated, error: updateError } = await sb
    .from('chest_events')
    .update({ status: 'triggered', triggered_at: new Date().toISOString() })
    .eq('id', pending.id)
    .eq('status', 'pending')
    .select()
    .maybeSingle();

  if (updateError) return json({ error: 'declenchement impossible' }, 500);
  if (!updated) return json({ error: 'evenement deja pris par une autre requete' }, 409);

  return json({ ok: true, event: updated });
});
