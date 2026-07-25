-- A executer une seule fois dans Supabase (Dashboard > SQL Editor > New query).

create table if not exists avatar_customizations (
  twitch_user_id text primary key,
  twitch_login   text not null,
  base           smallint not null default 1,
  eyes           smallint not null default 1,
  hat            smallint,
  antenna        smallint,
  object         smallint,
  mandible       smallint,
  updated_at     timestamptz not null default now()
);

alter table avatar_customizations enable row level security;

-- Lecture publique : l'overlay (anonyme, tourne dans OBS) doit pouvoir lire
-- l'avatar de n'importe quel viewer qui parle dans le chat.
create policy "avatar_customizations_public_read"
  on avatar_customizations
  for select
  using (true);

-- Ecriture : AUCUNE policy insert/update publique. Toute sauvegarde passe
-- exclusivement par la Edge Function `save-avatar`
-- (supabase/functions/save-avatar), qui verifie le token Twitch cote serveur
-- (appel a https://api.twitch.tv/helix/users) avant d'ecrire avec la
-- service_role key (qui bypass RLS par design). C'est la seule facon de
-- garantir qu'un viewer ne peut modifier que SON PROPRE avatar - voir
-- avatar-editor.html pour l'appel cote client.

-- MIGRATION SECURITE - a executer une seule fois si ton projet Supabase a
-- ete cree avant l'ajout de la Edge Function save-avatar : ces deux
-- anciennes policies acceptaient n'importe quelle ecriture venant de
-- n'importe qui possedant la cle anon (publique par design), permettant a
-- un viewer bidouilleur d'ecraser l'avatar de quelqu'un d'autre depuis les
-- devtools. Il faut les supprimer, sinon le trou reste ouvert en plus de la
-- nouvelle fonction :
-- drop policy if exists "avatar_customizations_public_insert_PROTOTYPE_ONLY" on avatar_customizations;
-- drop policy if exists "avatar_customizations_public_update_PROTOTYPE_ONLY" on avatar_customizations;

-- MIGRATION - a lancer une seule fois si ton projet existait deja avant
-- l'ajout de la categorie "mandible" (sinon la colonne n'existe pas encore
-- et les sauvegardes echoueront une fois la categorie reactivee) :
-- alter table avatar_customizations add column if not exists mandible smallint;


-- ===========================================================================
-- Systeme d'alertes "coffre" (follow / sub) - voir CHEST_ALERTS_SETUP.md
-- ===========================================================================

-- File des evenements Twitch (follow/sub) en attente d'etre "ouverts" par le
-- streamer depuis chest-control.html. reward_type est calcule cote serveur
-- (Edge Function twitch-eventsub) au moment de la reception du webhook -
-- jamais recalcule cote client, pour que l'overlay ne fasse qu'animer un
-- resultat deja connu. 3 paliers : commun (follow), rare (sub T1), epique
-- (sub T2 et T3 confondus).
create table if not exists chest_events (
  id              uuid primary key default gen_random_uuid(),
  -- Twitch-Eventsub-Message-Id du webhook recu : dedup des livraisons en
  -- double que Twitch peut renvoyer (retries).
  twitch_event_id text unique not null,
  event_type      text not null check (event_type in ('follow', 'subscribe')),
  tier            text,  -- '1000' / '2000' / '3000' pour les subs, null pour un follow
  twitch_user_id  text not null,
  twitch_login    text not null,
  reward_type     text not null check (reward_type in ('commun', 'rare', 'epique')),
  status          text not null default 'pending' check (status in ('pending', 'triggered', 'consumed')),
  created_at      timestamptz not null default now(),
  triggered_at    timestamptz
);

alter table chest_events enable row level security;

-- Lecture publique : l'overlay OBS (anonyme, passif) doit pouvoir observer
-- la file et les changements de statut en temps reel.
create policy "chest_events_public_read"
  on chest_events
  for select
  using (true);

