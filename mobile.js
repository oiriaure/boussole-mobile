// ---------- Boussole sur téléphone (3.18 : dashboard refait) : affiche ce que l’ordinateur analyse ; en Wi-Fi, on peut aussi décider en un clic
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nb = (v, d = 2) => (v == null || !isFinite(v) ? '–' : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (v, d = 2) => (v == null || !isFinite(v) ? '–' : (v >= 0 ? '+' : '−') + nb(Math.abs(v), d) + ' %');
const sens = (v) => (v >= 0 ? 'up' : 'down');
const store = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const set = (el, html) => { if (typeof el === 'string') el = $(el); if (el && el._h !== html) { el._h = html; el.innerHTML = html; } };
const ilya = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `il y a ${Math.max(1, s)} s` : s < 3600 ? `il y a ${Math.round(s / 60)} min` : `il y a ${Math.round(s / 3600)} h`; };
const heureC = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

// ---------- Connexion à l’ordinateur : le QR code ouvre cette page ; une fois épinglée, on tape le code à 6 chiffres affiché sur l’ordinateur.
// Le téléphone reçoit alors sa propre clé d’accès, gardée dans l’app épinglée.
try { localStorage.removeItem('jeton'); } catch {} // ancien système (3.4)
let JETON = store('appareil', '');
const S = { e: store('dernier', null), recu: 0, erreurs: 0, onglet: store('onglet3', 'trader'), faits: {}, ouverts: {}, filtre: 'tous', id: store('gid', 'spx'), tf: 'j', chart: null };
const EPINGLEE = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ---------- Mode « partout » (3.9, comme l’app Révisions) : la page est sur GitHub Pages, les données dans le dépôt privé boussole-donnees.
// Le QR code de l’ordinateur ouvre …/boussole-mobile/#a=<code> : le code (dépôt + jeton en LECTURE SEULE) est gardé sur le téléphone.
// On le laisse dans l’adresse tant que la page n’est pas épinglée : l’icône de l’écran d’accueil l’emporte avec elle.
const DISTANT = /\.github\.io$/.test(location.hostname) || /[?&]distant\b/.test(location.search);
function decoderActivation(s) {
  try {
    const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));
    const j = JSON.parse(decodeURIComponent(Array.from(b, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
    return j && /^[\w.-]+\/[\w.-]+$/.test(j.d) && /^(github_pat_|ghp_)\w{20,}$/.test(j.t) ? { d: j.d, t: j.t } : null;
  } catch { return null; }
}
let ACCES = DISTANT ? store('acces', null) : null, DEPUIS_LIEN = false;
if (DISTANT) {
  const m = location.hash.match(/[#&]a=([A-Za-z0-9_-]+)/);
  if (m) { const k = decoderActivation(m[1]); if (k) { ACCES = k; save('acces', k); DEPUIS_LIEN = true; } }
  if (!DEPUIS_LIEN || EPINGLEE || store('ici', false)) { if (location.hash) history.replaceState(null, '', location.pathname); } // le code ne reste pas affiché
}
if (DISTANT) addEventListener('hashchange', () => { if (/[#&]a=/.test(location.hash)) location.reload(); }); // nouveau code reçu alors que la page était ouverte
const attendEpinglage = () => DISTANT && DEPUIS_LIEN && !EPINGLEE && !store('ici', false);
async function lireGH(chemin) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(`${store('ghapi', null) || 'https://api.github.com'}/repos/${ACCES.d}/contents/${chemin}?ref=main&t=${Date.now()}`, { cache: 'no-store', signal: ctl.signal,
      headers: { Authorization: 'Bearer ' + ACCES.t, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28' } });
    if (r.status === 404) throw Object.assign(new Error('L’ordinateur n’a encore rien envoyé : ouvrez Boussole sur l’ordinateur.'), { code: 404 });
    if (!r.ok) throw Object.assign(new Error('GitHub ' + r.status), { code: r.status });
    return r.json();
  } finally { clearTimeout(t); }
}
async function poster(url, corps) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps || {}), cache: 'no-store' });
  const d = await r.json().catch(() => ({})); return { ok: r.ok, ...d };
}
let demandeEnCours = false;
async function demanderCode(garder) {
  if (demandeEnCours) return; demandeEnCours = true;
  if (!garder) $('#cx-err').textContent = ''; $('#cx-aide').textContent = 'Demande du code à l’ordinateur…';
  try { const r = await poster('/api/demande'); $('#cx-aide').textContent = r.ok ? 'Un code à 6 chiffres vient de s’afficher dans Boussole, sur l’ordinateur. Il est valable 3 minutes.' : (r.erreur || 'Ordinateur injoignable.'); }
  catch { $('#cx-aide').textContent = 'Ordinateur injoignable : vérifiez que Boussole est ouverte et que le téléphone est sur le même Wi-Fi.'; }
  demandeEnCours = false;
}
function ecranConnexion(raison) {
  $('#connexion').hidden = false;
  if (DISTANT) {
    const epingler = !!ACCES && attendEpinglage();
    $('#cx-distant').hidden = !!ACCES; $('#cx-epingler').hidden = !epingler; $('#cx-code').hidden = true;
    $('#cx-derr').textContent = raison || '';
    $('#cx-comment').innerHTML = IOS ? 'Touchez le bouton <b>Partager</b> en bas de Safari, puis « <b>Sur l’écran d’accueil</b> », puis « Ajouter ».' : 'Dans Chrome, touchez le menu <b>⋮</b>, puis « <b>Ajouter à l’écran d’accueil</b> ».';
    $('#cx-epingler small').textContent = 'Dernière étape'; $('#cx-epingler p:last-of-type').textContent = 'Ouvrez ensuite Boussole depuis sa nouvelle icône : il marche partout, en Wi-Fi comme en 4G.';
    return;
  }
  const ici = EPINGLEE || store('ici', false);
  $('#cx-epingler').hidden = ici; $('#cx-code').hidden = !ici;
  $('#cx-comment').innerHTML = IOS ? 'Dans Safari, touchez <b>⋯</b> ou le bouton <b>Partager</b>, puis « <b>Sur l’écran d’accueil</b> », puis « Ajouter ».' : 'Dans Chrome, touchez le menu <b>⋮</b>, puis « <b>Ajouter à l’écran d’accueil</b> » (ou « Installer l’application »).';
  $('#cx-etape').textContent = EPINGLEE ? 'Étape 2 sur 2' : 'Connexion';
  if (ici) { $('#cx-err').textContent = raison || ''; demanderCode(!!raison); setTimeout(() => $('#cx-saisie').focus(), 300); }
}
$('#cx-ici').onclick = () => { save('ici', true); if (DISTANT) { history.replaceState(null, '', location.pathname); $('#connexion').hidden = true; boucle(); return; } ecranConnexion(); };
$('#cx-dform').onsubmit = (e) => {
  e.preventDefault(); const v = $('#cx-dcode').value.trim(), k = decoderActivation((v.match(/a=([A-Za-z0-9_-]+)/) || [null, v.replace(/\s+/g, '')])[1]);
  if (!k) { $('#cx-derr').textContent = 'Code non reconnu : recopiez-le en entier.'; return; }
  ACCES = k; save('acces', k); save('ici', true); $('#connexion').hidden = true; boucle();
};
$('#cx-nouveau').onclick = () => { $('#cx-saisie').value = ''; demanderCode(); };
$('#cx-saisie').oninput = (e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); e.target.value = v.length > 3 ? v.slice(0, 3) + ' ' + v.slice(3) : v; if (v.length === 6) $('#cx-form').requestSubmit(); };
$('#cx-form').onsubmit = async (e) => {
  e.preventDefault(); const code = $('#cx-saisie').value.replace(/\D/g, '');
  if (code.length !== 6) { $('#cx-err').textContent = 'Le code fait 6 chiffres.'; return; }
  $('#cx-ok').disabled = true; $('#cx-err').textContent = '';
  try {
    const r = await poster('/api/appairer', { code });
    if (r.ok && /^[a-f0-9]{64}$/.test(r.jeton || '')) { JETON = r.jeton; save('appareil', JETON); $('#connexion').hidden = true; $('#cx-saisie').value = ''; boucle(); }
    else { $('#cx-err').textContent = r.erreur || 'Connexion refusée.'; $('#cx-saisie').value = ''; $('#cx-saisie').focus(); }
  } catch { $('#cx-err').textContent = 'Ordinateur injoignable.'; }
  $('#cx-ok').disabled = false;
};
async function lire(url) {
  if (DISTANT) {
    if (url.startsWith('/api/etat')) return lireGH('telephone/etat.json');
    if (!S.B || Date.now() - S.tB > 6e5) { S.B = await lireGH('telephone/bougies.json'); S.tB = Date.now(); }
    const id = new URL(url, location.href).searchParams.get('id'), c = S.B?.c?.[id];
    if (!c) throw new Error('Graphique pas encore envoyé par l’ordinateur (il envoie les graphiques une fois par heure).');
    return { c };
  }
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + JETON }, cache: 'no-store', signal: ctl.signal });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.erreur || 'HTTP ' + r.status), { code: r.status });
    return d;
  } finally { clearTimeout(t); }
}
async function rafraichir() {
  if (DISTANT ? !ACCES || attendEpinglage() : !JETON) { if ($('#connexion').hidden) ecranConnexion(); return; }
  try {
    const e = await lire('/api/etat');
    S.e = e; S.recu = Date.now(); S.erreurs = 0; save('dernier', e);
    $('#connexion').hidden = true; $('#bandeau-pc').hidden = true;
    if (DISTANT && e.envoi && Date.now() - e.envoi > 15 * 6e4) { const b = $('#bandeau-pc'); b.hidden = false; b.textContent = `Données ${ilya(e.envoi)} : l’ordinateur est éteint ou Boussole est fermée.`; }
    rendre();
  } catch (err) {
    S.erreurs++;
    if (DISTANT && err.code === 401) { ACCES = null; save('acces', null); ecranConnexion('Le jeton du téléphone a été refusé par GitHub (supprimé ou expiré). Scannez le nouveau QR code.'); return; }
    if (DISTANT) { const b = $('#bandeau-pc'); b.hidden = false; b.textContent = `${err.code === 404 ? err.message : 'Pas de connexion Internet'}${S.e ? ` : données ${ilya(S.e.envoi || S.e.t)}` : ''}.`; etatLien(); return; }
    if (err.code === 401) { JETON = ''; save('appareil', ''); ecranConnexion('Ce téléphone a été déconnecté depuis l’ordinateur. Entrez le nouveau code.'); return; }
    if (S.erreurs >= 2) { const b = $('#bandeau-pc'); b.hidden = false; b.textContent = `Ordinateur injoignable${S.e ? ` : données ${ilya(S.recu || S.e.t)}` : ''}. Vérifiez que Boussole est ouverte et que le téléphone est sur le même Wi-Fi.`; }
  }
  etatLien();
}
function etatLien() {
  const p = $('#pc-point');
  if (DISTANT) {
    const age = Date.now() - (S.e?.envoi || 0);
    p.className = 'point ' + (!S.e?.envoi ? '' : age < 5 * 6e4 ? 'ok' : age < 15 * 6e4 ? 'lent' : 'ko');
    $('#pc-txt').textContent = S.e ? `${S.e.pc || 'Ordinateur'} · ${S.e.envoi ? ilya(S.e.envoi) : 'hors ligne'}` : 'Connexion…';
    $('#heure').textContent = heureC(Date.now()); return;
  }
  const age = Date.now() - (S.recu || 0);
  p.className = 'point ' + (!S.recu ? '' : age < 15000 ? 'ok' : age < 60000 ? 'lent' : 'ko');
  $('#pc-txt').textContent = S.e ? `${S.e.pc || 'Ordinateur'} · ${S.recu ? ilya(S.recu) : 'hors ligne'}` : 'Connexion…';
  $('#heure').textContent = heureC(Date.now());
}
let minuterie = 0;
function boucle() { clearInterval(minuterie); rafraichir(); minuterie = setInterval(rafraichir, DISTANT ? 30000 : 4000); }
document.addEventListener('visibilitychange', () => { if (document.hidden) clearInterval(minuterie); else boucle(); });
setInterval(etatLien, 1000);

