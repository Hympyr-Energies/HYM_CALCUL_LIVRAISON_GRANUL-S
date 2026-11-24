# Cockpit granulés — Hympyr Énergies

Simulateur de prix HT/TTC et de livraison, grille tarifaire éditable et analyse de l'historique des prix. L'outil est une application web statique (`webapp/index.html`), publiée sur GitHub Pages et branchée sur Supabase par la fonction Edge `granules-state`.

- Adresse : https://hympyr-energies.github.io/HYM_CALCUL_LIVRAISON_GRANUL-S/webapp/
- Connexion : par le portail Hympyr (https://hympyr-energies.github.io/portail/), une seule connexion pour tous les outils.
- Documentation technique : [webapp/README.md](webapp/README.md) ; base et fonction Edge : [webapp/supabase/README.md](webapp/supabase/README.md).
- Schéma de la table `granules_state` : `supabase/granules.sql` (déjà installé, ne pas réexécuter).

L'ancienne version Streamlit (`app_gran.py`, `granules_store.py`) a été retirée le 24/11/2026. Elle reste consultable dans l'historique Git.
