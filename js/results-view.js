/* results-view.js: Results: university cards, researcher table, score explanation, photos, CSV. */

// ---------- results ----------
const gl = (p) => `https://www.google.com/search?q=${encodeURIComponent(p.name + " " + p.uni + " professor")}`;

// ---------- profile photos ----------
// Photos come only from Wikidata, matched by ORCID iD (exact match, never by name).
// Most researchers have no photo there, so a coloured initials avatar is the normal case.
const initials = (n) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .filter((c, i, a) => i === 0 || i === a.length - 1)
    .join("")
    .toUpperCase();

const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

const photoImg = (ph) => `<img src="${esc(ph.src)}" alt="" loading="lazy" onerror="this.remove()" />`;

const gi = (p) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(p.name + " " + p.uni)}`;

const avatar = (p) =>
  `<a class="av" href="${esc(gi(p))}" target="_blank" rel="noopener" title="Find photos of ${esc(p.name)} (opens an image search)" data-id="${esc(p.id)}" style="background:hsl(${hue(p.name)} 50% 42%)">${esc(initials(p.name))}${p.photo ? photoImg(p.photo) : ""}</a>`;

async function loadPhotos(profs) {
  const byOrcid = {};
  profs.filter((p) => /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(p.orcid)).forEach((p) => (byOrcid[p.orcid] ??= []).push(p));
  const ids = Object.keys(byOrcid);
  let found = 0;
  for (let i = 0; i < ids.length; i += 60) {
    const list = ids
      .slice(i, i + 60)
      .map((x) => `"${x}"`)
      .join(" ");
    const q = `SELECT ?orcid ?img WHERE { VALUES ?orcid { ${list} } ?p wdt:P496 ?orcid . ?p wdt:P18 ?img . }`;
    const res = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q));
    if (!res.ok) throw new Error("Wikidata answered HTTP " + res.status);
    for (const b of (await res.json()).results.bindings) {
      const file = b.img.value.split("/").pop(); // already URL-encoded
      for (const p of byOrcid[b.orcid.value] || []) {
        if (p.photo) continue;
        p.photo = {
          src: `https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=96`,
          page: `https://commons.wikimedia.org/wiki/File:${file}`,
        };
        found++;
        document
          .querySelectorAll(`.av[data-id="${CSS.escape(p.id)}"]`)
          .forEach((el) => el.insertAdjacentHTML("beforeend", photoImg(p.photo)));
      }
    }
  }
  return found;
}

// "Why this score?" panel shown when a result row is expanded
function explain(p) {
  const pct = (x) => Math.round(x * 100);
  const paper = (b, topic) =>
    `<li>${esc(b.title)} <small>(${b.year}${b.venue ? ", " + esc(b.venue) : ""}${b.pos === "last" ? ", last author" : ""})</small>` +
    (b.ev?.[topic] ? `<br><small class="ev">matched ${esc(b.ev[topic])}</small>` : "") +
    "</li>";
  const rows = p.parts
    .map((t) =>
      t.n
        ? `<div class="why-t"><div><b>${esc(t.topic)}</b> <small>weight ${t.weight} · ${t.n} paper${t.n === 1 ? "" : "s"}</small></div>
                 <div class="why-bar"><i style="width:${pct(t.share)}%"></i><span>${pct(t.share)}%</span></div>
                 <ul>${t.papers.map((b) => paper(b, t.topic)).join("")}</ul></div>`
        : `<div class="why-t none"><div><b>${esc(t.topic)}</b> <small>weight ${t.weight}</small></div><div class="mut">No matching papers found</div></div>`,
    )
    .join("");
  return `<tr class="d"><td></td><td colspan="6"><div class="why">
          <div class="why-h">Why <b>${p.score}</b>? <small>Relative to the best match in this run (100), not a percentage. Each bar is that topic's share of this person's score.</small></div>
          ${rows}<a href="${esc(gl(p))}" target="_blank" rel="noopener">Find their university page ↗</a> · <a href="${esc(gi(p))}" target="_blank" rel="noopener">Find photos ↗</a>
          ${p.orcid ? ` · <a href="https://orcid.org/${esc(p.orcid)}" target="_blank" rel="noopener">ORCID ↗</a>` : ""}
          ${p.photo ? `<br><small>Photo: <a href="${esc(p.photo.page)}" target="_blank" rel="noopener">Wikimedia Commons ↗</a> (from Wikidata, matched by ORCID)</small>` : ""}</div></td></tr>`;
}

function render() {
  $("#out").hidden = false;
  $("#stats").innerHTML =
    `<span><b>${R.profs.length}</b> researchers</span><span><b>${R.unis.length}</b> universities</span><span>${S.uniq ? esc(S.uniq) : esc(countryName(S.country))}</span>`;
  const mx = Math.max(...R.unis.map((u) => u.score), 1);
  $("#unis").innerHTML =
    R.unis
      .slice(0, S.topn)
      .map(
        (u, i) =>
          `<div class="card u"><h3><span class="rk">${i + 1}</span>${esc(u.u)}</h3><div class="sc"><i style="width:${(100 * u.score) / mx}%"></i></div><small>${u.n} matching researchers · university score ${u.score}</small><ol>${u.ps
            .slice(0, S.perUni)
            .map(
              (p) =>
                `<li>${avatar(p)}<a href="${esc(p.id)}" target="_blank" rel="noopener">${esc(p.name)}</a> <span class="pill">${p.score}</span>${p.watch ? '<span class="tag">watchlist</span>' : ""} <a href="${esc(gl(p))}" target="_blank" rel="noopener" title="Find their page">↗</a><br><small>${esc(p.topics.slice(0, 3).join(", "))}</small></li>`,
            )
            .join("")}</ol></div>`,
      )
      .join("") || '<p class="mut">No matches. Try an earlier year, fewer constraints or more keywords.</p>';
  $("#uf").innerHTML =
    '<option value="">All universities</option>' + R.unis.map((u) => `<option>${esc(u.u)}</option>`).join("");
  draw();
  if (S.photos)
    loadPhotos(R.profs)
      .then(
        (n) => ($("#log").textContent += `Photos: ${n} found on Wikidata (matched by ORCID), initials for the rest\n`),
      )
      .catch((e) => ($("#log").textContent += `Photos skipped (${e.message}); showing initials\n`));
  $("#out").scrollIntoView({ behavior: "smooth", block: "start" }); // after content exists, so the target position is right
}

function draw() {
  const q = $("#q").value.toLowerCase(),
    uf = $("#uf").value;
  const rows = R.profs
    .filter(
      (p) =>
        (!uf || p.uni === uf) &&
        (!q || (p.name + p.uni + p.topics.join(" ") + p.best.map((b) => b.title).join(" ")).toLowerCase().includes(q)),
    )
    .sort((a, b) => (a[sortK] > b[sortK] ? 1 : a[sortK] < b[sortK] ? -1 : 0) * sortD);
  $("#tb").innerHTML = rows
    .map(
      (p) =>
        `<tr class="r" data-id="${esc(p.id)}"><td>${p.rank}</td><td><div class="nm">${avatar(p)}<span><a href="${esc(p.id)}" target="_blank" rel="noopener">${esc(p.name)}</a>${p.watch ? '<span class="tag">watchlist</span>' : ""}</span></div></td><td>${esc(p.uni)}</td><td><div class="sbar"><i style="width:${p.score}%"></i><b>${p.score}</b></div></td><td>${p.np}</td><td>${p.nl}</td><td><small>${esc(p.topics.join(", "))}</small></td></tr>`,
    )
    .join("");
}