// ---------- Petits dessins
const CAP = { achat: -90, surveiller: -38, attendre: 0, eviter: 78, vente: 90, suivi: -90 };
function boussole(code, t = 74) {
  const ticks = Array.from({ length: 24 }, (_, i) => { const g = i % 6 === 0; return `<line x1="50" y1="${g ? 6 : 8}" x2="50" y2="${g ? 13 : 11}" transform="rotate(${i * 15} 50 50)" class="${g ? 'g' : ''}"/>`; }).join('');
  return `<svg class="boussole c-${code}" viewBox="0 0 100 100" width="${t}" height="${t}"><circle cx="50" cy="50" r="47" class="bord"/><g class="ticks">${ticks}</g><g class="aiguille" style="transform:rotate(${CAP[code] ?? 0}deg)"><path d="M50 44.5 L88 50 L50 55.5 Z" class="pointe"/><path d="M50 44.5 L22 50 L50 55.5 Z" class="queue"/></g><circle cx="50" cy="50" r="4.2" class="axe"/></svg>`;
}
function anneau(conf, t = 40) {
  const r = 40, c = 2 * Math.PI * r, s = c / 5, n = Math.round(conf / 20);
  return `<svg class="anneau" viewBox="0 0 100 100" width="${t}" height="${t}"><g transform="rotate(-90 50 50)">${Array.from({ length: 5 }, (_, i) => `<circle cx="50" cy="50" r="${r}" class="${i < n ? 'ok' : ''}" stroke-dasharray="${s - 6} ${c - s + 6}" stroke-dashoffset="${-i * s}"/>`).join('')}</g><text x="50" y="59" text-anchor="middle">${conf}</text></svg>`;
}
function spark(v) {
  if (!v?.length) return '<svg class="spark"></svg>';
  const lo = Math.min(...v), hi = Math.max(...v), k = hi - lo || 1;
  return `<svg class="spark ${sens(v.at(-1) - v[0])}" viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points="${v.map((x, i) => `${(i / (v.length - 1) * 98 + 1).toFixed(1)},${(27 - (x - lo) / k * 24).toFixed(1)}`).join(' ')}"/></svg>`;
}
const pastille = (m) => `<span class="pastille c-${m.code}">${esc(m.label)}${['achat', 'vente', 'surveiller'].includes(m.code) && m.conf ? ` ${m.conf} %` : ''}</span>`;

