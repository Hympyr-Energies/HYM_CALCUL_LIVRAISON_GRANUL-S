-- Cockpit granulés : accès par membres (comptes Supabase Authentication) au lieu d'un mot de passe d'équipe unique.
-- À appliquer UNE fois (SQL Editor ou `supabase db push`). Ne modifie ni les autres tables du projet, ni la fonction granules_save_state
-- utilisée par l'ancien outil Streamlit (elle reste en place).
--
-- Fonctionnement : un membre = un compte Authentication (mot de passe administré dans Supabase) ET une ligne actif = true dans
-- public.granules_membres. La fonction Edge « granules-state » vérifie les deux ; la page ne contient aucune clé Supabase.

-- 1. Liste des membres (lecture/écriture réservées à l'administrateur via le tableau de bord, et à la fonction Edge)
create table if not exists public.granules_membres (
    email    text primary key,
    nom      text not null default '',
    actif    boolean not null default true,
    cree_le  timestamptz not null default now()
);

create or replace function public.granules_membres_normaliser()
returns trigger language plpgsql set search_path = '' as $$
begin
    new.email := lower(btrim(new.email));
    if position('@' in new.email) < 2 then
        raise exception 'Adresse e-mail invalide : %', new.email using errcode = '22023';
    end if;
    return new;
end;
$$;

drop trigger if exists granules_membres_normaliser on public.granules_membres;
create trigger granules_membres_normaliser before insert or update on public.granules_membres
    for each row execute function public.granules_membres_normaliser();

alter table public.granules_membres enable row level security;
revoke all on public.granules_membres from public, anon, authenticated;
grant select on public.granules_membres to service_role;
comment on table public.granules_membres is 'Membres autorisés du cockpit granulés (e-mail du compte Supabase Authentication). Accès serveur uniquement.';

-- 2. Qui a enregistré la dernière version
alter table public.granules_state add column if not exists updated_by_email text;

-- 3. Enregistrement avec auteur (même contrôle de révision que granules_save_state)
create or replace function public.granules_enregistrer(p_payload jsonb, p_expected_revision bigint, p_auteur text)
returns bigint
language plpgsql security invoker
set search_path = ''
as $$
declare v_revision bigint;
begin
    if p_payload is null then
        raise exception 'Payload required' using errcode = '22023';
    end if;
    update public.granules_state
       set payload = p_payload, revision = revision + 1, updated_at = clock_timestamp(), updated_by_email = left(coalesce(p_auteur, ''), 254)
     where id = 'cockpit' and revision = p_expected_revision
     returning revision into v_revision;
    if not found then
        raise sqlstate 'PT409' using message = 'Concurrent update: reload before saving';
    end if;
    return v_revision;
end;
$$;
revoke all on function public.granules_enregistrer(jsonb, bigint, text) from public, anon, authenticated;
grant execute on function public.granules_enregistrer(jsonb, bigint, text) to service_role;

-- 4. Ajouter un membre (exemple, à adapter) :
--    insert into public.granules_membres (email, nom) values ('prenom.nom@exemple.fr', 'Prénom Nom');
--    Puis créer le compte dans Authentication > Users > Add user (e-mail + mot de passe, « Auto Confirm User » coché).
