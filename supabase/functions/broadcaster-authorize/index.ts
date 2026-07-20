// Edge Function : point de depart du flow OAuth ONE-SHOT du broadcaster.
//
// A visiter une seule fois (toi, connecte avec ton compte streamer) pour
// autoriser les scopes necessaires a la creation des abonnements EventSub
// (moderator:read:followers, channel:read:subscriptions). Redirige vers
// Twitch, qui redirige ensuite vers broadcaster-oauth-callback.
//
// Contrairement au login "viewer" de avatar-editor.html/chest-control.html
// (implicit grant, pas de secret), ce flow utilise "Authorization Code" car
// on a besoin d'un refresh_token stocke cote serveur - l'implicit grant ne
// fournit pas de refresh_token.
//
// Deploiement : supabase functions deploy broadcaster-authorize --no-verify-jwt
// Secrets requis : CHEST_TWITCH_CLIENT_ID (app Twitch dediee au coffre,
// distincte de celle de l'avatar), BROADCASTER_REDIRECT_URI (= URL publique
// de la fonction broadcaster-oauth-callback, doit matcher EXACTEMENT ce qui
// est enregistre dans dev.twitch.tv/console/apps).

const TWITCH_CLIENT_ID = Deno.env.get('CHEST_TWITCH_CLIENT_ID')!;
const BROADCASTER_REDIRECT_URI = Deno.env.get('BROADCASTER_REDIRECT_URI')!;

Deno.serve(() => {
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: BROADCASTER_REDIRECT_URI,
    response_type: 'code',
    scope: 'moderator:read:followers channel:read:subscriptions',
    state,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://id.twitch.tv/oauth2/authorize?${params.toString()}`,
      // Cookie courte duree verifiee par broadcaster-oauth-callback (anti-CSRF minimal).
      'Set-Cookie': `oauth_state=${state}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`,
    },
  });
});