// ---------- 3.18 : DASHBOARD MOBILE (5 onglets en bas, cartes compactes, décisions en un clic)
const ORDRE = ['trader', 'accueil', 'positions', 'marches', 'equipe'];
function rendreTrader(e) { if (typeof tableauHTML === 'function') set('#o-trader', tableauHTML(e.trader)); }
const eu = (v, d = 2) => (v == null || !isFinite(v) ? '–' : nb(v, d) + ' €');
const sg = (v, d = 2) => (v == null || !isFinite(v) ? '–' : (v >= 0 ? '+' : '−') + nb(Math.abs(v), d) + ' €');
const toast = (t) => { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.m); toast.m = setTimeout(() => el.classList.remove('on'), 3200); };
const vibre = () => { try { navigator.vibrate?.(8); } catch {} };
function courbe(v, base, h = 64) {
  if (!v || v.length < 2) return `<div class="courbe vide" style="height:${h}px"><small>La courbe apparaîtra avec vos premiers trades.</small></div>`;
  const lo = Math.min(base ?? v[0], ...v), hi = Math.max(base ?? v[0], ...v), k = hi - lo || 1, X = (i) => (i / (v.length - 1) * 100).toFixed(2), Y = (x) => (h - 4 - (x - lo) / k * (h - 10)).toFixed(1);
  const pts = v.map((x, i) => `${X(i)},${Y(x)}`).join(' '), c = sens(v.at(-1) - (base ?? v[0]));
  return `<svg class="courbe ${c}" viewBox="0 0 100 ${h}" preserveAspectRatio="none" style="height:${h}px"><defs><linearGradient id="gc-${c}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="g1"/><stop offset="1" class="g2"/></linearGradient></defs>${base != null ? `<line x1="0" x2="100" y1="${Y(base)}" y2="${Y(base)}" class="base"/>` : ''}<polygon points="0,${h} ${pts} 100,${h}" fill="url(#gc-${c})"/><polyline points="${pts}"/></svg>`;
}
const titreSection = (t, s = '', aller = '') => `<div class="sec-t"><h2>${t}</h2>${s ? `<small>${s}</small>` : ''}${aller ? `<button class="voir" data-aller="${aller}">Tout voir ›</button>` : ''}</div>`;
const ICO_D = { plan: '🎯', seuil: '📍', jour: '⚡', prix: '🔔' };

function carteDecision(D) {
  return `<article class="deci t-${D.type}"><div class="d-tete"><span class="d-ico">${ICO_D[D.type] || '•'}</span><div><b>${esc(D.titre)}</b><small>${esc(D.nom || '')}${D.fin ? ` · expire à ${heureC(D.fin)}` : ''}</small></div>${D.id ? `<button class="rond petit" data-id="${esc(D.id)}" aria-label="Voir le graphique">›</button>` : ''}</div>
    <p>${esc(D.texte)}</p>${D.mise ? `<small class="d-mise">Mise conseillée ${esc(D.mise)} · perte maximale ${esc(D.perte)}</small>` : ''}
    <div class="d-act">${DISTANT ? '<span class="lecture">🔒 En 4G, le téléphone lit seulement : validez sur l’ordinateur (ou connectez-le en Wi-Fi pour décider d’ici).</span>'
      : `<button class="b-ok" data-agir="executer" data-cle="${esc(D.cle)}">${D.type === 'prix' ? 'Faire analyser' : 'Exécuter'}</button>${D.pf ? `<button class="b-pf" data-agir="pf100" data-cle="${esc(D.cle)}">Dans mes 100 €</button>` : ''}<button class="b-non" data-agir="ignorer" data-cle="${esc(D.cle)}">Ignorer</button>`}</div></article>`;
}
async function agir(quoi, cle, bouton) {
  if (DISTANT || !JETON) return toast('Validez cette décision sur l’ordinateur.');
  vibre(); $$(`[data-cle="${CSS.escape(cle)}"]`).forEach((b) => { b.disabled = true; }); bouton.classList.add('attente');
  let r; try { const x = await fetch('/api/action', { method: 'POST', cache: 'no-store', headers: { Authorization: 'Bearer ' + JETON, 'Content-Type': 'application/json' }, body: JSON.stringify({ quoi, cle }) }); r = { ok: x.ok, ...(await x.json().catch(() => ({}))) }; }
  catch { r = { ok: false, message: 'Ordinateur injoignable.' }; }
  toast(r.message || r.erreur || (r.ok ? 'Fait.' : 'Impossible pour le moment.'));
  if (r.ok) { S.faits[cle] = quoi; rendre(); setTimeout(rafraichir, 900); } else $$(`[data-cle="${CSS.escape(cle)}"]`).forEach((b) => { b.disabled = false; b.classList.remove('attente'); });
}

