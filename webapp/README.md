# Cockpit granulés — webapp HTML (Hympyr Énergies)

Refonte de l'ancien outil Streamlit (`app_gran.py`, retiré le 24/11/2026) en **application web statique** : un seul fichier, `index.html`, sans serveur Python.
Mêmes fonctionnalités, mêmes règles de calcul (vérifiées par des tests de parité avec le code Python d'origine), nouveau design Hympyr : verre, fond photo-granulés, effet magnétique des boutons, onglets en barre basse sur mobile, transitions douces.

## Utiliser l'application

- **Ouvrir `index.html`** dans un navigateur récent (Chrome, Edge, Safari, Firefox) ou le **publier tel quel** sur n'importe quel hébergement statique (GitHub Pages, Netlify, serveur interne…). Il n'y a rien à installer.
- **Connexion par compte membre** (base commune) : chaque membre a son propre compte Supabase (e-mail + mot de passe), créé et administré dans Supabase par l'administrateur. Plus de mot de passe d'équipe partagé ni d'empreinte dans le code. En mode local (sans base commune), aucune connexion : les données ne quittent pas l'appareil.
- **Connexion internet** requise pour : la recherche d'adresse (API Adresse de l'État), l'itinéraire routier (OSRM), la police Poppins, et l'export/import Excel et PDF (bibliothèques chargées à la demande depuis cdnjs). Sans réponse du routeur, le simulateur bascule sur une estimation orthodromique ×1,30, signalée comme telle ; le kilométrage peut toujours être forcé à la main.

### Où sont enregistrées les données ?

| Mode | Quand | Comportement |
|---|---|---|
| **Mode local** (par défaut) | `SYNC_URL` vide | Grille et historique conservés dans le navigateur de l'appareil. Pastille « Mode local » dans l'en-tête. Exporter régulièrement le classeur Excel ou la sauvegarde `.json` (Paramètres). |
| **Base commune** | `SYNC_URL` renseigné | Même base Supabase que la version Streamlit, partagée par toute l'équipe : chargement au démarrage, sauvegarde à chaque validation, détection des modifications concurrentes (révision), repli local si la base est injoignable. Voir `supabase/README.md`. |

**Connexion unique** : la page n'a plus d'écran de connexion. Elle lit la session supabase-js ouverte au portail Hympyr (même origine, même clé de stockage) ; sans session, elle renvoie au portail avec `?retour=` et y revient une fois connecté. « Se déconnecter » ferme la session de tous les outils. La page contient seulement la clé **publishable** (publique par conception) ; les données passent par une fonction Edge qui détient les clés, valide le jeton du membre, vérifie qu'il figure dans la liste des membres (`granules_membres`, actif) puis lit ou écrit. Chaque sauvegarde enregistre qui l'a faite (« Dernière sauvegarde : … » dans les Paramètres).

## Les quatre onglets

1. **Simulateur** — code postal + ville → distance routière réelle depuis le dépôt → palettes (par marque) ou vrac (par palier) → devis HT/TTC, TVA, coût rendu à la tonne, récapitulatif à copier. Options de trajet : aller-retour, kilométrage forcé.
2. **Grille tarifaire** — tableaux éditables en **TTC ou HT** avec conversion en direct, zones de livraison, franchise et prix au km du vrac, date d'effet, taux de TVA. Chargement d'un classeur exporté (par cet outil **ou par l'outil Streamlit**), export Excel et PDF, archivage dans l'historique. Une ligne non modifiée garde sa paire HT/TTC d'origine : aucune dérive d'un centime au changement de base.
3. **Données** — import de grilles `.xlsx` / `.csv` (colonnes reconnues par alias, nombres au format français), saisie d'un relevé concurrent, historique filtrable, contrôle de cohérence des taux de TVA, suppression avec confirmation.
4. **Analyse** — matrice des prix (carte de chaleur), positionnement (indice base 100, rang), évolution, dégressivité vrac, volatilité, en HT ou TTC ; rapport PDF et classeur Excel complet.

## Reprise des données de l'outil Streamlit

- **Base Supabase déjà alimentée** : activer le mode « base commune » (voir plus bas) — le document `schema_version: 1` est relu tel quel.
- **Classeur Excel exporté par Streamlit** : onglet « Grille tarifaire » → *Charger un classeur* (grille et/ou historique). Les deux outils lisent et écrivent la même disposition de feuilles.

## Activer la base commune

1. Appliquer la migration SQL et déployer la fonction `supabase/functions/granules-state`, créer les membres (instructions dans `supabase/README.md`).
2. Reconstruire la page avec l'adresse de la fonction :
   ```bash
   python3 build.py --sync-url https://VOTRE-PROJET.supabase.co/functions/v1/granules-state
   ```
   (ou éditer `window.HYM_CONFIG = { "SYNC_URL": "…" }` en tête de `index.html`).

## Développement

```
src/logique.js     logique métier pure (port fidèle de la « logique pure » de app_gran.py)
src/core.js        outils, icônes, stockage + synchronisation, accès, onglets, aimant des boutons
src/simulateur.js  src/grille.js  src/donnees.js  src/analyse.js  src/exports.js  src/main.js
src/styles.css     feuille de style (px de maquette → calc(var(--k)*N), seules unités : vw, vh, %)
build.py           assemble index.html (CSS converti, JS, logos et fond intégrés)
tests/             parité Python ↔ JavaScript
supabase/          fonction Edge (passerelle sécurisée vers la table granules_state)
```

```bash
python3 build.py                                   # génère index.html
node tests/parite.test.js                          # 38 groupes de tests : arrondis, TVA, zones, vrac, historique, analyses, import, classeur…
```

La logique est identique au Python, y compris l'arrondi (égalités exactes arrondies au pair, comme `round()`), le dédoublonnage, les alias d'import et la relecture d'un classeur exporté par l'outil d'origine.

## Limites connues

- Les fichiers `.xls` (ancien format) ne sont pas lus : les enregistrer en `.xlsx` ou `.csv`.
- La liste des membres et leurs mots de passe se gèrent dans Supabase (tableau de bord) : pas d'écran d'administration dans l'application.
- L'historique est un document JSON unique (comme dans la version Streamlit) : adapté à l'usage interne ; pour de très gros volumes, prévoir des tables normalisées.
- Taux de TVA de départ (10 % marchandise et livraison) : paramètres de l'outil **à valider par la comptabilité**, comme dans la version d'origine.
