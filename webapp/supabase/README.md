# Base commune : fonction Edge `granules-state`

La webapp ne parle jamais directement à la table Supabase : elle appelle cette fonction, qui

1. vérifie le **mot de passe d'équipe** (PBKDF2-SHA256 salé, même empreinte que l'outil Streamlit) ;
2. lit ou écrit la table `public.granules_state` avec la **clé serveur**, fournie par l'environnement Supabase (`SUPABASE_SERVICE_ROLE_KEY`) et jamais exposée au navigateur ;
3. garde la protection contre les écritures concurrentes (révision attendue → `409` si périmée).

La table et la fonction SQL `granules_save_state` existent déjà (projet `cmvkijtlkzfwnzipgstc`, schéma de référence dans `../../supabase/granules.sql` : **ne pas le ré-exécuter**).

## Déploiement

Avec la CLI Supabase, depuis le dossier `webapp/` :

```bash
supabase functions deploy granules-state --project-ref cmvkijtlkzfwnzipgstc --no-verify-jwt
```

`--no-verify-jwt` : le navigateur n'a pas de jeton Supabase, c'est le mot de passe d'équipe qui protège la fonction.

### Réglages facultatifs (secrets de la fonction)

```bash
supabase secrets set GRANULES_ALLOWED_ORIGIN=https://VOTRE-DOMAINE --project-ref cmvkijtlkzfwnzipgstc
```

| Variable | Rôle | Défaut |
|---|---|---|
| `GRANULES_ALLOWED_ORIGIN` | Origine autorisée (CORS) : l'adresse où la webapp est publiée | `*` |
| `GRANULES_ACCES_SEL`, `GRANULES_ACCES_EMPREINTE`, `GRANULES_ACCES_ITERATIONS` | Autre mot de passe d'équipe (voir la commande indiquée dans le code d'origine pour générer le couple sel / empreinte) | valeurs actuelles de l'outil |

## Contrat

`POST https://<projet>.supabase.co/functions/v1/granules-state` (JSON)

| Requête | Réponse |
|---|---|
| `{ "action": "load", "password": "…" }` | `200 { payload, revision, updated_at }` |
| `{ "action": "save", "password": "…", "payload": {…}, "expected_revision": N }` | `200 { revision }` · `409 { code: "conflit" }` |
| mot de passe absent ou faux | `401` (réponse retardée d'une seconde) |

## Tester sans Supabase

```bash
node ../tests/serveur_simule.js 8779                       # même contrat, en mémoire (mot de passe : mock)
python3 ../build.py --sync-url http://127.0.0.1:8779/ --out index.cloud-test.html
```
