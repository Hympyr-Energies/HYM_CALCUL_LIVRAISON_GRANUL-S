// Fonction Edge « granules-state » : passerelle entre le cockpit granulés (navigateur) et Supabase.
//
// - Les membres sont des comptes Supabase Authentication (mot de passe administré dans Supabase) listés dans public.granules_membres.
// - La connexion se fait au portail Hympyr (session supabase-js commune) ; la page envoie le jeton de cette session. Les données
//   passent par cette fonction, qui détient les clés (SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY, fournies par l'environnement).
//   Les actions login, refresh et recover restent disponibles mais ne sont plus utilisées par la page.
// - Chaque requête de données porte le jeton du membre ; la fonction le valide auprès de Supabase Auth, vérifie l'appartenance
//   à granules_membres (actif), puis lit/écrit la table avec la clé serveur. Écritures protégées par une révision (409 si périmée).
//
// Contrat (POST, JSON ; jeton dans l'en-tête Authorization: Bearer … pour tout sauf login, refresh et recover) :
//   { action: "login", email, password }            -> 200 { access_token, refresh_token, expires_in, email, nom } | 401
//   { action: "refresh", refresh_token }             -> 200 { access_token, refresh_token, expires_in, email, nom } | 401
//   { action: "recover", email }                     -> 200 (toujours : ne révèle pas si le compte existe)
//   { action: "password", password }                 -> 200 { ok: true }      (change le mot de passe du membre connecté)
//   { action: "load" }                               -> 200 { payload, revision, updated_at, updated_by_email }
//   { action: "save", payload, expected_revision }   -> 200 { revision } | 409 { code: "conflit" }
//   refus d'accès -> 401 (identifiants ou jeton) / 403 (compte non membre) ; requête invalide -> 400 ; base injoignable -> 502.

// Origines autorisées : celle des outils Hympyr (GitHub Pages de l'organisation Hympyr-Energies), plus celles de la variable
// GRANULES_ALLOWED_ORIGIN (liste séparée par des virgules). L'en-tête CORS renvoie l'origine de la requête si elle est autorisée.
const ORIGINE = "https://hympyr-energies.github.io";
const ORIGINES = new Set([ORIGINE, ...(Deno.env.get("GRANULES_ALLOWED_ORIGIN") ?? "").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean)]);
const origineDe = (req: Request) => { const o = req.headers.get("origin") ?? ""; return ORIGINES.has(o) ? o : ORIGINE; };
const SITE_URL = Deno.env.get("GRANULES_SITE_URL") ?? "https://hympyr-energies.github.io/portail/";   // adresse de la webapp (lien des e-mails « mot de passe oublié »)
const TAILLE_MAX = 6 * 1024 * 1024;

const ENV = {
  url: (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, ""),
  anon: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  serveur: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
};

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
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const auth = (chemin: string, init: RequestInit = {}, jeton?: string) =>
  fetch(`${ENV.url}/auth/v1${chemin}`, {
    ...init, redirect: "manual",
    headers: { apikey: ENV.anon, "Content-Type": "application/json", ...(jeton ? { Authorization: "Bearer " + jeton } : {}), ...(init.headers ?? {}) },
  });
