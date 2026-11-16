// ---------- Boussole sur téléphone : affiche ce que l’ordinateur analyse (lecture seule)
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
const S = { e: store('dernier', null), recu: 0, erreurs: 0, onglet: store('onglet', 'bord'), filtre: 'tous', id: store('gid', 'spx'), tf: 'j', chart: null };
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

// ---------- Tableau de bord
function rendreBord(e) {
  // 3.17 : le briefing du matin et le défi du jour
  const B = e.briefing, Df = e.defi, Pg = e.progression, bEl = document.getElementById('briefing'), dEl = document.getElementById('defi');
  if (bEl) { bEl.hidden = !B; if (B) set('#briefing', `<small>${B.matin ? 'Briefing du matin' : 'Briefing du jour'} · Claire</small><h2>${esc(B.titre)}</h2><p>${esc(B.synthese)}</p>${(B.priorites || []).map((p, i) => `<p class="pf-l"><span><b>${i + 1}.</b> ${esc(p.titre)}</span></p><small>${esc(p.pourquoi || '')}</small>`).join('')}${B.risque?.plan?.length ? `<p style="margin-top:8px"><b>Risque (${esc(B.risque.etat || '')})</b></p>${B.risque.plan.map((x) => `<small>• ${esc(x)}</small><br>`).join('')}` : ''}${(e.decisions || []).length ? `<p style="margin-top:8px"><b>À décider sur l’ordinateur</b></p>${e.decisions.map((x) => `<small>• ${esc(x.titre)}</small><br>`).join('')}` : ''}`); }
  if (dEl) { dEl.hidden = !Df; if (Df) set('#defi', `<small>Défi du jour · +${Df.xp} XP${Pg ? ` · niveau ${Pg.niveau} ${esc(Pg.nom)} (${Pg.xp} XP)` : ''}</small><h2>${Df.ok ? '✅ ' : Df.echec ? '❌ ' : '🎯 '}${esc(Df.titre)}</h2><p>${esc(Df.consigne)}</p><small>${esc(Df.masterclass)}</small>${Pg ? `<div class="barre-xp"><i style="width:${Math.round(Pg.pct)}%"></i></div>` : ''}`); }
  set('#climat', `${boussole(e.climat.code)}<div><small>${e.climat.ia ? 'Point marché de l’IA' : 'Climat général'}</small><b>${esc(e.climat.titre)}</b></div>${e.climat.resume ? `<p>${esc(e.climat.resume)}</p>` : ''}`);
  set('#compteurs', `<button data-aller="bord"><b>${e.compteurs.opp}</b><span>opportunité${e.compteurs.opp > 1 ? 's' : ''}</span></button><button data-aller="marches"><b>${e.compteurs.surv}</b><span>à surveiller</span></button><button data-aller="positions"><b>${e.compteurs.pos}</b><span>position${e.compteurs.pos > 1 ? 's' : ''}</span></button>`);
  set('#moteur', `<span class="point ${/ok|actif/.test(e.moteur.classe) ? 'ok' : /err/.test(e.moteur.classe) ? 'ko' : ''}"></span><span><b>${esc(e.moteur.titre)}</b><small>${esc(e.moteur.detail)}</small></span>`);
  $('#s-opp').textContent = e.opportunites.length ? 'au moins 80 % de confiance' : '';
  set('#opps', e.opportunites.length ? e.opportunites.map((m) => `<button class="opp" data-id="${m.id}"><header><div><h3>${esc(m.label)} ${esc(m.nom)}</h3><p>${esc(m.plan?.titre || '')}</p></div>${anneau(m.conf)}</header>
      ${m.plan ? `<div class="niveaux"><div><small>Entrée</small><b>${esc(m.plan.txt.entree)}</b></div><div class="s"><small>Stop −${nb(m.plan.perte, 0)} %</small><b class="down">${esc(m.plan.txt.stop)}</b></div><div class="o"><small>Objectif +${nb(m.plan.gain, 0)} %</small><b class="up">${esc(m.plan.txt.objectif)}</b></div></div>` : ''}
      <footer><span>Mise ${esc(m.plan?.mise || '–')} · ${m.ouvert ? 'marché ouvert' : 'marché fermé'}</span>${spark(m.spark)}</footer></button>`).join('')
    : '<div class="vide"><b>Aucun plan assez solide pour l’instant.</b>Les bonnes occasions sont rares : Boussole surveille tous les marchés et vous préviendra.</div>');
  set('#surv', e.surveiller.length ? e.surveiller.map((m) => `<button class="ligne" data-id="${m.id}"><span><b>${esc(m.nom)}</b><small>${esc(m.quoi)}</small></span><span class="px">${esc(m.px)}<i class="${sens(m.var)}">${pct(m.var)}</i></span>${pastille(m)}</button>`).join('') : '<p class="rien">Rien à surveiller de près pour l’instant.</p>');
  // jauge du risque engagé (demi-cercle)
  const f = Math.min(1, e.risque.engage / e.risque.plafond), a = Math.PI * (1 - f), x = 50 + 40 * Math.cos(a), y = 52 - 40 * Math.sin(a);
  set('#risque', `<svg class="jauge" viewBox="0 0 100 60" width="96"><defs><linearGradient id="gj"><stop offset="0" stop-color="#36d0c8"/><stop offset="1" stop-color="${f > 0.8 ? '#f5b84d' : '#3b9cff'}"/></linearGradient></defs><path class="fond" d="M10 52 A40 40 0 0 1 90 52"/>${f > 0.005 ? `<path class="val" d="M10 52 A40 40 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" style="stroke:url(#gj)"/>` : ''}<text x="50" y="50" text-anchor="middle">${nb(e.risque.engage, 1)} %</text></svg>
    <div><b>Risque engagé</b><p>sur ${e.risque.plafond} % autorisés, pour un capital de ${esc(e.risque.capital)}.</p></div>`);
  const R = e.resultats, cv = R.courbe, lo = Math.min(0, ...cv), hi = Math.max(0, ...cv), k = hi - lo || 1;
  set('#perf', `<div class="chiffres"><div><small>Résultat net du carnet</small><b class="${R.termines ? sens(R.total) : ''}">${R.termines ? esc(R.totalTxt) : '–'}</b></div><div><small>En unités de risque</small><b class="${R.termines ? sens(R.r) : ''}">${R.termines ? `${R.r >= 0 ? '+' : '−'}${nb(Math.abs(R.r), 1)} R` : '–'}</b></div><div><small>Gagnants</small><b>${R.termines ? `${R.gagnants}/${R.termines}` : '–'}</b></div></div>
    ${cv.length > 1 ? `<svg viewBox="0 0 100 40" preserveAspectRatio="none" class="cc ${sens(cv.at(-1))}"><polyline points="${[0, ...cv].map((v, i) => `${(i / cv.length * 100).toFixed(1)},${(36 - (v - lo) / k * 32).toFixed(1)}`).join(' ')}"/></svg>` : `<small>${e.boussole.taux != null ? `Plans de Boussole : ${nb(e.boussole.taux, 0)} % de réussite sur ${e.boussole.termines}` : 'La courbe de votre capital apparaîtra après deux trades terminés.'}</small>`}`);
  const evts = [
    ...(e.bureau || []).filter((b) => ['valide', 'refuse', 'piste', 'point', 'suivi'].includes(b.type)).slice(0, 4).map((b) => ({ t: b.t, html: `<div class="fil eq"><time>${heureC(b.t)}</time><span><b>${esc(b.de)}${b.a ? ` → ${esc(b.a)}` : ''}</b><p>${esc(b.texte)}</p></span></div>` })),
    ...e.alertes.slice(0, 6).map((a) => ({ t: a.t, html: `<div class="fil"><time>${heureC(a.t)}</time><span><b>${esc(a.nom)}</b><p>${esc(a.texte)}</p></span></div>` })),
    ...e.calendrier.filter((c) => c.t > Date.now() - 36e5).slice(0, 4).map((c) => ({ t: 0, html: `<div class="fil evt"><time>${new Date(c.t).toLocaleDateString('fr-FR', { weekday: 'short' })} ${heureC(c.t)}</time><span><b>${esc(c.titre)}</b>${c.fort ? '<i class="fort">FORT</i>' : ''}<p>${c.pays === 'us' ? 'États-Unis' : 'Zone euro'}${c.prevision ? `, prévu ${esc(c.prevision)}` : ''}</p></span></div>` })),
    ...e.resultatsEntreprises.slice(0, 3).map((r) => ({ t: 0, html: `<div class="fil evt"><time>${new Date(r.t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</time><span><b>Résultats ${esc(r.nom)}</b><p>Le prix peut bouger fortement ce jour-là.</p></span></div>` })),
  ];
  set('#fil', evts.length ? evts.map((x) => x.html).join('') : '<p class="rien">Aucune alerte récente.</p>');
}

