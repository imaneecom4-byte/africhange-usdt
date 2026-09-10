-- =====================================================================
-- AfriChange USDT — Script d'initialisation Supabase (PostgreSQL)
-- À copier-coller intégralement dans l'éditeur SQL de Supabase
-- =====================================================================

-- Extension nécessaire pour générer des identifiants uniques (UUID)
create extension if not exists "pgcrypto";

-- =====================================================================
-- 1. TABLE ADMINS
-- Comptes administrateurs pouvant se connecter au tableau de bord.
-- Le mot de passe n'est jamais stocké en clair : on stocke un hash bcrypt
-- généré côté serveur (voir server.js / README.md pour la création).
-- =====================================================================
create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  full_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 2. TABLE CONFIG
-- Une seule ligne (singleton) contenant les paramètres modifiables
-- depuis l'admin : taux, adresse USDT de réception, etc.
-- =====================================================================
create table if not exists config (
  id integer primary key default 1,
  taux_achat numeric(10,2) not null default 750.00,      -- FCFA payés par le client pour 1 USDT
  taux_vente numeric(10,2) not null default 730.00,      -- FCFA reçus par le client pour 1 USDT vendu
  marge_beneficiaire numeric(10,2) not null default 20.00, -- marge en FCFA par USDT
  adresse_usdt text not null default '0x5da17b728ab2d61ab273a1844b4ce0db4c545f95',
  reseau_usdt text not null default 'BEP20', -- réseau utilisé pour l'adresse USDT (à ajuster si besoin)
  updated_at timestamptz not null default now(),
  constraint config_singleton check (id = 1)
);

insert into config (id, taux_achat, taux_vente, marge_beneficiaire, adresse_usdt, reseau_usdt)
values (1, 750.00, 730.00, 20.00, '0x5da17b728ab2d61ab273a1844b4ce0db4c545f95', 'BEP20')
on conflict (id) do nothing;

-- =====================================================================
-- 3. TABLE AGENTS
-- Numéros Mobile Money par pays / opérateur, utilisés pour le module ACHAT
-- (le client envoie l'argent à ce numéro).
-- =====================================================================
create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  pays text not null,
  operateur text not null,
  numero text, -- peut être vide si aucun numéro n'est encore configuré
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  unique (pays, operateur)
);

insert into agents (pays, operateur, numero) values
  ('Burkina Faso', 'Orange Money', '+226 67 17 68 85'),
  ('Burkina Faso', 'Moov Money',   '+226 62 51 91 71'),
  ('Côte d''Ivoire', 'Wave',        '+225 01 72 37 95 88'),
  ('Côte d''Ivoire', 'Moov Money',  '+225 01 72 37 95 88'),
  ('Côte d''Ivoire', 'MTN Money',   '+225 05 96 57 65 02'),
  ('Bénin', 'MTN Money',    '+229 01 61 38 29 59'),
  ('Bénin', 'Celtiis',      '+229 01 92 34 79 35'),
  ('Togo', 'Mix Bay Yas',   '+228 71 77 73 57'),
  ('Togo', 'Moov Money',    null)
on conflict (pays, operateur) do nothing;

-- =====================================================================
-- 4. TABLE TRANSACTIONS
-- Chaque achat ou vente d'USDT. Le bénéfice est calculé automatiquement
-- par trigger (voir plus bas) à partir des taux enregistrés dans config.
-- =====================================================================
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('achat', 'vente')), -- achat = client achète USDT, vente = client vend USDT
  statut text not null default 'en_attente' check (statut in ('en_attente', 'valide', 'rejete')),

  -- Infos client (communes)
  nom text not null,
  prenom text,
  telephone text not null,

  -- Spécifique ACHAT (mobile money -> USDT)
  pays text,
  operateur text,
  agent_numero text,          -- numéro affiché au client au moment du paiement
  wallet_usdt_reception text, -- adresse du client qui recevra les USDT

  -- Spécifique VENTE (USDT -> mobile money)
  numero_reception text,      -- numéro mobile money qui recevra les FCFA
  operateur_reception text,
  txid_usdt text,             -- hash / TxID de la transaction crypto envoyée par le client

  -- Montants
  montant_usdt numeric(18,6) not null,
  montant_fcfa numeric(14,2),        -- calculé automatiquement par trigger
  taux_applique numeric(10,2),       -- taux figé au moment de la transaction
  benefice_fcfa numeric(14,2),       -- calculé automatiquement par trigger

  -- Preuve (capture d'écran ou reçu) stockée dans Supabase Storage
  preuve_url text,

  note_admin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  validated_at timestamptz
);

