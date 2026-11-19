// ---------- Boussole 4.1 : le TABLEAU DE BORD du trader IA, le même sur l’ordinateur (onglet Dashboard) et sur l’iPhone.
// Fonction pure : elle reçoit les données préparées par l’ordinateur (donneesTableau() dans trader.js) et rend du HTML.
(function () {
  const e = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n2 = (v, d = 2) => (v == null || !isFinite(v) ? '–' : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const eu = (v, d = 2, signe = true) => (v == null || !isFinite(v) ? '–' : `${signe ? (v >= 0 ? '+' : '−') : v < 0 ? '−' : ''}${n2(Math.abs(v), d)} €`);
  const pc = (v) => (v == null || !isFinite(v) ? '–' : `${v >= 0 ? '+' : '−'}${n2(Math.abs(v), 1)} %`);
  const cl = (v) => (v >= 0 ? 'tb-up' : 'tb-down');
  const jour = (t, o = { day: 'numeric', month: 'short' }) => new Date(t).toLocaleDateString('fr-FR', o);
  const heure = (t) => new Date(t).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const nomMois = (k) => new Date(k + '-15').toLocaleDateString('fr-FR', { month: 'long' });

  // courbe de la valeur du portefeuille (SVG, s’adapte à la largeur)
  function courbe(pts, depart) {
    if (!pts || pts.length < 2) return '<p class="tb-vide">La courbe apparaît après les premiers trades.</p>';
    const W = 600, H = 150, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs);
    const lo = Math.min(depart, ...ys), hi = Math.max(depart, ...ys), pad = (hi - lo) * 0.12 || 1, y0 = lo - pad, y1 = hi + pad;
    const X = (x) => ((x - x0) / (x1 - x0 || 1)) * W, Y = (y) => H - ((y - y0) / (y1 - y0)) * H;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(''), fin = ys.at(-1), c = fin >= depart ? 'var(--tb-vert)' : 'var(--tb-rouge)';
    return `<svg class="tb-courbe" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Valeur du portefeuille : de ${n2(depart)} € à ${n2(fin)} €">
      <defs><linearGradient id="tb-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".28"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>
      <line x1="0" x2="${W}" y1="${Y(depart).toFixed(1)}" y2="${Y(depart).toFixed(1)}" class="tb-ligne0"/>
      <path d="${d}L${W},${H}L0,${H}Z" fill="url(#tb-g)"/><path d="${d}" fill="none" stroke="${c}" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>
      <div class="tb-axe"><span>${jour(x0)}</span><span>départ ${n2(depart, 0)} €</span><span>${jour(x1)}</span></div>`;
  }

  window.tableauHTML = function (d) {
    if (!d) return '<div class="tb"><p class="tb-vide">Le trader IA n’a pas encore démarré : ouvrez Boussole sur un ordinateur.</p></div>';
    const S = d.stats || {}, P = d.positions || [], O = d.objectifs || [];
    const objs = O.map((o) => `<div class="tb-obj"><div class="tb-obj-h"><b>${e(o.texte)}</b><span>avant le ${jour(o.date + 'T12:00', { day: 'numeric', month: 'long' })}</span></div>
      <div class="tb-barre"><i style="width:${Math.round(Math.max(0, Math.min(1, o.gain / o.cible)) * 100)}%"></i></div>
      <small><b class="${cl(o.gain)}">${eu(o.gain)}</b> sur +${n2(o.cible, 0)} € · ${o.atteint ? 'atteint ✓' : o.depasse ? 'date passée' : `reste ${eu(o.reste, 2, false)} en ${o.jours} jour${o.jours > 1 ? 's' : ''} de bourse`}</small></div>`).join('');
    const pos = P.map((p) => `<div class="tb-pos"><div><b>${e(p.nom)}</b><small>${eu(p.mise, 2, false)} · depuis le ${jour(p.depuis)}${p.stop ? ` · stop ${e(p.stop)}` : ' · sans stop'}</small>${p.raison ? `<small class="tb-pq">${e(p.raison)}</small>` : ''}</div><div class="tb-droite"><b class="${cl(p.eur)}">${eu(p.eur)}</b><small class="${cl(p.pct)}">${pc(p.pct)}</small></div></div>`).join('');
    const mois = (d.mois || []).map((m) => `<div class="tb-mois"><small>${nomMois(m.mois)}${m.enCours ? ' · en cours' : ''}</small><b class="${cl(m.gain)}">${eu(m.gain)}</b></div>`).join('');
    const J = (d.journal || []).map((x) => `<li class="tb-j-${e(x.type)}"><time>${heure(x.t)}</time><span>${e(x.texte)}</span></li>`).join('');
    const T = (d.trades || []).map((x) => `<tr><td>${jour(x.tFin)}</td><td><b>${e(x.nom)}</b><small>${e(x.motif)}</small></td><td class="${cl(x.eur)}">${eu(x.eur)}</td></tr>`).join('');
    return `<div class="tb">
      <section class="tb-carte tb-hero">
        <p class="tb-sur">Trader IA · 100 € virtuels depuis le ${jour(d.debut, { day: 'numeric', month: 'long' })}</p>
        <div class="tb-valeur">${n2(d.valeur)} €</div>
        <p class="tb-ligne"><b class="${cl(d.total)}">${eu(d.total)} (${pc(d.totalPct)})</b> depuis le départ · aujourd’hui <b class="${cl(d.jour)}">${eu(d.jour)}</b></p>
        ${courbe(d.courbe, d.depart)}
        <p class="tb-etat">${d.enCours ? 'Analyse en cours…' : `Prochaine décision : ${d.prochain ? heure(d.prochain) : '–'}`}${d.pilote ? ` · piloté par ${e(d.pilote)}` : ''} · mis à jour ${heure(d.t)}</p>
      </section>
      <section class="tb-carte"><h3>Objectifs</h3>${objs || '<p class="tb-vide">Aucun objectif.</p>'}</section>
      <section class="tb-carte tb-chiffres">
        <div><small>Trades terminés</small><b>${S.n || 0}</b></div><div><small>Gagnants</small><b>${S.n ? Math.round(S.gagnants / S.n * 100) + ' %' : '–'}</b></div>
        <div><small>Gain moyen</small><b class="tb-up">${S.n ? eu(S.moyG) : '–'}</b></div><div><small>Perte moyenne</small><b class="tb-down">${S.n ? eu(S.moyP) : '–'}</b></div>
        <div><small>Positions</small><b>${P.length}</b></div><div><small>Coût IA ce mois</small><b>${eu(d.coutMois, 2, false)}</b></div>
      </section>
      ${mois ? `<section class="tb-carte"><h3>Mois par mois</h3><div class="tb-mois-l">${mois}</div></section>` : ''}
      <section class="tb-carte"><h3>En portefeuille</h3>${pos || '<p class="tb-vide">Aucune position : il attend une occasion.</p>'}</section>
      ${d.derniere ? `<section class="tb-carte"><h3>Sa dernière analyse</h3><p class="tb-texte">${e(d.derniere.resume)}</p><small class="tb-gris">${heure(d.derniere.t)} · ${e(d.derniere.motif)}</small></section>` : ''}
      <section class="tb-carte"><h3>Ce qu’il a fait</h3>${J ? `<ul class="tb-journal">${J}</ul>` : '<p class="tb-vide">Rien encore.</p>'}</section>
      ${(d.lecons || []).length ? `<section class="tb-carte"><h3>Ce qu’il a appris</h3><ul class="tb-lecons">${d.lecons.map((l) => `<li>${e(l)}</li>`).join('')}</ul></section>` : ''}
      ${T ? `<section class="tb-carte"><h3>Trades terminés</h3><table class="tb-table">${T}</table></section>` : ''}
    </div>`;
  };
})();