function rendreAccueil(e) {
  const F = e.pf100, J = e.jour100, B = e.briefing, Pg = e.progression, Df = e.defi, D = (e.decisions || []).filter((x) => x.cle && !S.faits[x.cle]);
  const h = new Date().getHours(), salut = h < 5 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir';
  const hero = F ? `<section class="hero"><div class="h-haut"><div><small>Portefeuille d’entraînement</small><b class="gros">${eu(F.equite)}</b></div>
      <span class="chip ${J ? sens(J.pnl) : ''}">${J ? `${sg(J.pnl)} · ${pct(J.pct, 1)}<small>aujourd’hui</small>` : '–'}</span></div>
      ${courbe(F.courbe, 100, 70)}
      <div class="h-kpi"><div><small>Total</small><b class="${sens(F.perf)}">${pct(F.perf, 1)}</b></div><div><small>L’équipe</small><b class="${sens(F.equipe)}">${pct(F.equipe, 1)}</b></div><div><small>Risque</small><b class="${F.risque > F.plafond ? 'down' : ''}">${nb(F.risque, 1)} %</b></div><div><small>Prêt 16/12</small><b>${F.prep} %</b></div></div></section>`
    : '<section class="hero"><small>Portefeuille d’entraînement</small><p>Mettez Boussole à jour sur l’ordinateur pour voir votre compte 100 € ici.</p></section>';
  const R = e.resultats, tuiles = `<div class="tuiles">
      <button class="tuile" data-aller="positions"><small>P&L du jour</small><b class="${J ? sens(J.pnl) : ''}">${J ? sg(J.pnl) : '–'}</b><span>${J ? (J.fermees ? `${J.fermees} trade${J.fermees > 1 ? 's' : ''} clos, ${sg(J.realise)}` : 'latent compris') : ''}</span></button>
      <button class="tuile" data-aller="positions"><small>Positions</small><b>${e.compteurs.pos}${F?.ouvertes?.length ? ` <i>+${F.ouvertes.length}</i>` : ''}</b><span>carnet${F?.ouvertes?.length ? ' + 100 €' : ''} · risque ${nb(e.risque.engage, 1)} %</span></button>
      <button class="tuile" data-aller="marches"><small>Opportunités</small><b>${e.compteurs.opp}</b><span>${e.compteurs.surv} à surveiller</span></button>
      <button class="tuile" data-aller="defis"><small>${Pg ? `Niveau ${Pg.niveau}` : 'Progression'}</small><b>${Pg ? `${Pg.xp} XP` : '–'}</b>${Pg ? `<div class="xp"><i style="width:${Math.round(Pg.pct)}%"></i></div><span>${esc(Pg.nom)}</span>` : ''}</button></div>`;
  const deci = D.length ? `${titreSection('À décider', `${D.length} prête${D.length > 1 ? 's' : ''} · un clic`)}<div class="pile">${D.map(carteDecision).join('')}</div>` : '';
  const ouvert = S.ouverts.brief;
  const brief = B ? `${titreSection(B.matin ? 'Briefing du matin' : 'Briefing du jour', `Claire · ${heureC(B.t)}`)}<article class="carte brief ${ouvert ? 'ouvert' : ''}" data-plier="brief"><h3>${esc(B.titre)}</h3><p class="synth">${esc(B.synthese)}</p>
      <ol class="prio">${(B.priorites || []).map((p) => `<li><b>${esc(p.titre)}</b>${ouvert && p.pourquoi ? `<small>${esc(p.pourquoi)}</small>` : ''}</li>`).join('')}</ol>
      ${ouvert && B.risque?.plan?.length ? `<div class="risque-b"><b>Risque · ${esc(B.risque.etat || '')}</b>${B.risque.plan.map((x) => `<small>• ${esc(x)}</small>`).join('')}</div>` : ''}${ouvert && B.mot ? `<p class="mot">« ${esc(B.mot)} »</p>` : ''}<span class="plier">${ouvert ? 'Réduire' : 'Lire tout'}</span></article>` : '';
  const P0 = (e.feed || [])[0], nFeed = (e.feed || []).length;
  const raccourcis = `<div class="raccourcis"><button class="carte rac" data-aller="equipe"><span class="r-ico">💬</span><b>Feed de l’équipe</b><small>${P0 ? esc(P0.titre) : 'Les débats apparaîtront ici'}</small>${nFeed ? `<i>${nFeed}</i>` : ''}</button>
      <button class="carte rac" data-aller="defis"><span class="r-ico">${Df?.ok ? '✅' : '🎯'}</span><b>Défi du jour</b><small>${Df ? esc(Df.titre) : '–'}</small>${Df ? `<i>+${Df.xp}</i>` : ''}</button></div>`;
  const cl = `<button class="carte climat" data-aller="equipe">${boussole(e.climat.code, 46)}<div><small>${e.climat.ia ? 'Point marché de Claire' : 'Climat général'}</small><b>${esc(e.climat.titre)}</b></div></button>`;
  const opps = e.opportunites.length ? `${titreSection('Opportunités', 'au moins 80 % de confiance', 'marches')}<div class="defile">${e.opportunites.map(carteOpp).join('')}</div>` : '';
  set('#o-accueil', `<div class="salut"><h1>${salut}</h1><small>${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</small></div>
    <div class="grille"><div class="col">${hero}${tuiles}${deci}</div><div class="col">${brief}${raccourcis}${cl}${opps}</div></div>`);
}
function carteOpp(m) {
  return `<button class="opp" data-id="${m.id}"><header><div><h3>${esc(m.nom)}</h3><p>${esc(m.label)} · ${esc(m.plan?.titre || '')}</p></div>${anneau(m.conf, 38)}</header>
    ${m.plan ? `<div class="niveaux"><div><small>Entrée</small><b>${esc(m.plan.txt.entree)}</b></div><div class="s"><small>Stop −${nb(m.plan.perte, 0)} %</small><b class="down">${esc(m.plan.txt.stop)}</b></div><div class="o"><small>Objectif +${nb(m.plan.gain, 0)} %</small><b class="up">${esc(m.plan.txt.objectif)}</b></div></div>` : ''}
    <footer><span>Mise ${esc(m.plan?.mise || '–')} · ${m.ouvert ? 'ouvert' : 'fermé'}</span>${spark(m.spark)}</footer></button>`;
}