-- Ecriture : AUCUNE policy insert/update publique. Seules les Edge Functions
-- twitch-eventsub (insertion) et open-chest (passage a 'triggered') ecrivent,
-- via la service_role key qui bypass RLS.

-- Active le flux Realtime sur cette table (l'overlay ecoute les INSERT/UPDATE).
alter publication supabase_realtime add table chest_events;


-- Stocke le token broadcaster (scopes moderator:read:followers +
-- channel:read:subscriptions) obtenu via le flow OAuth one-shot de
-- broadcaster-oauth-callback, utilise pour creer les abonnements EventSub.
-- Ligne unique (id = 1). Aucune policy : table entierement invisible/
-- inaccessible en dehors des Edge Functions (service_role bypass RLS).
create table if not exists broadcaster_tokens (
  id             smallint primary key default 1,
  twitch_user_id text not null,
  access_token   text not null,
  refresh_token  text not null,
  scope          text[] not null,
  expires_at     timestamptz not null,
  updated_at     timestamptz not null default now()
);

alter table broadcaster_tokens enable row level security;


-- Reglages de chevauchement audio de l'overlay, ajustables depuis
-- chest-control.html (voir supabase/functions/update-chest-settings).
-- Ligne unique (id = 1). Lecture publique (chest-overlay.html, anonyme, lit
-- ces valeurs au demarrage et via Realtime) ; ecriture uniquement via la
-- Edge Function (verifie que c'est bien le broadcaster).
-- opening.mp3 et waiting.mp3 sont les memes fichiers quel que soit le
-- palier de recompense - ces deux chevauchements restent donc uniques
-- (pas de variante par palier). ongoing-<palier>.mp3 et ending-<palier>.mp3
-- different en revanche d'un palier a l'autre (longueur, attaque...), d'ou
-- un chevauchement distinct par palier pour ces deux transitions.
create table if not exists chest_settings (
  id                                  smallint primary key default 1,
  -- Duree (ms) pendant laquelle le tour suivant de waiting.mp3 demarre
  -- avant la fin reelle du tour courant (boucle sur elle-meme, sans coupure).
  waiting_loop_overlap_ms             integer not null default 200 check (waiting_loop_overlap_ms between 0 and 5000),
  -- Duree (ms) avant laquelle opening.mp3 demarre par rapport a la fin du
  -- tour de waiting.mp3 en cours, une fois l'ouverture declenchee.
  waiting_opening_overlap_ms          integer not null default 200 check (waiting_opening_overlap_ms between 0 and 5000),
  -- Duree (ms) avant laquelle ongoing-<palier>.mp3 demarre par rapport a la
  -- fin reelle de opening.mp3 - un reglage par palier.
  opening_ongoing_overlap_ms_commun   integer not null default 200 check (opening_ongoing_overlap_ms_commun between 0 and 5000),
  opening_ongoing_overlap_ms_rare     integer not null default 200 check (opening_ongoing_overlap_ms_rare between 0 and 5000),
  opening_ongoing_overlap_ms_epique   integer not null default 200 check (opening_ongoing_overlap_ms_epique between 0 and 5000),
  -- Duree (ms) avant laquelle ending-<palier>.mp3 demarre par rapport a la
  -- fin reelle de ongoing-<palier>.mp3 (et duree avant laquelle la carte de
  -- recompense se referme par rapport a la fin de ending-<palier>.mp3) - un
  -- reglage par palier.
  ongoing_ending_overlap_ms_commun    integer not null default 200 check (ongoing_ending_overlap_ms_commun between 0 and 5000),
  ongoing_ending_overlap_ms_rare      integer not null default 200 check (ongoing_ending_overlap_ms_rare between 0 and 5000),
  ongoing_ending_overlap_ms_epique    integer not null default 200 check (ongoing_ending_overlap_ms_epique between 0 and 5000),
  -- Volume (%) applique a toutes les pistes de l'overlay (attente, ouverture,
  -- ongoing, ending). Ajustable en direct, y compris pendant la lecture.
  volume_percent                      integer not null default 100 check (volume_percent between 0 and 100),
  -- Position (%) du point d'origine des rayons lumineux, de la pluie
  -- d'objets et de l'icone de recompense qui monte - cale par defaut sur
  -- l'ouverture du coffre. Memes conventions que les proprietes CSS
  -- left/bottom (0 = bord gauche/bas, 100 = bord droit/haut). Ajustable en
  -- direct, y compris pendant que le coffre est affiche.
  effect_origin_x_percent             integer not null default 50 check (effect_origin_x_percent between 0 and 100),
  effect_origin_y_percent             integer not null default 50 check (effect_origin_y_percent between 0 and 100),
  updated_at                          timestamptz not null default now()
);

insert into chest_settings (id) values (1) on conflict (id) do nothing;

-- MIGRATION - a lancer une seule fois si ton projet Supabase a deja
-- chest_settings sans la colonne volume_percent (ajoutee apres coup) :
-- alter table chest_settings add column if not exists volume_percent integer not null default 100 check (volume_percent between 0 and 100);

-- MIGRATION - a lancer une seule fois si ton projet Supabase a deja
-- chest_settings sans les colonnes effect_origin_x_percent/effect_origin_y_percent :
-- alter table chest_settings add column if not exists effect_origin_x_percent integer not null default 50 check (effect_origin_x_percent between 0 and 100);
-- alter table chest_settings add column if not exists effect_origin_y_percent integer not null default 50 check (effect_origin_y_percent between 0 and 100);

-- MIGRATION - a lancer une seule fois si ton projet Supabase a deja
-- chest_settings avec les anciennes colonnes uniques (sans distinction par
-- palier, ni le chevauchement attente->ouverture) : ajoute les nouvelles
-- colonnes (copie les anciennes valeurs comme point de depart pour chaque
-- palier), puis retire les anciennes colonnes.
-- alter table chest_settings add column if not exists waiting_opening_overlap_ms integer not null default 200 check (waiting_opening_overlap_ms between 0 and 5000);
-- alter table chest_settings add column if not exists opening_ongoing_overlap_ms_commun integer not null default 200 check (opening_ongoing_overlap_ms_commun between 0 and 5000);
-- alter table chest_settings add column if not exists opening_ongoing_overlap_ms_rare integer not null default 200 check (opening_ongoing_overlap_ms_rare between 0 and 5000);
-- alter table chest_settings add column if not exists opening_ongoing_overlap_ms_epique integer not null default 200 check (opening_ongoing_overlap_ms_epique between 0 and 5000);
-- alter table chest_settings add column if not exists ongoing_ending_overlap_ms_commun integer not null default 200 check (ongoing_ending_overlap_ms_commun between 0 and 5000);
-- alter table chest_settings add column if not exists ongoing_ending_overlap_ms_rare integer not null default 200 check (ongoing_ending_overlap_ms_rare between 0 and 5000);
-- alter table chest_settings add column if not exists ongoing_ending_overlap_ms_epique integer not null default 200 check (ongoing_ending_overlap_ms_epique between 0 and 5000);
-- update chest_settings set
--   opening_ongoing_overlap_ms_commun = opening_ongoing_overlap_ms,
--   opening_ongoing_overlap_ms_rare = opening_ongoing_overlap_ms,
--   opening_ongoing_overlap_ms_epique = opening_ongoing_overlap_ms,
--   ongoing_ending_overlap_ms_commun = ongoing_ending_overlap_ms,
--   ongoing_ending_overlap_ms_rare = ongoing_ending_overlap_ms,
--   ongoing_ending_overlap_ms_epique = ongoing_ending_overlap_ms
-- where id = 1;
-- alter table chest_settings drop column if exists opening_ongoing_overlap_ms;
-- alter table chest_settings drop column if exists ongoing_ending_overlap_ms;

alter table chest_settings enable row level security;

create policy "chest_settings_public_read"
  on chest_settings
  for select
  using (true);

-- Ecriture : AUCUNE policy insert/update publique - voir update-chest-settings.

alter publication supabase_realtime add table chest_settings;
