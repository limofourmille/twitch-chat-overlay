// Edge Function : sauvegarde d'un avatar personnalise.
//
// Contrairement a l'ancienne version (ecriture directe depuis
// avatar-editor.html avec la cle anon), cette fonction verifie aupres de
// Twitch que le access_token fourni appartient bien a un utilisateur reel
// avant d'ecrire quoi que ce soit - impossible d'ecraser l'avatar de
// quelqu'un d'autre en falsifiant twitch_user_id depuis les devtools.
//
// Deploiement : supabase functions deploy save-avatar
// Secret requis : TWITCH_CLIENT_ID (supabase secrets set TWITCH_CLIENT_ID=...)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TWITCH_CLIENT_ID = Deno.env.get('TWITCH_CLIENT_ID')!;
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

// N'accepte que des entiers positifs (index de piece valide) ou null.
function toSmallIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }

  const accessToken = body.access_token;
  if (typeof accessToken !== 'string' || !accessToken) {
    return json({ error: 'access_token manquant' }, 400);
  }

  const twitchRes = await fetch('https://api.twitch.tv/helix/users', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': TWITCH_CLIENT_ID,
    },
  });
  if (!twitchRes.ok) return json({ error: 'token Twitch invalide' }, 401);

  const twitchBody = await twitchRes.json();
  const twitchUser = twitchBody?.data?.[0];
  if (!twitchUser) return json({ error: 'token Twitch invalide' }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error } = await sb.from('avatar_customizations').upsert({
    twitch_user_id: twitchUser.id,
    twitch_login: twitchUser.login,
    base: toSmallIntOrNull(body.base) ?? 1,
    eyes: toSmallIntOrNull(body.eyes) ?? 1,
    hat: toSmallIntOrNull(body.hat),
    antenna: toSmallIntOrNull(body.antenna),
    object: toSmallIntOrNull(body.object),
    mandible: toSmallIntOrNull(body.mandible),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[save-avatar] upsert error', error);
    return json({ error: 'sauvegarde impossible' }, 500);
  }

  return json({ ok: true, twitch_login: twitchUser.login });
});
