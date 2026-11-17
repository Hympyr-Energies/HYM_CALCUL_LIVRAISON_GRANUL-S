// Fonction Edge « granules-state » : passerelle entre le cockpit granulés (navigateur) et la table public.granules_state.
// La clé serveur Supabase ne quitte jamais cette fonction : elle est fournie par l'environnement (SUPABASE_SERVICE_ROLE_KEY).
// Le navigateur envoie le mot de passe d'équipe ; la fonction le vérifie (PBKDF2-SHA256 salé, même empreinte que l'outil Streamlit)
// avant toute lecture ou écriture. Déploiement sans vérification JWT : le mot de passe est le seul accès (voir README).
//
// Contrat (POST, JSON) :
//   { action: "load", password }                                    -> 200 { payload, revision, updated_at }
//   { action: "save", password, payload, expected_revision }        -> 200 { revision }   | 409 { code: "conflit" }
//   mot de passe refusé -> 401 ; requête invalide -> 400 ; base injoignable -> 502.

const SEL = Deno.env.get("GRANULES_ACCES_SEL") ?? "272ff44ec0272c516b1a516bbc76abe0";
const EMPREINTE = Deno.env.get("GRANULES_ACCES_EMPREINTE") ?? "37a0061896b698156997ea56804eb3cd3d8f64756816db28419bcdb51e28f70d";
const ITERATIONS = Number(Deno.env.get("GRANULES_ACCES_ITERATIONS") ?? "600000");
const ORIGINE = Deno.env.get("GRANULES_ALLOWED_ORIGIN") ?? "*";       // ex. https://quentindebrie-code.github.io
const TAILLE_MAX = 6 * 1024 * 1024;

const entetes = (extra: Record<string, string> = {}) => ({
  "Access-Control-Allow-Origin": ORIGINE,
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "no-store",
  ...extra,
});
const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: entetes({ "Content-Type": "application/json" }) });

const hex2bytes = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
const bytes2hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function motDePasseValide(saisi: string): Promise<boolean> {
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(saisi), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: hex2bytes(SEL), iterations: ITERATIONS, hash: "SHA-256" }, cle, 256);
  const a = bytes2hex(bits), b = EMPREINTE;
  if (a.length !== b.length) return false;
  let diff = 0;                                                         // comparaison à durée constante
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function payloadValide(p: any): boolean {
  return p && typeof p === "object" && p.schema_version === 1 && p.grille && typeof p.grille === "object" && Array.isArray(p.historique);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: entetes() });
  if (req.method !== "POST") return reponse({ code: "methode", message: "POST uniquement." }, 405);

  const brut = await req.text();
  if (brut.length > TAILLE_MAX) return reponse({ code: "taille", message: "Document trop volumineux." }, 413);
  let c: any;
  try { c = JSON.parse(brut); } catch { return reponse({ code: "requete", message: "JSON invalide." }, 400); }
  if (typeof c?.password !== "string" || !c.password) return reponse({ code: "auth", message: "Mot de passe requis." }, 401);

  if (!(await motDePasseValide(c.password))) {
    await new Promise((r) => setTimeout(r, 1000));                      // freine les essais répétés
    return reponse({ code: "auth", message: "Mot de passe refusé." }, 401);
  }

  const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "") + "/rest/v1";
  const cleServeur = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url.startsWith("https://") || !cleServeur) return reponse({ code: "config", message: "Configuration serveur incomplète." }, 500);
  const h = { apikey: cleServeur, Authorization: "Bearer " + cleServeur, "Content-Type": "application/json" };

  try {
    if (c.action === "load") {
      const r = await fetch(`${url}/granules_state?id=eq.cockpit&select=payload,revision,updated_at&limit=1`, { headers: h, redirect: "manual" });
      if (!r.ok) return reponse({ code: "base", message: "Lecture impossible (HTTP " + r.status + ")." }, 502);
      const lignes = await r.json();
      if (!Array.isArray(lignes) || lignes.length !== 1) return reponse({ code: "base", message: "La ligne cockpit est absente : appliquez la migration Supabase." }, 502);
      return reponse(lignes[0]);
    }
    if (c.action === "save") {
      if (!payloadValide(c.payload) || !Number.isInteger(c.expected_revision) || c.expected_revision < 0) return reponse({ code: "requete", message: "Document ou révision invalide." }, 400);
      const r = await fetch(`${url}/rpc/granules_save_state`, { method: "POST", headers: h, redirect: "manual", body: JSON.stringify({ p_payload: c.payload, p_expected_revision: c.expected_revision }) });
      if (r.status === 409) return reponse({ code: "conflit", message: "Une autre session a enregistré des modifications." }, 409);
      if (!r.ok) return reponse({ code: "base", message: "Écriture impossible (HTTP " + r.status + ")." }, 502);
      const revision = await r.json();
      if (!Number.isInteger(revision)) return reponse({ code: "base", message: "Révision invalide." }, 502);
      return reponse({ revision });
    }
    return reponse({ code: "requete", message: "Action inconnue." }, 400);
  } catch {
    return reponse({ code: "base", message: "Base injoignable." }, 502);
  }
});
