/* scorer.js: Turns papers into researcher profiles and scores them. */

let VB = null;

const pweight = (p, yr) =>
  0.5 ** (Math.max(0, yr - (p.year || yr)) / 4) *
  (1 + 0.15 * Math.log1p(p.cites || 0)) *
  (S.lastLead ? ({ first: 1, middle: 0.85, last: 1.25 }[p.pos] ?? 1) : 1) *
  (VB && VB.test(p.venue || "") ? 1.25 : 1);

let UNAME = null;

function collect(W, H, cc, forced, U, cands, EV) {
  const types = new Set(["education", ...(S.inst ? ["facility", "nonprofit", "other", "government"] : [])]),
    A = {};
  for (const w of Object.values(W)) {
    const venue = w.primary_location?.source?.display_name || "",
      k = key(w.title);
    for (const a of w.authorships || []) {
      const id = a.author?.id;
      if (!id) continue;
      const f = forced[id],
        ins = (a.institutions || []).filter((i) => (U ? inU(i, U) : i.country_code === cc && types.has(i.type)));
      if (!ins.length && !f && !(cands && cands.has(id))) continue;
      const o = (A[id] ??= {
        id,
        name: a.author.display_name,
        orcid: (a.author.orcid || "").replace("https://orcid.org/", ""),
        papers: {},
        inst: {},
        watch: !!f,
        fi: f?.inst ?? cands?.get(id),
      });
      ins.forEach((i) => (o.inst[UNAME || i.display_name] = (o.inst[UNAME || i.display_name] || 0) + 1));
      const q = o.papers[k];
      if (q) {
        H[w.id].forEach((t) => q.topics.add(t));
        if (EV?.[w.id]) q.ev = { ...EV[w.id], ...q.ev };
        continue;
      }
      o.papers[k] = {
        title: w.title || "",
        year: w.publication_year,
        venue,
        pos: a.author_position,
        cites: w.cited_by_count || 0,
        topics: new Set(H[w.id]),
        ev: EV?.[w.id], // topic -> where it matched (title, abstract, OpenAlex topic ...)
      };
    }
  }
  return A;
}

// ---------- scoring ----------
function finalize(A, topics, ids) {
  const yr = new Date().getFullYear(),
    tw = Object.fromEntries(topics.map((t) => [t.name, t.w])),
    profs = [];
  for (const o of Object.values(A)) {
    if (ids && !ids.has(o.id)) continue;
    const ps = Object.values(o.papers).filter((p) => p.topics.size);
    if (!ids && ps.length < S.minp && !o.watch) continue;
    ps.forEach((p) => (p.w = pweight(p, yr)));
    const pt = {};
    ps.forEach((p) => p.topics.forEach((t) => (pt[t] = (pt[t] || 0) + p.w)));
    const ie = Object.entries(o.inst).sort((a, b) => b[1] - a[1])[0];
    // contribution of each topic = topic weight x sqrt(sum of its paper weights)
    const contrib = Object.fromEntries(Object.entries(tw).map(([t, w]) => [t, (w || 0) * Math.sqrt(pt[t] || 0)]));
    const raw = Object.values(contrib).reduce((s, v) => s + v, 0);
    profs.push({
      id: o.id,
      name: o.name,
      orcid: o.orcid,
      uni: UNAME || (ie ? ie[0] : o.fi || "?"),
      raw,
      np: ps.length,
      nl: ps.filter((p) => p.pos === "last").length,
      watch: o.watch,
      topics: Object.entries(pt)
        .sort((a, b) => b[1] - a[1])
        .map((x) => x[0]),
      // per-topic evidence for the "Why this score?" panel
      parts: Object.entries(contrib)
        .map(([t, c]) => {
          const mine = ps.filter((p) => p.topics.has(t));
          return {
            topic: t,
            weight: tw[t],
            share: raw ? c / raw : 0,
            n: mine.length,
            papers: mine.sort((a, b) => b.w - a.w).slice(0, 2),
          };
        })
        .sort((a, b) => b.share - a.share),
      best: [...ps].sort((a, b) => b.w * b.topics.size - a.w * a.topics.size).slice(0, 4),
    });
  }
  const top = Math.max(...profs.map((p) => p.raw), 1e-9);
  profs.forEach((p) => (p.score = +((100 * p.raw) / top).toFixed(1)));
  profs.sort((a, b) => b.score - a.score);
  profs.forEach((p, i) => (p.rank = i + 1));
  const by = {};
  profs.forEach((p) => (by[p.uni] ??= []).push(p));
  return {
    profs,
    unis: Object.entries(by)
      .map(([u, ps]) => ({
        u,
        ps,
        n: ps.length,
        score: +ps
          .slice(0, 5)
          .reduce((s, p) => s + p.score, 0)
          .toFixed(1),
      }))
      .sort((a, b) => b.score - a.score),
  };
}
