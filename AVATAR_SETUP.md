# Configuration des avatars personnalisables

Ce document explique comment activer le systeme d'avatars personnalisables
(page `avatar-editor.html` + stockage Supabase). Sans cette configuration,
le chat continue de fonctionner normalement avec les 4 avatars fixes par
defaut (attribues automatiquement selon le pseudo).

Deux services externes sont necessaires, tous les deux **gratuits** pour ce
volume d'usage :

- **Twitch Developer Console** : pour que les viewers puissent se connecter
  avec leur compte Twitch sur la page de creation d'avatar.
- **Supabase** : pour stocker les avatars personnalises (base de donnees
  gratuite, hebergee).

## 1. Creer une application Twitch

1. Va sur https://dev.twitch.tv/console/apps et connecte-toi avec ton
   compte Twitch (celui du streamer).
2. Clique sur **"Register Your Application"**.
3. Remplis :
   - **Name** : n'importe quoi, ex. `Mon Chat Overlay Avatars`
   - **OAuth Redirect URLs** : l'URL exacte ou `avatar-editor.html` sera
     heberge, ex. `https://TON-PSEUDO.github.io/twitch-chat-overlay/avatar-editor.html`
     (doit correspondre au caractere pres, sans slash final en trop)
   - **Category** : `Website Integration`
4. Une fois cree, copie le **Client ID** affiche - tu en auras besoin a
   l'etape 3.

Pas besoin de "Client Secret" : on utilise le flow OAuth "implicit grant",
qui ne necessite aucun secret cote client (adapte a un site 100% statique).

## 2. Creer un projet Supabase

1. Va sur https://supabase.com et cree un compte / connecte-toi.
2. Cree un nouveau projet (choisis n'importe quelle region proche de toi).
3. Une fois le projet pret, va dans **SQL Editor** (menu de gauche) et colle
   le contenu du fichier [`supabase/schema.sql`](supabase/schema.sql) de ce
   repo, puis execute-le (bouton "Run"). Ca cree la table
   `avatar_customizations` et ses regles d'acces.
4. Va dans **Project Settings > API**. Tu as besoin de deux valeurs :
   - **Project URL** (ressemble a `https://xxxxx.supabase.co`)
   - **anon public key** (une longue chaine de caracteres)

## 3. Remplir la configuration

Deux fichiers ont chacun un bloc `CONFIG` a completer avec les valeurs
recuperees aux etapes 1 et 2 :

**`avatar-editor.html`** (tout en haut du `<script>` principal) :
```js
const CONFIG = {
  TWITCH_CLIENT_ID: 'colle_ton_client_id_ici',
  REDIRECT_URI: location.origin + location.pathname, // ne pas toucher
  SUPABASE_URL: 'https://xxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'colle_ta_anon_key_ici',
};
```

**`twitch-chat-ink.html`** (dans le bloc `CONFIG` principal, en bas de la
liste) :
```js
SUPABASE_URL: 'https://xxxxx.supabase.co',       // meme valeurs que
SUPABASE_ANON_KEY: 'colle_ta_anon_key_ici',      // dans avatar-editor.html
```

## 4. Deployer et partager le lien

Une fois les deux fichiers mis a jour et deployes (GitHub Pages ou
equivalent), partage le lien vers `avatar-editor.html` a tes viewers (par
exemple en description de stream, ou epingle dans le chat) :

```
https://TON-PSEUDO.github.io/twitch-chat-overlay/avatar-editor.html
```

Chaque viewer s'y connecte avec son compte Twitch, choisit ses pieces
(base, jambes, yeux, objet, chapeau, antenne), et enregistre. Son avatar
personnalise apparaitra automatiquement dans l'overlay de chat la prochaine
fois qu'il postera un message (l'overlay va chercher la config une seule
fois par pseudo et la garde en cache le temps de la session).

## Remplacer les pieces "placeholder"

Les fichiers dans `assets/parts/` (`base-01.png`, `eyes-02.png`, etc.) sont
des placeholders generiques (formes colorees avec un label) qui servent a
verifier que tout le systeme fonctionne. Pour les remplacer par tes propres
dessins :

- Garde exactement les memes noms de fichiers (`base-01.png`, `base-02.png`,
  `base-03.png`, ...) sauf si tu changes aussi le nombre d'options par
  categorie dans `assets/parts-manifest.js` (`count`).
- Dessine chaque piece sur un canevas de **300x300px**, fond transparent,
  avec les memes points d'ancrage d'une piece a l'autre dans une meme
  categorie (ex. tous les "eyes" doivent etre positionnes pareil sur le
  canevas) puisque les pieces sont empilees les unes sur les autres sans
  ajustement automatique de position.
- Pour ajouter plus d'options (ex. 5 bases au lieu de 3), ajoute les
  fichiers `base-04.png`, `base-05.png` et augmente `count: 5` dans
  `assets/parts-manifest.js`.

**Etat actuel des categories** (`assets/parts-manifest.js`) :
- Actives : `base` (3 options), `eyes` (10 options), `antenna` (9 options).
- Retiree : `legs` (supprimee du systeme).
- Desactivees en attendant les dessins : `object`, `hat`, `mandible` - les
  entrees sont commentees dans `categories` (et dans `renderOrder` pour
  `object`/`hat`/`mandible` qui restent presentes sans effet). Pour
  reactiver `object` ou `hat` : decommente la ligne correspondante dans
  `categories`, place les fichiers `object-0X.png` / `hat-0X.png` dans
  `assets/parts/`, c'est tout.
- `mandible` a une etape en plus avant de pouvoir etre reactivee : sa
  colonne n'existe pas encore dans la table Supabase (elle a ete ajoutee
  au systeme apres coup). Lance d'abord la migration indiquee tout en bas
  de [`supabase/schema.sql`](supabase/schema.sql) dans le SQL Editor de ton
  projet Supabase, puis decommente la ligne `mandible` dans `categories` et
  ajoute les fichiers `mandible-0X.png`.

## Limite de securite importante (a lire)

Dans cette version, l'ecriture dans Supabase depuis `avatar-editor.html` se
fait directement avec la cle publique ("anon key"), sans verification
serveur du token Twitch. Ca veut dire qu'un utilisateur un peu bidouilleur
pourrait techniquement, via les outils de developpement de son navigateur,
ecrire ou ecraser l'avatar de quelqu'un d'autre. Pour un usage normal (les
viewers utilisent simplement la page prevue pour ca), ce n'est pas un
probleme. Si tu veux fermer cette faille correctement, il faut ajouter une
Supabase Edge Function qui verifie le token aupres de l'API Twitch avant
d'ecrire - une evolution possible mais hors scope de cette premiere version.
Le detail est aussi commente directement dans `supabase/schema.sql`.
