/* Serveur simulé de la fonction « granules-state » (même contrat) pour tester la synchronisation sans Supabase. Usage : node tests/serveur_simule.js [port] */
const http = require('http');
let etat = { payload: null, revision: 0, updated_at: new Date().toISOString() };
const PORT = +process.argv[2] || 8779, MDP = 'mock';
http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.url === '/_etat') { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ revision: etat.revision, historique: etat.payload ? etat.payload.historique.length : null })); }
  if (req.url === '/_bump') { etat.revision++; res.writeHead(200, cors); return res.end('ok'); }
  const c = []; req.on('data', d => c.push(d)); req.on('end', () => {
    const rep = (s, o) => { res.writeHead(s, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    let b; try { b = JSON.parse(Buffer.concat(c).toString()); } catch (e) { return rep(400, { code: 'requete' }); }
    if (b.password !== MDP) return rep(401, { code: 'auth' });
    if (b.action === 'load') return rep(200, etat);
    if (b.action === 'save') { if (b.expected_revision !== etat.revision) return rep(409, { code: 'conflit' }); etat = { payload: b.payload, revision: etat.revision + 1, updated_at: new Date().toISOString() }; return rep(200, { revision: etat.revision }); }
    rep(400, { code: 'requete' });
  });
}).listen(PORT, '127.0.0.1', () => console.log('serveur simulé sur ' + PORT));
