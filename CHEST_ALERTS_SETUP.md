# Configuration du systeme d'alertes "coffre" (follow / sub)

Ce document explique comment activer le systeme d'alertes : un follow ou un
sub declenche un evenement, tu ouvres le coffre depuis `chest-control.html`
(page privee, a toi seul), et `chest-overlay.html` (source OBS) joue
l'animation (fissures -> machine a sous -> video de recompense).

Prerequis : avoir deja suivi [`AVATAR_SETUP.md`](AVATAR_SETUP.md) (meme
projet Twitch + Supabase reutilise). Compte environ **30-45 minutes** la
premiere fois, essentiellement a cause du flow OAuth broadcaster et du test
EventSub.

## Vue d'ensemble

- `chest-overlay.html` (dans OBS) : passif, ecoute Supabase Realtime, ne
  necessite aucune authentification.
- `chest-control.html` (onglet a part, jamais dans OBS) : toi seul, connecte
  avec ton compte Twitch, bouton "Ouvrir le coffre".
- 4 Edge Functions Supabase font tout le travail sensible cote serveur (cle
  `service_role`, jamais exposee au navigateur) :
  - `twitch-eventsub` : recoit les webhooks Twitch (follow/sub), calcule la
    recompense, remplit la file `chest_events`.
  - `broadcaster-authorize` + `broadcaster-oauth-callback` : flow OAuth
    **one-shot** que tu fais une seule fois pour autoriser la creation des
    abonnements EventSub.
  - `open-chest` : verifie que c'est bien toi avant de faire avancer la file.

## 1. Creer une app Twitch dediee au coffre

Contrairement a l'avatar (implicit grant, pas de secret), le flow OAuth
broadcaster a besoin d'un Client Secret. Une app Twitch **publique** (comme
celle deja utilisee par `AVATAR_SETUP.md`) ne peut pas en generer un
correctement pour ce genre d'usage - il faut donc une **app dediee** pour le
systeme de coffre (ex. nommee `CHEST_SETUP`), separee de celle de l'avatar.
Consequence : `chest-control.html` et les Edge Functions du coffre utilisent
un `TWITCH_CLIENT_ID` different de celui d'`avatar-editor.html` - ne melange
pas les deux.

1. Va sur https://dev.twitch.tv/console/apps et clique **"Register Your
   Application"** pour creer cette nouvelle app.