// ---------- Positions
function rendrePositions(e) {
  const P = e.positions, R = e.resultats, F = e.pf100;
  // 3.15 : le portefeuille d’entraînement de 100 € de l’utilisateur
  const pf = F ? (() => { const cv = F.courbe || [], lo = Math.min(100, ...cv), hi = Math.max(100, ...cv), k = hi - lo || 1, sg = (v) => `${v >= 0 ? '+' : '−'}${nb(Math.abs(v), 2)} €`;
    return `<div class="pf100"><h2>Mon portefeuille 100 €</h2><div class="stats"><div><small>Équité</small><b class="${sens(F.equite - 100)}">${nb(F.equite, 2)} €</b></div><div><small>Solde</small><b>${nb(F.solde, 2)} €</b></div><div><small>Perf. / équipe</small><b class="${sens(F.perf)}">${F.perf >= 0 ? '+' : ''}${nb(F.perf, 1)} %</b><small>équipe ${F.equipe >= 0 ? '+' : ''}${nb(F.equipe, 1)} %</small></div><div><small>Drawdown max</small><b>−${nb(F.dd, 1)} %</b></div></div>
      ${F.risque > F.plafond ? `<p class="pf-alerte">Risque global ${nb(F.risque, 1)} % : au-dessus du plafond de ${F.plafond} %.</p>` : ''}
      ${cv.length > 1 ? `<svg viewBox="0 0 100 30" preserveAspectRatio="none" class="cc ${sens(cv.at(-1) - 100)}"><polyline points="${cv.map((v, i) => `${(i / (cv.length - 1) * 100).toFixed(1)},${(27 - (v - lo) / k * 24).toFixed(1)}`).join(' ')}"/></svg>` : ''}
      ${(F.ouvertes || []).map((o) => `<p class="pf-l"><span>${esc(o.nom)}</span><b class="${o.attente ? '' : sens(o.eur)}">${o.attente ? 'en attente' : sg(o.eur)}</b></p>`).join('')}
      <small>${F.n} trade${F.n > 1 ? 's' : ''} terminé${F.n > 1 ? 's' : ''}, ${F.g} gagnant${F.g > 1 ? 's' : ''} · préparation au 16/12 : ${F.prep} %</small></div>`; })() : '';
  const LB = e.labo, AP = e.apprentissage, SC = e.scenario;
  const labo = (LB && (LB.ouvertes.length || LB.journal.length)) || AP?.n || SC ? `<div class="pf100"><h2>Labo de Claire</h2>${(LB?.ouvertes || []).map((o) => `<p class="pf-l"><span>🧪 ${esc(o.nom)}</span><b class="${sens(o.eur)}">${o.r >= 0 ? '+' : ''}${nb(o.r, 1)} R</b></p><small>${esc(o.hypothese)}</small>`).join('')}${!LB?.ouvertes?.length && LB?.journal?.[0] ? `<small>${esc(LB.journal[0].texte)}</small>` : ''}
    ${AP?.n ? `<h2 style="margin-top:12px">Ce que l’équipe apprend</h2><small>${AP.n} positions analysées : ${AP.reussites} réussites, ${AP.echecs} échecs</small>${AP.dernieres.map((x) => `<p class="pf-l"><span>${x.motif === 'reussite' ? '✓' : x.motif === 'echec' ? '✗' : '·'} ${esc(x.marche)}</span><b>${x.r >= 0 ? '+' : ''}${nb(x.r, 1)} R</b></p><small>${esc(x.lecon)}</small>`).join('')}` : ''}
    ${SC ? `<p class="pf-l" style="margin-top:10px"><span>Dernier scénario : ${esc(SC.nom)}</span><b class="${sens(SC.delta)}">${SC.delta >= 0 ? '+' : '−'}${nb(Math.abs(SC.delta), 2)} €</b></p>` : ''}</div>` : '';
  set('#o-positions', `${pf}${labo}<div class="stats"><div><small>Positions en cours</small><b>${P.length}</b></div><div><small>Risque engagé</small><b>${nb(e.risque.engage, 1)} %</b></div><div><small>Résultat net (terminées)</small><b class="${R.termines ? sens(R.total) : ''}">${R.termines ? esc(R.totalTxt) : '–'}</b></div><div><small>Plans de Boussole réussis</small><b>${e.boussole.taux != null ? nb(e.boussole.taux, 0) + ' %' : '–'}</b></div></div>
    ${P.length ? `<div class="pos-grille">${P.map((p) => {
      const lo = Math.min(p.stop, p.objectif), hi = Math.max(p.stop, p.objectif), pos = (v) => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
      return `<button class="pos" data-id="${p.id}"><header><div><h3>${esc(p.nom)}</h3><small>${esc(p.etat)}${p.demi ? ', moitié encaissée' : ''}${p.suiveur ? ', stop suiveur' : ''}</small></div><div class="res"><b class="${p.ouverte ? sens(p.eur) : ''}">${p.ouverte ? esc(p.eurTxt) : '–'}</b><small>${p.ouverte ? `${p.r >= 0 ? '+' : ''}${nb(p.r, 1)} R · ${pct(p.pct, 1)}` : 'en attente d’entrée'}</small></div></header>
        <div class="trajet"><div class="rail"></div><div class="entree" style="left:${pos(p.entree)}%"></div>${p.prix != null ? `<div class="curseur" style="left:${pos(p.prix)}%"></div>` : ''}<span class="g down">Stop ${esc(p.txt.stop)}</span><span class="d up">Objectif ${esc(p.txt.objectif)}</span></div>
        <div class="meta"><span>Entrée ${esc(p.txt.entree)}</span><span>Prix actuel ${esc(p.txt.prix)}</span><span>Depuis le ${new Date(p.depuis).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span></div>${p.equipe ? `<p class="pos-eq">${esc(p.equipe)}</p>` : ''}</button>`; }).join('')}</div>`
      : '<div class="vide"><b>Aucune position en cours.</b>Suivez un plan depuis la fiche d’un marché sur l’ordinateur : il apparaîtra ici avec sa progression entre le stop et l’objectif.</div>'}`);
}

