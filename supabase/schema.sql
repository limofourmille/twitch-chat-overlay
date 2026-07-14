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

-- ATTENTION - prototype uniquement : ces deux policies acceptent n'importe
-- quelle ecriture venant de n'importe qui possedant la cle anon (publique
-- par design). La cle anon seule ne prouve pas "je suis bien ce twitch_user_id" :
-- n'importe qui peut ouvrir les devtools et ecrire/ecraser la ligne de
-- quelqu'un d'autre. Avant mise en prod reelle, remplacer ces deux policies
-- par un acces exclusivement via une Supabase Edge Function qui verifie le
-- token Twitch cote serveur (appel a https://api.twitch.tv/helix/users) puis
-- ecrit avec la service_role key - la seule facon de garantir qu'un viewer
-- ne peut modifier que SON PROPRE avatar.
create policy "avatar_customizations_public_insert_PROTOTYPE_ONLY"
  on avatar_customizations
  for insert
  with check (true);

create policy "avatar_customizations_public_update_PROTOTYPE_ONLY"
  on avatar_customizations
  for update
  using (true);

-- MIGRATION - a lancer une seule fois si ton projet existait deja avant
-- l'ajout de la categorie "mandible" (sinon la colonne n'existe pas encore
-- et les sauvegardes echoueront une fois la categorie reactivee) :
-- alter table avatar_customizations add column if not exists mandible smallint;
