// Edge Function : webhook public appele directement par Twitch EventSub pour
// channel.follow et channel.subscribe.
//
// Verifie la signature HMAC (secret partage EVENTSUB_SECRET, connu
// uniquement de Twitch et de cette fonction), calcule le reward_type
// (rareté) selon l'evenement recu, et insere dans chest_events. C'est le
// SEUL endroit qui decide de la recompense : chest-overlay.html se contente
// d'animer un resultat deja tranche ici, jamais un tirage cote client.
//
// Deploiement : supabase functions deploy twitch-eventsub --no-verify-jwt
// (Twitch n'envoie pas d'Authorization Supabase, la verification se fait
// via la signature HMAC ci-dessous, pas via le JWT Supabase).
// Secrets requis : EVENTSUB_SECRET (genere par toi, meme valeur que celle
// donnee a Twitch lors de la creation de l'abonnement dans
// broadcaster-oauth-callback), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EVENTSUB_SECRET = Deno.env.get('EVENTSUB_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Mapping recompense par defaut - ajuste librement ces valeurs.
// 3 paliers : commun (follow), rare (sub T1), epique (sub T2 et T3 confondus).
const REWARD_BY_TIER: Record<string, string> = {
  '1000': 'rare',
  '2000': 'epique',
  '3000': 'epique',
};
const FOLLOW_REWARD = 'commun';

function rewardFor(eventType: string, tier: string | null): string {
  if (eventType === 'follow') return FOLLOW_REWARD;
  return (tier && REWARD_BY_TIER[tier]) || 'rare';
}

async function isValidSignature(req: Request, rawBody: string): Promise<boolean> {
  const messageId = req.headers.get('Twitch-Eventsub-Message-Id') ?? '';
  const timestamp = req.headers.get('Twitch-Eventsub-Message-Timestamp') ?? '';
  const signature = req.headers.get('Twitch-Eventsub-Message-Signature') ?? '';
  if (!messageId || !timestamp || !signature) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(EVENTSUB_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(messageId + timestamp + rawBody),
  );
  const hex = 'sha256=' + Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === signature;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const rawBody = await req.text();
  if (!(await isValidSignature(req, rawBody))) {
    return new Response('signature invalide', { status: 403 });
  }

  const messageType = req.headers.get('Twitch-Eventsub-Message-Type');
  const payload = JSON.parse(rawBody);

  if (messageType === 'webhook_callback_verification') {
    return new Response(payload.challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  if (messageType === 'revocation') {
    console.warn('[twitch-eventsub] abonnement revoque par Twitch:', payload.subscription);
    return new Response(null, { status: 204 });
  }

  if (messageType === 'notification') {
    const subType = payload.subscription.type as string; // 'channel.follow' | 'channel.subscribe'
    const event = payload.event;
    const eventType = subType === 'channel.follow' ? 'follow' : 'subscribe';
    const tier = eventType === 'subscribe' ? (event.tier as string) : null;

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { error } = await sb.from('chest_events').upsert(
      {
        // dedup les retries Twitch : meme message = meme Message-Id.
        twitch_event_id: req.headers.get('Twitch-Eventsub-Message-Id'),
        event_type: eventType,
        tier,
        twitch_user_id: event.user_id,
        twitch_login: event.user_login ?? event.user_name,
        reward_type: rewardFor(eventType, tier),
      },
      { onConflict: 'twitch_event_id', ignoreDuplicates: true },
    );

    if (error) console.error('[twitch-eventsub] insertion chest_events:', error);
    return new Response(null, { status: 204 });
  }

  return new Response(null, { status: 204 });
});