2. Dans **OAuth Redirect URLs**, ajoute DEUX URLs :
   - Celle de la fonction `broadcaster-oauth-callback` (tu la connaitras a
     l'etape 3, ex. `https://xxxxx.supabase.co/functions/v1/broadcaster-oauth-callback`) ;
   - Celle ou `chest-control.html` sera heberge (ex.
     `https://TON-PSEUDO.github.io/twitch-chat-overlay/chest-control.html`),
     necessaire pour le login broadcaster implicit-grant de cette page.
3. Clique **New Secret**, copie la valeur (elle ne sera plus jamais
   affichee) - c'est `CHEST_TWITCH_CLIENT_SECRET`. Note aussi le **Client
   ID** de cette nouvelle app - c'est `CHEST_TWITCH_CLIENT_ID`, a coller
   dans `chest-control.html` (`CONFIG.TWITCH_CLIENT_ID`).
4. Note aussi ton **Twitch User ID numerique** (pas ton pseudo) : va sur
   https://streamscharts.com/tools/convert-username ou utilise
   https://dev.twitch.tv/docs/api/reference/#get-users en te connectant -
   tu en auras besoin pour `BROADCASTER_TWITCH_USER_ID`.

## 2. Executer la migration SQL

Dans **SQL Editor** de ton projet Supabase, ré-execute
[`supabase/schema.sql`](supabase/schema.sql) (il contient maintenant aussi
`chest_events` et `broadcaster_tokens`, en plus de `avatar_customizations`).

## 3. Configurer les secrets Supabase

Avec le [Supabase CLI](https://supabase.com/docs/guides/cli) deja lie a ton
projet (voir `AVATAR_SETUP.md` section 2bis) :

```
supabase secrets set CHEST_TWITCH_CLIENT_ID=colle_le_client_id_de_l_app_CHEST_SETUP
supabase secrets set CHEST_TWITCH_CLIENT_SECRET=colle_ton_client_secret_ici
supabase secrets set BROADCASTER_TWITCH_USER_ID=ton_id_numerique_twitch
supabase secrets set BROADCASTER_REDIRECT_URI=https://xxxxx.supabase.co/functions/v1/broadcaster-oauth-callback
supabase secrets set EVENTSUB_CALLBACK_URL=https://xxxxx.supabase.co/functions/v1/twitch-eventsub
supabase secrets set EVENTSUB_SECRET=une_chaine_aleatoire_que_tu_inventes_toi_meme
```

Ne confonds pas `CHEST_TWITCH_CLIENT_ID` avec le `TWITCH_CLIENT_ID` deja
configure pour `save-avatar` depuis `AVATAR_SETUP.md` - ce sont deux apps
Twitch differentes, donc deux secrets differents. `CHEST_TWITCH_CLIENT_SECRET`
en particulier ne doit jamais transiter ailleurs que dans cette commande,
lancee par toi-meme dans ton propre terminal.

`EVENTSUB_SECRET` : n'importe quelle chaine aleatoire suffisamment longue
(ex. genere avec `openssl rand -hex 32`). Elle sert a signer/verifier les
webhooks entre Twitch et `twitch-eventsub` - garde-la secrete, ne la mets
jamais dans un fichier commite.

## 4. Deployer les 4 Edge Functions

```
supabase functions deploy twitch-eventsub --no-verify-jwt
supabase functions deploy broadcaster-authorize --no-verify-jwt
supabase functions deploy broadcaster-oauth-callback --no-verify-jwt
supabase functions deploy open-chest
```

Les trois premieres sont appelees directement par Twitch ou par un simple
lien de navigateur (pas d'Authorization Supabase dans la requete), d'ou
`--no-verify-jwt`. `open-chest` est appelee via `supabase-js` depuis
`chest-control.html`, qui attache automatiquement la cle anon - la
verification JWT normale de Supabase reste donc active en plus de la
verification du token Twitch a l'interieur de la fonction.

## 5. Autorisation broadcaster one-shot

1. Visite dans ton navigateur (connecte avec ton compte **streamer**) :
   `https://xxxxx.supabase.co/functions/v1/broadcaster-authorize`
2. Accepte les scopes demandes sur la page Twitch (lecture des follows et
   des subs).
3. Tu arrives sur une page texte confirmant la creation des deux
   abonnements EventSub (`channel.follow`, `channel.subscribe`). Si l'un des
   deux affiche une erreur, le detail Twitch est inclus dans le texte - le
   cas le plus frequent est un scope manquant ou un ID broadcaster errone.

Cette etape n'est a refaire que si tu dois recreer les abonnements
(par exemple apres une longue coupure ou un changement d'app Twitch) - les
abonnements persistent cote Twitch independamment de la validite du token.

## 6. Configuration cote client

- `chest-overlay.html` : bloc `CONFIG` avec les memes `SUPABASE_URL` /
  `SUPABASE_ANON_KEY` qu'`AVATAR_SETUP.md` (pas de Client ID Twitch ici,
  cette page ne fait aucun login).
- `chest-control.html` : memes `SUPABASE_URL` / `SUPABASE_ANON_KEY`, plus
  `TWITCH_CLIENT_ID` = le Client ID de la nouvelle app **`CHEST_SETUP`**
  (etape 1) - PAS celui de l'avatar - et `BROADCASTER_TWITCH_USER_ID` (ton
  ID Twitch numerique).

## 7. Ajouter les sources dans OBS / navigateur

- **`chest-overlay.html`** : Source Navigateur dans OBS, comme
  `chat-v6.html`. Aucune interaction necessaire.
- **`chest-control.html`** : a ouvrir dans un onglet de navigateur normal
  (Chrome, Edge...) a cote d'OBS, jamais comme source OBS. Connecte-toi avec
  ton compte streamer, le bouton "Ouvrir le coffre" reste desactive tant que
  la file est vide.

## 8. Tester sans attendre un vrai follow/sub

Deux options, de la plus proche du reel a la plus rapide pour iterer :

- **Twitch CLI** (teste tout le pipeline reel, y compris la signature HMAC) :
  ```
  twitch event trigger channel.follow --transport=webhook -F https://xxxxx.supabase.co/functions/v1/twitch-eventsub -s TON_EVENTSUB_SECRET
  ```
  (voir `twitch event trigger --help` - les flags exacts peuvent varier
  selon la version du CLI). Verifie ensuite qu'une ligne apparait dans
  `chest_events` (Table Editor Supabase) et que `chest-control.html` affiche
  la file mise a jour.
- **Mode simulate cote overlay** (aucune dependance Twitch/Supabase, pour
  iterer vite sur l'animation) : ouvre `chest-overlay.html?simulate=follow`
  ou `chest-overlay.html?simulate=sub:2000` directement dans le navigateur.
- **Panneau de test** : ouvre `chest-overlay.html?debug=1` pour afficher 4
  boutons (follow, sub T1/T2/T3) et rejouer l'animation complete a volonte,
  sans recharger la page a chaque essai. Le panneau ne s'affiche jamais sans
  `?debug=1`, donc rien a craindre cote OBS.

## Limites connues

- Un abonnement EventSub `channel.follow` necessite le scope
  `moderator:read:followers` du **broadcaster lui-meme** agissant comme son
  propre moderateur (`moderator_user_id = broadcaster_user_id`) - c'est le
  fonctionnement normal de l'API Twitch depuis la depreciation de l'ancien
  webhook follows.
- Les dons (StreamElements/Streamlabs/Tipeee) ne sont pas couverts par ce
  systeme : hors scope pour cette version, l'API Twitch ne les expose pas.
- Si Twitch renvoie le meme webhook deux fois (retry reseau), la dedup se
  fait via `Twitch-Eventsub-Message-Id` - normalement invisible pour toi.