function rendrePositions(e) {
  const P = e.positions, R = e.resultats, F = e.pf100, J = e.jour100;
  const pf = F ? `<section class="carte pf"><div class="pf-tete"><div><small>Mon portefeuille 100 €</small><b class="gros">${eu(F.equite)}</b></div><span class="chip ${J ? sens(J.pnl) : ''}">${J ? `${sg(J.pnl)}<small>aujourd’hui</small>` : ''}</span></div>
      ${courbe(F.courbe, 100, 56)}
      <div class="kpi4"><div><small>Solde</small><b>${eu(F.solde)}</b></div><div><small>Latent</small><b class="${sens(F.latent)}">${sg(F.latent)}</b></div><div><small>Drawdown max</small><b>−${nb(F.dd, 1)} %</b></div><div><small>Gagnants</small><b>${F.n ? `${F.g}/${F.n}` : '–'}</b></div></div>
      ${F.risque > F.plafond ? `<p class="alerte-r">Risque global ${nb(F.risque, 1)} % : au-dessus du plafond de ${F.plafond} %.</p>` : ''}
      ${(F.ouvertes || []).length ? `<div class="liste">${F.ouvertes.map((o) => `<div class="l"><span>${esc(o.nom)}</span><b class="${o.attente ? '' : sens(o.eur)}">${o.attente ? 'en attente' : sg(o.eur)}</b></div>`).join('')}</div>` : '<small class="aide">Aucune position dans le portefeuille 100 € : prenez un plan depuis la fiche d’un marché sur l’ordinateur, ou « Dans mes 100 € » sur une décision.</small>'}</section>` : '';
  const carnet = P.length ? P.map((p) => {
    const lo = Math.min(p.stop, p.objectif), hi = Math.max(p.stop, p.objectif), x = (v) => Math.max(0, Math.min(100, (v - lo) / (hi - lo || 1) * 100));
    return `<button class="carte pos" data-id="${p.id}"><header><div><h3>${esc(p.nom)}</h3><small>${esc(p.etat)}${p.demi ? ' · moitié encaissée' : ''}${p.suiveur ? ' · stop suiveur' : ''}</small></div><div class="res"><b class="${p.ouverte ? sens(p.eur) : ''}">${p.ouverte ? esc(p.eurTxt) : '–'}</b><small>${p.ouverte ? `${p.r >= 0 ? '+' : ''}${nb(p.r, 1)} R` : 'en attente'}</small></div></header>
      <div class="trajet"><div class="rail"></div><div class="entree" style="left:${x(p.entree)}%"></div>${p.prix != null ? `<div class="curseur" style="left:${x(p.prix)}%"></div>` : ''}</div>
      <div class="bornes"><span class="down">Stop ${esc(p.txt.stop)}</span><span>Entrée ${esc(p.txt.entree)}</span><span class="up">Objectif ${esc(p.txt.objectif)}</span></div>${p.equipe ? `<p class="pos-eq">${esc(p.equipe)}</p>` : ''}</button>`; }).join('')
    : '<div class="vide"><b>Aucune position dans le carnet.</b>Suivez un plan depuis l’ordinateur : il apparaîtra ici avec sa progression entre le stop et l’objectif.</div>';
  const res = `<div class="tuiles"><div class="tuile"><small>Résultat net du carnet</small><b class="${R.termines ? sens(R.total) : ''}">${R.termines ? esc(R.totalTxt) : '–'}</b><span>${R.termines ? `${R.gagnants}/${R.termines} gagnants` : 'aucun trade terminé'}</span></div><div class="tuile"><small>Plans de Boussole</small><b>${e.boussole.taux != null ? nb(e.boussole.taux, 0) + ' %' : '–'}</b><span>de réussite${e.boussole.termines ? ` sur ${e.boussole.termines}` : ''}</span></div></div>`;
  const LB = e.labo, AP = e.apprentissage, SC = e.scenario;
  const labo = (LB?.ouvertes?.length || AP?.n || SC) ? `${titreSection('Labo et apprentissage')}<section class="carte liste-c">${(LB?.ouvertes || []).map((o) => `<div class="l"><span>🧪 ${esc(o.nom)}<small>${esc(o.hypothese)}</small></span><b class="${sens(o.r)}">${o.r >= 0 ? '+' : ''}${nb(o.r, 1)} R</b></div>`).join('')}
      ${AP?.n ? AP.dernieres.map((x) => `<div class="l"><span>${x.motif === 'reussite' ? '✓' : x.motif === 'echec' ? '✗' : '·'} ${esc(x.marche)}<small>${esc(x.lecon)}</small></span><b class="${sens(x.r)}">${x.r >= 0 ? '+' : ''}${nb(x.r, 1)} R</b></div>`).join('') : ''}
      ${SC ? `<div class="l"><span>Dernier scénario : ${esc(SC.nom)}</span><b class="${sens(SC.delta)}">${sg(SC.delta)}</b></div>` : ''}</section>` : '';
  set('#o-positions', `<div class="grille"><div class="col">${pf}${res}</div><div class="col">${titreSection('Mon carnet', `${P.length} en cours · risque ${nb(e.risque.engage, 1)} % / ${e.risque.plafond} %`)}<div class="pile">${carnet}</div>${labo}</div></div>`);
}

function rendreMarches(e) {
  const G = [['tous', 'Tous'], ...e.groupes.map(([g, l]) => [g, l.replace('Devises, crypto et matières premières', 'Macro').replace('Actions américaines', 'États-Unis').replace('Actions françaises et européennes', 'Europe').replace('Fonds indiciels (ETF) éligibles au PEA', 'ETF PEA').replace('Mes marchés ajoutés', 'Ajoutés')])];
  const L = e.marches.filter((m) => S.filtre === 'tous' || m.groupe === S.filtre);
  const tick = `<div class="chips">${(e.bandeau || []).map((x) => `<button class="tk" data-id="${x.id}"><b>${esc(x.nom)}</b><span>${esc(x.px)}</span><i class="${sens(x.var)}">${pct(x.var)}</i></button>`).join('')}</div>`;
  const opps = `${titreSection('Opportunités', e.opportunites.length ? 'validées par Claire' : '')}${e.opportunites.length ? `<div class="defile">${e.opportunites.map(carteOpp).join('')}</div>` : '<div class="vide"><b>Aucun plan assez solide pour l’instant.</b>Les bonnes occasions sont rares : l’équipe surveille tous les marchés.</div>'}`;
  const surv = e.surveiller.length ? `${titreSection('À surveiller', 'il manque encore un signal')}<section class="carte liste-c">${e.surveiller.map((m) => `<button class="ligne" data-id="${m.id}"><span><b>${esc(m.nom)}</b><small>${esc(m.quoi)}</small></span><span class="px">${esc(m.px)}<i class="${sens(m.var)}">${pct(m.var)}</i></span></button>`).join('')}</section>` : '';
  const chaleur = `${titreSection('Tous les marchés')}<div class="filtres">${G.map(([k, l]) => `<button class="${S.filtre === k ? 'on' : ''}" data-f="${k}">${esc(l)}</button>`).join('')}</div>
    ${e.groupes.filter(([g]) => L.some((m) => m.groupe === g)).map(([g, l]) => `<div class="groupe">${esc(l)}</div><div class="chaleur">${L.filter((m) => m.groupe === g).map((m) => { const v = m.var ?? 0, a = Math.min(1, Math.abs(v) / 3) * 0.7 + 0.12;
      return `<button class="ch" data-id="${m.id}" style="--a:${a.toFixed(2)}" data-s="${v >= 0 ? 'up' : 'down'}"><b>${esc(m.nom)}</b><span>${pct(v)}</span><small>${esc(m.px)}${['achat', 'vente'].includes(m.code) ? ' · ' + esc(m.label) : ''}</small></button>`; }).join('')}</div>`).join('')}`;
  set('#o-marches', `${tick}<div class="grille"><div class="col">${opps}${surv}</div><div class="col">${chaleur}</div></div>`);
}

