/* Serveur simulé de la fonction « granules-state » (même contrat : comptes membres, jetons, révision) pour tester l'application sans Supabase.
   Usage : node tests/serveur_simule.js [port]
   Comptes : alice@exemple.fr / secret-alice-123 (membre) · bob@exemple.fr / secret-bob-1234 (compte Authentication mais non membre)
   Aides de test : GET /_etat · /_bump (un collègue enregistre) · /_expirer (invalide les jetons d'accès) · /_recup (jeton de réinitialisation) */
const http = require('http'), crypto = require('crypto');
const PORT = +process.argv[2] || 8779;
const comptes = { 'alice@exemple.fr': { mdp: 'secret-alice-123', membre: true, nom: 'Alice Martin' }, 'bob@exemple.fr': { mdp: 'secret-bob-1234', membre: false, nom: '' } };
let etat = { payload: null, revision: 0, updated_at: new Date().toISOString(), updated_by_email: null };
const acces = new Map(), rafraichir = new Map(), journal = [];
const jeton = () => crypto.randomBytes(16).toString('hex');
function ouvrir(email) { const a = jeton(), r = jeton(); acces.set(a, email); rafraichir.set(r, email); return { access_token: a, refresh_token: r, expires_in: 3600, email, nom: comptes[email].nom }; }
http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const rep = (s, o) => { res.writeHead(s, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.url === '/_etat') return rep(200, { revision: etat.revision, par: etat.updated_by_email, historique: etat.payload ? etat.payload.historique.length : null, journal });
  if (req.url === '/_bump') { etat.revision++; return rep(200, { ok: 1 }); }
  if (req.url === '/_expirer') { acces.clear(); return rep(200, { ok: 1 }); }
  if (req.url === '/_recup') { const j = jeton(); acces.set(j, 'alice@exemple.fr'); return rep(200, { access_token: j }); }
  const c = []; req.on('data', d => c.push(d)); req.on('end', () => {
    let b; try { b = JSON.parse(Buffer.concat(c).toString()); } catch (e) { return rep(400, { code: 'requete', message: 'JSON invalide.' }); }
    journal.push(b.action);
    if (b.action === 'login') { const k = String(b.email || '').toLowerCase(), u = comptes[k]; if (!u || u.mdp !== b.password || !u.membre) return rep(401, { code: 'auth', message: 'Identifiants incorrects.' }); return rep(200, ouvrir(k)); }
    if (b.action === 'refresh') { const k = rafraichir.get(b.refresh_token); if (!k) return rep(401, { code: 'auth', message: 'Session expirée.' }); rafraichir.delete(b.refresh_token); return rep(200, ouvrir(k)); }
    if (b.action === 'recover') return rep(200, { ok: true });
    const email = acces.get((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!email) return rep(401, { code: 'auth', message: 'Session expirée : reconnectez-vous.' });
    if (!comptes[email].membre) return rep(403, { code: 'membre', message: 'Ce compte n\'est pas autorisé à utiliser le cockpit.' });
    if (b.action === 'password') { if (typeof b.password !== 'string' || b.password.length < 10) return rep(400, { code: 'requete', message: 'Le mot de passe doit contenir au moins 10 caractères.' }); comptes[email].mdp = b.password; return rep(200, { ok: true }); }
    if (b.action === 'load') return rep(200, etat);
    if (b.action === 'save') { if (b.expected_revision !== etat.revision) return rep(409, { code: 'conflit', message: 'Une autre session a enregistré des modifications.' }); etat = { payload: b.payload, revision: etat.revision + 1, updated_at: new Date().toISOString(), updated_by_email: email }; return rep(200, { revision: etat.revision }); }
    rep(400, { code: 'requete', message: 'Action inconnue.' });
  });
}).listen(PORT, '127.0.0.1', () => console.log('serveur simulé sur ' + PORT));