const rest = (chemin: string, init: RequestInit = {}) =>
  fetch(`${ENV.url}/rest/v1${chemin}`, {
    ...init, redirect: "manual",
    headers: { apikey: ENV.serveur, Authorization: "Bearer " + ENV.serveur, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

/** Le compte est-il un membre actif ? -> { email, nom } ou null. */
async function membre(email: string | undefined): Promise<{ email: string; nom: string } | null> {
  if (!email) return null;
  const r = await rest(`/granules_membres?email=eq.${encodeURIComponent(email.toLowerCase())}&actif=eq.true&select=email,nom&limit=1`);
  if (!r.ok) throw new Error("membres");
  const l = await r.json();
  return Array.isArray(l) && l.length === 1 ? l[0] : null;
}

/** Valide le jeton auprès de Supabase Auth puis l'appartenance. -> membre ou Response d'erreur. */
async function authentifier(req: Request): Promise<{ email: string; nom: string } | Response> {
  const jeton = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jeton) return reponse({ code: "auth", message: "Connexion requise." }, 401);
  const r = await auth("/user", { method: "GET" }, jeton);
  if (!r.ok) return reponse({ code: "auth", message: "Session expirée : reconnectez-vous." }, 401);
  const u = await r.json();
  if (!u?.email || !u?.email_confirmed_at && !u?.confirmed_at) return reponse({ code: "auth", message: "Compte non confirmé." }, 401);
  const m = await membre(u.email);
  if (!m) return reponse({ code: "membre", message: "Ce compte n'est pas autorisé à utiliser le cockpit." }, 403);
  return m;
}

const session = (s: any, m: { email: string; nom: string }) => ({ access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in, email: m.email, nom: m.nom });

function payloadValide(p: any): boolean {
  return p && typeof p === "object" && p.schema_version === 1 && p.grille && typeof p.grille === "object" && Array.isArray(p.historique);
}

async function traiter(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: entetes() });
  if (req.method !== "POST") return reponse({ code: "methode", message: "POST uniquement." }, 405);
  if (!ENV.url.startsWith("https://") || !ENV.anon || !ENV.serveur) return reponse({ code: "config", message: "Configuration serveur incomplète." }, 500);

  const brut = await req.text();
  if (brut.length > TAILLE_MAX) return reponse({ code: "taille", message: "Document trop volumineux." }, 413);
  let c: any;
  try { c = JSON.parse(brut); } catch { return reponse({ code: "requete", message: "JSON invalide." }, 400); }

  try {
    /* ---------- accès sans jeton ---------- */
    if (c.action === "login") {
      if (typeof c.email !== "string" || typeof c.password !== "string" || !c.email || !c.password) return reponse({ code: "requete", message: "E-mail et mot de passe requis." }, 400);
      const r = await auth("/token?grant_type=password", { method: "POST", body: JSON.stringify({ email: c.email.trim().toLowerCase(), password: c.password }) });
      const s = r.ok ? await r.json() : null;
      const m = s ? await membre(s.user?.email) : null;
      if (!s || !m) { await pause(1000); return reponse({ code: "auth", message: "Identifiants incorrects." }, 401); }   // même message : on ne révèle pas si le compte existe
      return reponse(session(s, m));
    }
    if (c.action === "refresh") {
      if (typeof c.refresh_token !== "string" || !c.refresh_token) return reponse({ code: "auth", message: "Session expirée." }, 401);
      const r = await auth("/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: c.refresh_token }) });
      const s = r.ok ? await r.json() : null;
      const m = s ? await membre(s.user?.email) : null;
      if (!s || !m) return reponse({ code: "auth", message: "Session expirée : reconnectez-vous." }, 401);
      return reponse(session(s, m));
    }
    if (c.action === "recover") {
      if (typeof c.email === "string" && c.email.includes("@")) {
        const m = await membre(c.email.trim().toLowerCase());
        if (m) {
          const q = SITE_URL ? "?redirect_to=" + encodeURIComponent(SITE_URL) : "";
          await auth("/recover" + q, { method: "POST", body: JSON.stringify({ email: m.email }) });
        } else await pause(400);
      }
      return reponse({ ok: true });                                      // réponse identique dans tous les cas
    }

    /* ---------- accès avec jeton de membre ---------- */
    const m = await authentifier(req);
    if (m instanceof Response) return m;
    const jeton = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

    if (c.action === "password") {
      if (typeof c.password !== "string" || c.password.length < 10) return reponse({ code: "requete", message: "Le mot de passe doit contenir au moins 10 caractères." }, 400);
      const r = await auth("/user", { method: "PUT", body: JSON.stringify({ password: c.password }) }, jeton);
      if (!r.ok) { const e = await r.json().catch(() => ({})); return reponse({ code: "mdp", message: e?.msg ?? e?.message ?? "Mot de passe refusé par Supabase." }, 400); }
      return reponse({ ok: true });
    }
    if (c.action === "load") {
      const r = await rest("/granules_state?id=eq.cockpit&select=payload,revision,updated_at,updated_by_email&limit=1");
      if (!r.ok) return reponse({ code: "base", message: "Lecture impossible (HTTP " + r.status + ")." }, 502);
      const lignes = await r.json();
      if (!Array.isArray(lignes) || lignes.length !== 1) return reponse({ code: "base", message: "La ligne cockpit est absente : appliquez la migration Supabase." }, 502);
      return reponse(lignes[0]);
    }
    if (c.action === "save") {
      if (!payloadValide(c.payload) || !Number.isInteger(c.expected_revision) || c.expected_revision < 0) return reponse({ code: "requete", message: "Document ou révision invalide." }, 400);
      const r = await rest("/rpc/granules_enregistrer", { method: "POST", body: JSON.stringify({ p_payload: c.payload, p_expected_revision: c.expected_revision, p_auteur: m.email }) });
      if (r.status === 409) return reponse({ code: "conflit", message: "Une autre session a enregistré des modifications." }, 409);
      if (!r.ok) return reponse({ code: "base", message: "Écriture impossible (HTTP " + r.status + ")." }, 502);
      const revision = await r.json();
      if (!Number.isInteger(revision)) return reponse({ code: "base", message: "Révision invalide." }, 502);
      return reponse({ revision });
    }
    return reponse({ code: "requete", message: "Action inconnue." }, 400);
  } catch {
    return reponse({ code: "base", message: "Service injoignable." }, 502);
  }
}

Deno.serve(async (req) => {
  const r = await traiter(req);
  r.headers.set("Access-Control-Allow-Origin", origineDe(req));
  return r;
});