// ---------- Marchés
function rendreMarches(e) {
  const G = [['tous', 'Tous'], ...e.groupes.map(([g, l]) => [g, l.replace('Devises, crypto et matières premières', 'Macro').replace('Actions américaines', 'États-Unis').replace('Actions françaises et européennes', 'Europe').replace('Fonds indiciels (ETF) éligibles au PEA', 'ETF PEA').replace('Mes marchés ajoutés', 'Ajoutés')])];
  set('#filtres', G.map(([k, l]) => `<button class="${S.filtre === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join(''));
  const L = e.marches.filter((m) => S.filtre === 'tous' || m.groupe === S.filtre);
  set('#chaleur', e.groupes.filter(([g]) => L.some((m) => m.groupe === g)).map(([g, l]) => `<div class="groupe">${esc(l)}</div><div class="chaleur">${L.filter((m) => m.groupe === g).map((m) => {
    const v = m.var ?? 0, a = Math.min(1, Math.abs(v) / 3) * 0.75 + 0.12;
    return `<button class="ch" data-id="${m.id}" style="background:${v >= 0 ? `rgba(34,195,160,${a.toFixed(2)})` : `rgba(255,92,108,${a.toFixed(2)})`};color:${a > 0.5 ? '#fff' : 'var(--encre)'}"><b>${esc(m.nom)}</b><span>${pct(v)}</span><small>${esc(m.px)}${['achat', 'vente'].includes(m.code) ? ' · ' + esc(m.label) : ''}</small></button>`; }).join('')}</div>`).join(''));
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

// ---------- Rendu général et navigation
function rendre() {
  const e = S.e; if (!e) return;
  $('#n-pos').textContent = e.compteurs.pos || '';
  const L = e.bandeau, html = L.map((x) => `<span class="tk"><b>${esc(x.nom)}</b>${esc(x.px)} <span class="${sens(x.var)}">${pct(x.var)}</span></span>`).join('');
  if ($('#piste')._h !== html) { $('#piste')._h = html; $('#piste').innerHTML = html + html; }
  ({ bord: rendreBord, positions: rendrePositions, marches: rendreMarches, graphique: rendreGraphique }[S.onglet])(e);
}
function onglet(o) {
  S.onglet = o; save('onglet', o);
  $$('#onglets button').forEach((b) => b.classList.toggle('on', b.dataset.o === o));
  $$('.onglet').forEach((s) => { s.hidden = s.id !== 'o-' + o; });
  if (o === 'graphique') S.cleG = null;
  rendre();
}
$('#onglets').onclick = (e) => { const b = e.target.closest('[data-o]'); if (b) onglet(b.dataset.o); };
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-aller]'); if (a) return onglet(a.dataset.aller);
  const f = e.target.closest('[data-f]'); if (f) { S.filtre = f.dataset.f; return rendre(); }
  const t = e.target.closest('#g-tf [data-tf]'); if (t) { S.tf = t.dataset.tf; S.cleG = null; return rendre(); }
  const pas = e.target.closest('[data-pas]'); if (pas && S.liste) { S.id = S.liste[(S.i + +pas.dataset.pas + S.liste.length) % S.liste.length]; S.cleG = null; return rendre(); }
  const m = e.target.closest('[data-id]'); if (m) { S.id = m.dataset.id; S.tf = 'j'; return onglet('graphique'); }
});
// plein écran et orientation (Android) ; sur iPhone, l’ajout à l’écran d’accueil donne déjà le plein écran
$('#plein').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); await screen.orientation?.lock?.('landscape').catch(() => {}); }
  } catch {}
};
if (!document.documentElement.requestFullscreen || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) $('#plein').hidden = true;
if (DISTANT) { S.tf = 'j'; $$('#g-tf [data-tf]').forEach((b) => { b.hidden = b.dataset.tf !== 'j'; }); }
onglet(S.onglet);
boucle();