const POSI = { pour: ['Pour', 'up'], contre: ['Contre', 'down'], nuance: ['Nuance', ''] };
function rendreEquipe(e) {
  save('feedVu', Math.max(store('feedVu', 0), ...(e.feed || []).map((x) => x.t)));
  const moteur = `<div class="carte moteur"><span class="point ${/ok|actif/.test(e.moteur.classe) ? 'ok' : /err/.test(e.moteur.classe) ? 'ko' : ''}"></span><span><b>${esc(e.moteur.titre)}</b><small>${esc(e.moteur.detail)}</small></span></div>`;
  const cl = `<section class="carte climat grand">${boussole(e.climat.code, 56)}<div><small>${e.climat.ia ? 'Point marché de Claire' : 'Climat général'}</small><b>${esc(e.climat.titre)}</b></div>${e.climat.resume ? `<p>${esc(e.climat.resume)}</p>` : ''}${e.climat.prudence ? `<p class="prud">⚠︎ ${esc(e.climat.prudence)}</p>` : ''}</section>`;
  const feed = (e.feed || []).length ? (e.feed || []).map((P) => `<article class="carte post"><header><b>${esc(P.titre)}</b><small>${esc(P.sous || '')} · ${heureC(P.t)}</small></header>
      ${(P.messages || []).map((m) => `<div class="bulle ${m.position}"><span class="av ${m.pole}">${esc((m.nom || '?')[0])}</span><div><div class="b-tete"><b>${esc(m.nom)}</b>${m.tag ? `<small>${esc(m.tag)}</small>` : ''}<i class="pos-${m.position} ${POSI[m.position]?.[1] || ''}">${POSI[m.position]?.[0] || ''}</i></div><p>${esc(m.texte)}</p>${(m.reponses || []).map((y) => `<p class="rep"><b>${esc(y.nom)}</b> ${esc(y.texte)}</p>`).join('')}</div></div>`).join('')}
      ${P.verdict ? `<div class="verdict-f ${P.verdict.ok ? 'ok' : 'non'}"><span class="av boss">${esc((P.verdict.nom || 'C')[0])}</span><p><b>${esc(P.verdict.nom)} ${P.verdict.ok ? 'valide' : 'refuse'}</b> ${esc(P.verdict.texte)}</p></div>` : '<small class="aide">En attente de la décision de Claire…</small>'}
      ${P.id ? `<button class="voir" data-id="${esc(P.id)}">Voir le graphique ›</button>` : ''}</article>`).join('')
    : '<div class="vide"><b>Pas encore de débat.</b>Avant chaque décision, les analystes débattent ici : le prudent, l’offensive, la sceptique, l’enthousiaste… puis Claire tranche.</div>';
  const evts = [
    ...(e.bureau || []).slice(0, 8).map((b) => ({ t: b.t, html: `<div class="fil eq"><time>${heureC(b.t)}</time><span><b>${esc(b.de)}${b.a ? ` → ${esc(b.a)}` : ''}</b><p>${esc(b.texte)}</p></span></div>` })),
    ...(e.alertes || []).slice(0, 6).map((a) => ({ t: a.t, html: `<div class="fil"><time>${heureC(a.t)}</time><span><b>${esc(a.nom)}</b><p>${esc(a.texte)}</p></span></div>` })),
  ].sort((a, b) => b.t - a.t);
  const agenda = [...(e.calendrier || []).filter((c) => c.t > Date.now() - 36e5).slice(0, 4).map((c) => `<div class="fil evt"><time>${new Date(c.t).toLocaleDateString('fr-FR', { weekday: 'short' })} ${heureC(c.t)}</time><span><b>${esc(c.titre)}</b>${c.fort ? '<i class="fort">FORT</i>' : ''}<p>${c.pays === 'us' ? 'États-Unis' : 'Zone euro'}${c.prevision ? `, prévu ${esc(c.prevision)}` : ''}</p></span></div>`),
    ...(e.resultatsEntreprises || []).slice(0, 3).map((r) => `<div class="fil evt"><time>${new Date(r.t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</time><span><b>Résultats ${esc(r.nom)}</b><p>Le prix peut bouger fortement ce jour-là.</p></span></div>`)];
  set('#o-equipe', `<div class="grille"><div class="col">${moteur}${titreSection('Le Feed de l’équipe', 'débats avant chaque décision')}<div class="pile">${feed}</div></div>
    <div class="col">${cl}${titreSection('Activité du bureau')}<section class="carte liste-c">${evts.length ? evts.map((x) => x.html).join('') : '<p class="rien">Rien de nouveau pour l’instant.</p>'}</section>${agenda.length ? `${titreSection('Rendez-vous')}<section class="carte liste-c">${agenda.join('')}</section>` : ''}</div></div>`);
}

