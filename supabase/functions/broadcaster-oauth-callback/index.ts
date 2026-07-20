// Edge Function : reception du callback OAuth du flow one-shot broadcaster
// (voir broadcaster-authorize). Echange le code contre un access/refresh
// token, verifie que c'est bien TON compte streamer, stocke le token dans
// broadcaster_tokens, puis cree les abonnements EventSub (channel.follow,
// channel.subscribe) pointant vers twitch-eventsub.
//
// Deploiement : supabase functions deploy broadcaster-oauth-callback --no-verify-jwt
// Secrets requis : CHEST_TWITCH_CLIENT_ID + CHEST_TWITCH_CLIENT_SECRET (app
// Twitch dediee au coffre, distincte de celle de l'avatar),
// BROADCASTER_REDIRECT_URI (identique a celle de broadcaster-authorize),
// BROADCASTER_TWITCH_USER_ID (ton id Twitch numerique - securite : refuse
// n'importe quel autre compte), EVENTSUB_CALLBACK_URL (URL publique de la
// fonction twitch-eventsub), EVENTSUB_SECRET (chaine aleatoire que tu
// generes toi-meme, partagee avec Twitch pour signer les webhooks),
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TWITCH_CLIENT_ID = Deno.env.get('CHEST_TWITCH_CLIENT_ID')!;
const TWITCH_CLIENT_SECRET = Deno.env.get('CHEST_TWITCH_CLIENT_SECRET')!;
const BROADCASTER_REDIRECT_URI = Deno.env.get('BROADCASTER_REDIRECT_URI')!;
const BROADCASTER_TWITCH_USER_ID = Deno.env.get('BROADCASTER_TWITCH_USER_ID')!;
const EVENTSUB_CALLBACK_URL = Deno.env.get('EVENTSUB_CALLBACK_URL')!;
const EVENTSUB_SECRET = Deno.env.get('EVENTSUB_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) out[k] = v.join('=');
  }
  return out;
}

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

// Twitch exige un app access token (client_credentials) pour creer un
// abonnement EventSub en mode "webhook" - le token utilisateur ne fonctionne
// pas ici (erreur "auth must use app access token"), meme si c'est bien le
// consentement utilisateur (scopes accordes plus haut) qui autorise la
// lecture des follows/subs.
async function getAppAccessToken(): Promise<string> {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new Error('app access token Twitch echoue : ' + (await res.text()));
  const body = await res.json();
  return body.access_token;
}

async function createEventSubSubscription(
  type: string,
  version: string,
  condition: Record<string, string>,
  appAccessToken: string,
) {
  const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${appAccessToken}`,
      'Client-Id': TWITCH_CLIENT_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type,
      version,
      condition,
      transport: { method: 'webhook', callback: EVENTSUB_CALLBACK_URL, secret: EVENTSUB_SECRET },
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { type, ok: res.ok, status: res.status, body };
}

// Un 409 "subscription already exists" n'est pas un echec : ca veut dire
// qu'un abonnement identique tourne deja. On va chercher son statut reel
// (enabled / webhook_callback_verification_pending / ...) plutot que de
// simplement rapporter une erreur trompeuse.
async function findSubscriptionStatus(
  type: string,
  appAccessToken: string,
  broadcasterUserId: string,
): Promise<string | null> {
  // Pas de filtre par query params ici : combiner type+user_id ne renvoie
  // rien cote Twitch (verifie en pratique). On liste tout (peu de volume
  // pour un usage solo-streamer) et on filtre nous-memes.
  const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    headers: { Authorization: `Bearer ${appAccessToken}`, 'Client-Id': TWITCH_CLIENT_ID },
  });
  if (!res.ok) return null;
  const body = await res.json();
  const match = (body?.data ?? []).find(
    (s: { type?: string; condition?: { broadcaster_user_id?: string } }) =>
      s.type === type && s.condition?.broadcaster_user_id === broadcasterUserId,
  );
  return match?.status ?? null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookies = parseCookies(req.headers.get('cookie') ?? '');

  if (!code || !state || state !== cookies['oauth_state']) {
    return text('Etat OAuth invalide ou expire. Relance le flow depuis broadcaster-authorize.', 400);
  }

  const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: BROADCASTER_REDIRECT_URI,
    }),
  });
  if (!tokenRes.ok) return text('Echange de token Twitch echoue : ' + (await tokenRes.text()), 500);
  const tokenBody = await tokenRes.json();

  const userRes = await fetch('https://api.twitch.tv/helix/users', {
    headers: { Authorization: `Bearer ${tokenBody.access_token}`, 'Client-Id': TWITCH_CLIENT_ID },
  });
  const user = (await userRes.json())?.data?.[0];
  if (!user) return text('Impossible de recuperer le compte Twitch.', 500);

  if (user.id !== BROADCASTER_TWITCH_USER_ID) {
    return text(
      `Ce compte Twitch (${user.login}) ne correspond pas a BROADCASTER_TWITCH_USER_ID configure. ` +
        `Reconnecte-toi avec le compte streamer, ou corrige la variable si elle est fausse.`,
      403,
    );
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error: upsertError } = await sb.from('broadcaster_tokens').upsert({
    id: 1,
    twitch_user_id: user.id,
    access_token: tokenBody.access_token,
    refresh_token: tokenBody.refresh_token,
    scope: tokenBody.scope,
    expires_at: new Date(Date.now() + tokenBody.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (upsertError) return text('Erreur en stockant le token : ' + upsertError.message, 500);

  let appAccessToken: string;
  try {
    appAccessToken = await getAppAccessToken();
  } catch (err) {
    return text('Impossible d\'obtenir un app access token Twitch : ' + (err as Error).message, 500);
  }

  const subs = await Promise.all([
    createEventSubSubscription(
      'channel.follow',
      '2',
      { broadcaster_user_id: user.id, moderator_user_id: user.id },
      appAccessToken,
    ),
    createEventSubSubscription('channel.subscribe', '1', { broadcaster_user_id: user.id }, appAccessToken),
  ]);

  const summaryLines = await Promise.all(
    subs.map(async (s) => {
      if (s.ok) return `- ${s.type}: OK (status: ${s.body?.data?.[0]?.status ?? 'inconnu'})`;
      if (s.status === 409) {
        const existingStatus = await findSubscriptionStatus(s.type, appAccessToken, user.id);
        return `- ${s.type}: deja actif (status: ${existingStatus ?? 'inconnu, verifie manuellement'})`;
      }
      return `- ${s.type}: ECHEC (${s.status} ${JSON.stringify(s.body)})`;
    }),
  );
  const summary = summaryLines.join('\n');

  return text(
    `Connecte en tant que ${user.login}.\n\nAbonnements EventSub :\n${summary}\n\n` +
      `Tu peux fermer cet onglet. Cette page ne doit etre revisitee que si tu dois recreer les abonnements.`,
  );
});