-- Index pour accélérer les filtres fréquents du dashboard admin
create index if not exists idx_transactions_statut on transactions (statut);
create index if not exists idx_transactions_type on transactions (type);
create index if not exists idx_transactions_created_at on transactions (created_at desc);
create index if not exists idx_transactions_telephone on transactions (telephone);

-- =====================================================================
-- 5. TRIGGERS
-- =====================================================================

-- 5.a Calcul automatique du montant en FCFA, du taux appliqué et du bénéfice
-- au moment de la création d'une transaction.
create or replace function calculer_montants_transaction()
returns trigger as $$
declare
  cfg record;
begin
  select * into cfg from config where id = 1;

  if new.type = 'achat' then
    new.taux_applique := cfg.taux_achat;
    new.montant_fcfa := round(new.montant_usdt * cfg.taux_achat, 2);
  else
    new.taux_applique := cfg.taux_vente;
    new.montant_fcfa := round(new.montant_usdt * cfg.taux_vente, 2);
  end if;

  new.benefice_fcfa := round(new.montant_usdt * cfg.marge_beneficiaire, 2);

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_calculer_montants on transactions;
create trigger trg_calculer_montants
  before insert on transactions
  for each row
  execute function calculer_montants_transaction();

-- 5.b Mise à jour automatique de updated_at et validated_at
create or replace function maj_transaction_timestamps()
returns trigger as $$
begin
  new.updated_at := now();
  if new.statut = 'valide' and old.statut is distinct from 'valide' then
    new.validated_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_maj_timestamps on transactions;
create trigger trg_maj_timestamps
  before update on transactions
  for each row
  execute function maj_transaction_timestamps();

-- 5.c Mise à jour automatique de updated_at sur la config
create or replace function maj_config_timestamp()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_maj_config on config;
create trigger trg_maj_config
  before update on config
  for each row
  execute function maj_config_timestamp();

-- =====================================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- Le formulaire client utilise la clé "anon" : il peut uniquement CRÉER
-- une transaction et LIRE les agents / la config publique (taux, adresse).
-- Toute lecture/modification des transactions existantes, et toute
-- modification de la config/agents, nécessite le rôle "service_role"
-- (utilisé uniquement côté serveur, jamais exposé au navigateur).
-- =====================================================================

alter table admins enable row level security;
alter table config enable row level security;
alter table agents enable row level security;
alter table transactions enable row level security;

-- ADMINS : aucun accès public. Seul service_role (backend) peut lire/écrire.
create policy "admins_service_role_only"
  on admins for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- CONFIG : lecture publique (le client doit voir les taux et l'adresse USDT)
create policy "config_lecture_publique"
  on config for select
  using (true);

-- CONFIG : écriture réservée au backend (admin)
create policy "config_ecriture_service_role"
  on config for update
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- AGENTS : lecture publique (le client doit voir les numéros disponibles)
create policy "agents_lecture_publique"
  on agents for select
  using (actif = true);

-- AGENTS : écriture réservée au backend (admin)
create policy "agents_ecriture_service_role"
  on agents for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- TRANSACTIONS : création publique autorisée (un client peut soumettre
-- une nouvelle transaction depuis le formulaire), mais pas de lecture
-- publique (pour ne pas exposer les données des autres clients).
create policy "transactions_creation_publique"
  on transactions for insert
  with check (true);

-- TRANSACTIONS : lecture/modification réservées au backend (admin)
create policy "transactions_lecture_service_role"
  on transactions for select
  using (auth.role() = 'service_role');

create policy "transactions_maj_service_role"
  on transactions for update
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- =====================================================================
-- 7. VUE UTILITAIRE : bénéfices totaux (utilisée par le dashboard admin)
-- =====================================================================
create or replace view vue_benefices as
select
  count(*) filter (where statut = 'valide') as transactions_validees,
  coalesce(sum(benefice_fcfa) filter (where statut = 'valide'), 0) as benefice_total_fcfa,
  coalesce(sum(montant_usdt) filter (where statut = 'valide' and type = 'achat'), 0) as volume_achat_usdt,
  coalesce(sum(montant_usdt) filter (where statut = 'valide' and type = 'vente'), 0) as volume_vente_usdt
from transactions;

-- =====================================================================
-- FIN DU SCRIPT — vérifiez dans "Table Editor" que les 4 tables et
-- leurs données par défaut sont bien présentes.
-- =====================================================================