function rendreDefis(e) {
  const Pg = e.progression, Df = e.defi, Bd = e.badges || [];
  const r = 34, c = 2 * Math.PI * r, f = Pg ? Math.max(0.02, Pg.pct / 100) : 0;
  const niveau = `<section class="carte niveau"><svg viewBox="0 0 80 80" width="88" height="88"><circle cx="40" cy="40" r="${r}" class="fond"/><circle cx="40" cy="40" r="${r}" class="val" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 40 40)"/><text x="40" y="38" text-anchor="middle" class="n">${Pg ? Pg.niveau : '–'}</text><text x="40" y="52" text-anchor="middle" class="l">niveau</text></svg>
      <div><small>Votre progression</small><b class="gros">${Pg ? esc(Pg.nom) : '–'}</b><span>${Pg ? `${Pg.xp} XP · ${Math.round(Pg.pct)} % vers le niveau suivant` : ''}</span><div class="serie">🔥 <b>${e.serie || 0}</b> défi${(e.serie || 0) > 1 ? 's' : ''} d’affilée</div></div></section>`;
  const defi = Df ? `${titreSection('Défi du jour', `+${Df.xp} XP`)}<section class="carte defi ${Df.ok ? 'ok' : Df.echec ? 'non' : ''}"><div class="d-etat">${Df.ok ? '✅ Réussi' : Df.echec ? '❌ Manqué' : '🎯 À faire'}</div><h3>${esc(Df.titre)}</h3><p>${esc(Df.consigne)}</p>${Df.masterclass ? `<div class="master"><small>Masterclass</small><p>${esc(Df.masterclass)}</p></div>` : ''}</section>` : '';
  const badges = Bd.length ? `${titreSection('Badges de discipline', `${Bd.filter((b) => b.ok).length}/${Bd.length}`)}<div class="badges">${Bd.map((b) => `<div class="badge ${b.ok ? 'ok' : ''}"><span>${esc(b.ico)}</span><small>${esc(b.nom)}</small></div>`).join('')}</div>` : '';
  const bilan = e.bilan ? `${titreSection('Bilan de la semaine')}<section class="carte"><b>${esc(e.bilan.titre)}</b><p class="doux">${esc(e.bilan.resume)}</p></section>` : '';
  set('#o-defis', `<div class="grille"><div class="col">${niveau}${defi}</div><div class="col">${badges}${bilan}</div></div>`);
}

// ---------- Graphique (même moteur que sur l’ordinateur)
const fmtTz = {};
function decal(t, tz) {
  const f = fmtTz[tz] ??= new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
}
const marcheDe = (id) => S.e?.marches.find((m) => m.id === id);
async function rendreGraphique() {
  const e = S.e, m = marcheDe(S.id) || e?.marches[0]; if (!m) return;
  S.id = m.id; save('gid', S.id);
  const liste = [...new Set([...e.opportunites.map((x) => x.id), ...e.positions.map((x) => x.id), ...e.surveiller.map((x) => x.id), ...e.marches.map((x) => x.id)])], i = liste.indexOf(m.id);
  set('#g-nom', `<button data-pas="-1" aria-label="Précédent">‹</button><b>${esc(m.nom)}</b><span class="${sens(m.var)}">${esc(m.px)} ${pct(m.var)}</span><button data-pas="1" aria-label="Suivant">›</button>`);
  S.liste = liste; S.i = i;
  $$('#g-tf button').forEach((b) => b.classList.toggle('on', b.dataset.tf === S.tf));
  const pl = e.plans[m.id];
  set('#g-info', `<div class="verdict c-${m.code}">${boussole(m.code, 56)}<div><small>Verdict</small><h2>${esc(m.label)}${m.conf && ['achat', 'vente', 'surveiller'].includes(m.code) ? ` · ${m.conf} %` : ''}</h2></div></div>
    ${pl ? `<p>${esc(pl.titre)}</p><div class="niveaux"><div class="o"><small>Objectif</small><b class="up">${esc(pl.txt.objectif)}</b></div><div><small>Entrée</small><b>${esc(pl.txt.entree)}</b></div><div class="s"><small>Stop</small><b class="down">${esc(pl.txt.stop)}</b></div></div><p>Mise conseillée : ${esc(pl.mise || '–')}</p>` : '<p>Pas de plan pour l’instant sur ce marché.</p>'}
    <p>Tendance de fond : ${{ hausse: 'en hausse', baisse: 'en baisse', neutre: 'pas nette' }[m.tend] || '–'}. Sur un mois : ${pct(m.var1m, 1)}. ${m.ouvert ? 'Marché ouvert.' : 'Marché fermé.'}</p>`);
  const cle = m.id + S.tf;
  if (S.cleG === cle && Date.now() - S.tG < 30000) return;
  S.cleG = cle; S.tG = Date.now();
  let d; try { d = await lire(`/api/bougies?id=${encodeURIComponent(m.id)}&tf=${S.tf}`); } catch (err) { set('#g-legende', esc(err.message)); return; }
  if (S.cleG !== cle) return;
  const intra = S.tf === 'h' || S.tf === 'h4', jour = !intra, tz = intra || (S.tf === 'j' && ['action', 'indice', 'etf'].includes(m.type)) ? m.tz || 'UTC' : 'UTC';
  const b = []; let prev = null;
  d.c.forEach(([t, o, h, l, c, v]) => { const time = jour ? new Date(decal(t, tz)).toISOString().slice(0, 10) : Math.floor(decal(t, tz) / 1000); if (prev !== null && time <= prev) return; b.push({ time, open: o, high: h, low: l, close: c, v }); prev = time; });
  const L = LightweightCharts;
  if (!S.chart) {
    S.chart = L.createChart($('#graph'), { autoSize: true, layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#8796ab', fontFamily: '"Instrument Sans", sans-serif', fontSize: 11 },
      grid: { vertLines: { color: 'rgba(255,255,255,.04)' }, horzLines: { color: 'rgba(255,255,255,.04)' } }, rightPriceScale: { borderColor: '#22324b' }, timeScale: { borderColor: '#22324b', rightOffset: 4, barSpacing: 6 },
      crosshair: { mode: L.CrosshairMode.Normal }, localization: { locale: 'fr-FR', priceFormatter: (p) => nb(p, marcheDe(S.id)?.dec ?? 2) }, handleScale: { pinch: true, mouseWheel: true }, handleScroll: { horzTouchDrag: true, vertTouchDrag: false } });
    S.serie = S.chart.addCandlestickSeries({ upColor: '#089981', downColor: '#f23645', borderUpColor: '#089981', borderDownColor: '#f23645', wickUpColor: '#089981', wickDownColor: '#f23645' });
    S.mm = [[50, '#3b9cff'], [200, '#f7a600']].map(([p, col]) => [p, S.chart.addLineSeries({ color: col, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })]);
    S.chart.subscribeCrosshairMove((p) => legende(p));
  }
  S.chart.applyOptions({ timeScale: { timeVisible: intra } });
  S.b = b; S.serie.setData(b);
  S.mm.forEach(([p, s]) => { const out = []; let somme = 0; b.forEach((x, k) => { somme += x.close; if (k >= p) somme -= b[k - p].close; if (k >= p - 1) out.push({ time: x.time, value: somme / p }); }); s.setData(out); });
  (S.lignes || []).forEach((x) => S.serie.removePriceLine(x)); S.lignes = [];
  if (pl) [[pl.objectif, '#089981', 'Objectif'], [pl.entree, '#3b9cff', 'Entrée'], [pl.stop, '#f23645', 'Stop']].forEach(([price, color, title]) => S.lignes.push(S.serie.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title })));
  if (S.vueCle !== cle) { S.vueCle = cle; S.chart.timeScale().setVisibleLogicalRange({ from: b.length - 90, to: b.length + 3 }); }
  legende();
}
function legende(p) {
  const b = S.b; if (!b?.length) return;
  const x = (p?.time != null && b.find((y) => y.time === p.time)) || b.at(-1), m = marcheDe(S.id), d = m?.dec ?? 2;
  set('#g-legende', `<span>O <b>${nb(x.open, d)}</b></span><span>H <b>${nb(x.high, d)}</b></span><span>B <b>${nb(x.low, d)}</b></span><span>C <b class="${sens(x.close - x.open)}">${nb(x.close, d)}</b></span><span style="color:#3b9cff">MM50</span><span style="color:#f7a600">MM200</span>`);
}

