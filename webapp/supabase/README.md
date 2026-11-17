# Base commune : membres Supabase + fonction Edge `granules-state`

L'accès à la base commune se fait avec des **comptes membres** administrés dans Supabase (Authentication) : chacun a son e-mail et son mot de passe, et l'administrateur peut ajouter, suspendre ou supprimer un membre sans toucher au code.

La page ne contient **aucune clé Supabase**. Elle appelle la fonction Edge `granules-state`, qui :

1. connecte le membre auprès de Supabase Auth (e-mail + mot de passe), renouvelle sa session, envoie le lien « mot de passe oublié » ;
2. vérifie à chaque requête le jeton du membre **et** sa présence (actif) dans `public.granules_membres` ;
3. lit / écrit la table `public.granules_state` avec la clé serveur, avec contrôle de révision (`409` si une autre session a enregistré entre-temps) et enregistrement de l'auteur.

> **Pourquoi une fonction plutôt que des appels directs depuis la page ?** Le projet `cmvkijtlkzfwnzipgstc` contient aussi d'autres tables (suivi, appels, historique, fichiers…) dont la sécurité par ligne (RLS) est désactivée : la clé publique du projet donne accès à ces tables. Elle ne doit donc figurer dans aucune page ni dépôt public.

## Mise en place (une seule fois)

1. **Migration SQL** : exécuter `migrations/20261117_granules_membres.sql` (SQL Editor, ou `supabase db push`). Elle crée la table des membres et la fonction d'enregistrement avec auteur ; elle ne modifie ni les autres tables ni `granules_save_state` (toujours utilisée par l'outil Streamlit).
2. **Déployer la fonction** (CLI Supabase, depuis `webapp/`) :
   ```bash
   supabase functions deploy granules-state --project-ref cmvkijtlkzfwnzipgstc --no-verify-jwt
   supabase secrets set GRANULES_ALLOWED_ORIGIN=https://quentindebrie-code.github.io GRANULES_SITE_URL=https://quentindebrie-code.github.io/HYM_CALCUL_LIVRAISON_GRANUL-S/webapp/ --project-ref cmvkijtlkzfwnzipgstc
   ```
   `--no-verify-jwt` : la fonction fait elle-même la vérification (jeton du membre + liste des membres). `GRANULES_SITE_URL` est l'adresse de la webapp (lien des e-mails de réinitialisation).
3. **Authentication** (tableau de bord) : *Sign In / Providers* → désactiver **Allow new users to sign up** (seul l'administrateur crée des comptes) ; *URL Configuration* → *Site URL* = l'adresse de la webapp.
4. **Reconstruire la page** avec l'adresse de la fonction :
   ```bash
   python3 build.py --sync-url https://cmvkijtlkzfwnzipgstc.supabase.co/functions/v1/granules-state
   ```

## Administrer les membres (dans Supabase)

| Action | Où |
|---|---|
| **Ajouter un membre** | 1) *Table Editor* → `granules_membres` → ajouter une ligne (`email`, `nom`) ; 2) *Authentication → Users → Add user → Create new user* : e-mail + mot de passe, **Auto Confirm User** coché. |
| **Changer / réinitialiser un mot de passe** | *Authentication → Users* → le compte → *Send password recovery* : le membre reçoit un lien et choisit son mot de passe dans l'application. Un membre peut aussi le changer lui-même (Paramètres → *Changer mon mot de passe*). |
| **Suspendre un membre** | `granules_membres` : `actif` = false (réversible). |
| **Retirer un membre** | Supprimer la ligne de `granules_membres` et le compte dans *Authentication → Users*. |

L'e-mail du compte et celui de `granules_membres` doivent être identiques (la table les met en minuscules).

## Contrat de la fonction

`POST https://<projet>.supabase.co/functions/v1/granules-state` (JSON ; jeton du membre dans `Authorization: Bearer …` sauf `login`, `refresh`, `recover`)

| Requête | Réponse |
|---|---|
| `{ action: "login", email, password }` | `200 { access_token, refresh_token, expires_in, email, nom }` · `401` (même message si l'e-mail est inconnu ou non membre) |
| `{ action: "refresh", refresh_token }` | `200` comme ci-dessus · `401` |
| `{ action: "recover", email }` | `200` dans tous les cas (ne révèle pas si le compte existe) |
| `{ action: "password", password }` | `200 { ok: true }` · `400` (moins de 10 caractères) |
| `{ action: "load" }` | `200 { payload, revision, updated_at, updated_by_email }` |
| `{ action: "save", payload, expected_revision }` | `200 { revision }` · `409 { code: "conflit" }` |

## Tester sans Supabase

```bash
node ../tests/serveur_simule.js 8779      # même contrat, en mémoire (alice@exemple.fr / secret-alice-123)
python3 ../build.py --sync-url http://127.0.0.1:8779/ --out index.cloud-test.html
```