// ---------- Rendu général, navigation (barre du bas, glisser du doigt), feuille du graphique
function pastilles(e) {
  const D = (e.decisions || []).filter((x) => x.cle && !S.faits[x.cle]).length, vu = store('feedVu', 0), nf = (e.feed || []).filter((x) => x.t > vu).length;
  const n = { trader: '', accueil: D || '', positions: e.compteurs.pos + (e.pf100?.ouvertes?.length || 0) || '', marches: e.compteurs.opp || '', equipe: S.onglet === 'equipe' ? '' : nf || '', defis: e.defi && !e.defi.ok && !e.defi.echec ? '•' : '' };
  ORDRE.forEach((k) => { const i = $('#n-' + k); if (i) i.textContent = n[k]; });
}
function rendre() {
  const e = S.e; if (!e) return;
  try { ({ trader: rendreTrader, accueil: rendreAccueil, positions: rendrePositions, marches: rendreMarches, equipe: rendreEquipe, defis: rendreDefis }[S.onglet] || rendreAccueil)(e); } catch (err) { console.error(err); }
  pastilles(e);
  if (!$('#feuille').hidden) rendreGraphique();
}
function onglet(o, sens0) {
  if (!ORDRE.includes(o)) o = 'accueil';
  const av = ORDRE.indexOf(S.onglet), ap = ORDRE.indexOf(o);
  S.onglet = o; save('onglet3', o);
  $$('#barre button').forEach((b) => b.classList.toggle('on', b.dataset.o === o));
  $$('.onglet').forEach((s) => { const ici = s.id === 'o-' + o; s.hidden = !ici; if (ici) { s.classList.remove('de-g', 'de-d'); void s.offsetWidth; s.classList.add((sens0 ?? ap - av) >= 0 ? 'de-d' : 'de-g'); } });
  $('#vues').scrollTop = 0; rendre();
}
function ouvrirGraphique(id) {
  S.id = id; S.tf = 'j'; S.cleG = null; $('#feuille').hidden = false; document.body.classList.add('feuille-ouverte');
  history.pushState({ feuille: 1 }, ''); vibre(); rendreGraphique();
}
function fermerGraphique(depuisHistorique) { if ($('#feuille').hidden) return; $('#feuille').hidden = true; document.body.classList.remove('feuille-ouverte'); if (!depuisHistorique && history.state?.feuille) history.back(); }
addEventListener('popstate', () => fermerGraphique(true));
$('#f-fermer').onclick = () => fermerGraphique();
$('#barre').onclick = (e) => { const b = e.target.closest('[data-o]'); if (!b) return; vibre(); if (b.dataset.o === S.onglet) { $('#vues').scrollTo({ top: 0, behavior: 'smooth' }); return; } onglet(b.dataset.o); };
$('#etat-lien').onclick = () => { vibre(); toast('Actualisation…'); S.erreurs = 0; rafraichir(); };
document.addEventListener('click', (e) => {
  const ag = e.target.closest('[data-agir]'); if (ag) { e.stopPropagation(); return agir(ag.dataset.agir, ag.dataset.cle, ag); }
  const pl = e.target.closest('[data-plier]'); if (pl && !e.target.closest('button')) { S.ouverts[pl.dataset.plier] = !S.ouverts[pl.dataset.plier]; return rendre(); }
  const a = e.target.closest('[data-aller]'); if (a) { vibre(); return onglet(a.dataset.aller); }
  const f = e.target.closest('[data-f]'); if (f) { S.filtre = f.dataset.f; return rendre(); }
  const t = e.target.closest('#g-tf [data-tf]'); if (t) { S.tf = t.dataset.tf; S.cleG = null; return rendreGraphique(); }
  const pas = e.target.closest('[data-pas]'); if (pas && S.liste) { S.id = S.liste[(S.i + +pas.dataset.pas + S.liste.length) % S.liste.length]; S.cleG = null; return rendreGraphique(); }
  const m = e.target.closest('[data-id]'); if (m) return ouvrirGraphique(m.dataset.id);
});
// glisser horizontalement pour changer d’onglet (sauf dans les listes qui défilent sur le côté)
(() => {
  let x0 = 0, y0 = 0, t0 = 0, ok = false;
  const z = $('#vues');
  z.addEventListener('touchstart', (e) => { const t = e.touches[0]; ok = e.touches.length === 1 && !e.target.closest('.defile,.chips,.filtres'); x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); }, { passive: true });
  z.addEventListener('touchend', (e) => {
    if (!ok) return; const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dx) > 70 && Math.abs(dy) < Math.abs(dx) * 0.5 && Date.now() - t0 < 600) { const i = ORDRE.indexOf(S.onglet) + (dx < 0 ? 1 : -1); if (i >= 0 && i < ORDRE.length) { vibre(); onglet(ORDRE[i]); } }
  }, { passive: true });
})();
// en-tête qui se condense quand on fait défiler
$('#vues').addEventListener('scroll', () => document.body.classList.toggle('defile-bas', $('#vues').scrollTop > 12), { passive: true });
if (DISTANT) { S.tf = 'j'; $$('#g-tf [data-tf]').forEach((b) => { b.hidden = b.dataset.tf !== 'j'; }); }
onglet(S.onglet, 0);
boucle();
