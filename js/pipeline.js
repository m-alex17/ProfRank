/* pipeline.js: what happens when you press Run.
 *   Stage 1  find researchers: OpenAlex text search per topic, for the chosen country / university.
 *   Stage 2  complete their lists: fetch ALL papers of the best candidates and match your topics in the browser.
 *   Rank     score, filter, sort.
 * The Pipeline class only talks to OpenAlex and reports through ui.log / ui.progress; onRun() below is the DOM glue.
 */

// Query forms tried in order; if OpenAlex rejects one (HTTP 400) we step down to the next and keep using it for the run.
const SEARCH_FORMS = [
  { mode: "and", field: "topics.field.id" },
  { mode: "and", field: "primary_topic.field.id" },
  { mode: "and", field: "" },
  { mode: "phrase", field: "topics.field.id" },
  { mode: "phrase", field: "primary_topic.field.id" },
  { mode: "phrase", field: "" },
];
const shortId = (id) => id.split("/").pop();

class Pipeline {
  constructor(settings, ui) {
    this.s = settings;
    this.ui = ui;
    this.client = OpenAlexClient.fromSettings(settings);
    this.formIdx = 0;
    this.queryShown = {};
  }

  async run() {
    const { s, ui } = this;
    const topics = s.topics.filter((t) => t.kw.length && t.w > 0);
    if (!topics.length) throw new Error("Add at least one topic with keywords, or load an example.");
    const { cc, U } = await this.resolvePlace();
    const forced = await this.resolveWatch(cc, U);
    const place = U
      ? `authorships.institutions.lineage:${shortId(U.id)}`
      : `authorships.institutions.country_code:${cc}`;
    const when = `from_publication_date:${s.from}-01-01`;

    // ---- Stage 1: who publishes on these topics here?
    ui.log("Stage 1: finding researchers ...");
    const W = {},
      H = {};
    for (const [i, t] of topics.entries()) {
      const r = await this.searchTopic(t, [place, when]);
      r.works.forEach((w) => {
        W[w.id] = w;
        (H[w.id] ??= new Set()).add(t.name);
      });
      this.logTopic(t.name, r);
      ui.progress((i + 1) / (topics.length + 2));
    }
    const A1 = collect(W, H, cc, forced, U, null),
      R1 = finalize(A1, topics, new Set(Object.keys(A1)));
    const poolSize = Math.round(Math.min(200, Math.max(80, s.maxEnrich * 1.5)));
    const forcedIds = Object.keys(forced),
      cands = new Map(forcedIds.map((id) => [id, forced[id].inst]));
    for (const p of R1.profs) {
      if (cands.size >= poolSize + forcedIds.length) break;
      if (!cands.has(p.id)) cands.set(p.id, p.uni);
    }
    ui.log(`Stage 1 found ${R1.profs.length} researchers; ${cands.size} go on to stage 2.`);

    // ---- Stage 2: every paper of every candidate, matched here in the browser
    let A2,
      examined = {};
    if (s.complete) {
      ({ A2, examined } = await this.complete(cands, topics, when, cc, forced, U));
    } else {
      A2 = collect(W, H, cc, forced, U, cands);
    }
    const R2 = finalize(A2, topics, new Set(cands.keys())),
      keep = [
        ...R2.profs.filter((p) => p.watch),
        ...R2.profs.filter((p) => !p.watch && p.np >= s.minp && p.score >= s.minScore),
      ].slice(0, Math.max(s.maxEnrich, Object.keys(forced).length));
    ui.log(
      `${keep.length} researchers kept (score >= ${s.minScore}, at least ${s.minp} paper(s), max ${s.maxEnrich}).`,
    );
    for (const id of Object.keys(forced)) {
      const p = R2.profs.find((x) => x.id === id);
      ui.log(
        `Check ${forced[id].name}: ` +
          (examined[id] !== undefined ? `examined ${examined[id]} papers since ${s.from}; ` : "") +
          (p && p.np
            ? `${p.np} match your topics (${p.parts
                .filter((x) => x.n)
                .map((x) => `${x.topic} ${x.n}`)
                .join(", ")}).`
            : `none match your topics. Use "Why isn't someone found?" below to see why.`),
      );
    }
    return finalize(A2, topics, new Set(keep.map((p) => p.id)));
  }

  async resolvePlace() {
    const { s, ui } = this;
    if (!s.uniq) return { cc: s.country, U: null };
    if (!s.uni || s.uni.q !== s.uniq) await findUni();
    ui.log(`Only searching ${s.uni.name} (${s.uni.cc}), including its faculties and institutes`);
    UNAME = s.uni.name;
    return { cc: s.uni.cc, U: s.uni };
  }

  // One entry per line: a name (searched; must currently work in the chosen place) or an OpenAlex author id / URL (exact).
  async resolveWatch(cc, U) {
    const { s, ui, client } = this,
      forced = {};
    for (const line of s.watch
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)) {
      try {
        const idm = line.match(/\bA\d{6,}\b/i);
        let a;
        if (idm) a = await client.author(idm[0].toUpperCase());
        else {
          const d = await client.searchAuthors(line);
          const hit = d.results
            .map((x) => {
              const ins =
                (x.last_known_institutions?.length
                  ? x.last_known_institutions
                  : (x.affiliations || []).slice(0, 1).map((y) => y.institution)) || [];
              return { x, ins: ins.find((i) => i && (U ? inU(i, U) : i.country_code === cc)) };
            })
            .filter((h) => h.ins)
            .sort((p, q) => q.x.works_count - p.x.works_count)[0];
          if (!hit) {
            ui.log(
              `Watchlist: nobody named "${line}" is currently affiliated in ${cc}. Check the spelling, or paste their OpenAlex author id or URL instead.`,
            );
            continue;
          }
          a = hit.x;
        }
        const ins = (a.last_known_institutions || [])[0] || (a.affiliations || [])[0]?.institution;
        forced[a.id] = { name: a.display_name, inst: ins?.display_name || "unknown institution", works: a.works_count };
        ui.log(
          `Watchlist: ${line} -> ${a.display_name} @ ${forced[a.id].inst} (OpenAlex lists ${a.works_count} works for this profile)`,
        );
      } catch (e) {
        ui.log(`Watchlist lookup failed for ${line}: ${e.message}`);
      }
    }
    return forced;
  }

  // Stage 1 search for one topic.
  async searchTopic(topic, filters) {
    for (; this.formIdx < SEARCH_FORMS.length; this.formIdx++) {
      const { mode, field } = SEARCH_FORMS[this.formIdx],
        fl = [...filters, ...(this.s.field && field ? [`${field}:${this.s.field}`] : [])];
      try {
        const chunks = KeywordMatcher.queryChunks(topic.kw, mode);
        if (!chunks.length) throw new Error(`Topic "${topic.name}" has no usable keywords.`);
        const found = {};
        let total = 0,
          truncated = 0;
        for (const ch of chunks) {
          const r = await this.client.works(fl, { search: ch });
          r.works.forEach((w) => (found[w.id] = w));
          total += r.count;
          truncated += r.truncated;
          if (!this.queryShown[topic.name]) {
            this.queryShown[topic.name] = true;
            this.ui.log(`  query: ${ch.slice(0, 260)}${ch.length > 260 ? " ..." : ""}`);
          }
        }
        return { works: Object.values(found), total, truncated };
      } catch (e) {
        if (e.status !== 400 || this.formIdx === SEARCH_FORMS.length - 1) throw e;
        this.ui.log(`  OpenAlex rejected that query form (${e.message.slice(0, 100)}); trying a simpler one`);
      }
    }
  }

  logTopic(name, r) {
    const hint = !r.works.length && this.s.field ? "  (try Research field = Any field)" : "";
    const warn = r.truncated
      ? `  WARNING: ${r.truncated} older papers were not fetched. Use a later start year or more specific keywords.`
      : "";
    this.ui.log(`${name}: ${r.works.length} papers${hint}${warn}`);
  }

  async complete(cands, topics, when, cc, forced, U) {
    const { ui } = this,
      matcher = new KeywordMatcher(topics),
      ids = [...cands.keys()].map(shortId),
      W2 = {},
      H2 = {},
      EV = {},
      examined = {},
      batches = Math.ceil(ids.length / 40);
    ui.log("Stage 2: fetching every candidate's papers and matching your topics here ...");
    let seen = new Set(),
      matched = 0;
    for (let b = 0; b < batches; b++) {
      const batch = ids.slice(b * 40, b * 40 + 40);
      const r = await this.client.worksFull([`authorships.author.id:${batch.join("|")}`, when], { maxPages: 40 });
      for (const w of r.works) {
        for (const a of w.authorships || [])
          if (cands.has(a.author?.id)) examined[a.author.id] = (examined[a.author.id] || 0) + 1;
        if (seen.has(w.id)) continue;
        seen.add(w.id);
        const m = matcher.match(w);
        if (!m.size) continue;
        matched++;
        W2[w.id] = w;
        H2[w.id] = new Set(m.keys());
        EV[w.id] = Object.fromEntries(m);
      }
      ui.progress(((topics.length + b + 1) / (topics.length + batches + 1)) * 0.98);
    }
    ui.log(`Stage 2 examined ${seen.size} papers; ${matched} match at least one of your topics.`);
    return { A2: collect(W2, H2, cc, forced, U, cands, EV), examined };
  }
}

// DOM glue for the Run button.
async function onRun() {
  readForm();
  UNAME = null;
  VB = S.venues.length
    ? new RegExp(S.venues.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i")
    : null;
  $("#run").disabled = true;
  $("#log").textContent = "";
  $("#log").classList.remove("err");
  $("#out").hidden = true;
  prog(0);
  try {
    const pipe = new Pipeline(S, { log, progress: prog });
    R = await pipe.run();
    render();
    prog(1);
    log(
      `Done: ${R.profs.length} researchers ranked. OpenAlex requests used: ${pipe.client.requests} ` +
        `(about $${pipe.client.estimatedCost.toFixed(3)} of your free $1 per day).`,
    );
  } catch (e) {
    log("ERROR: " + e.message);
    $("#log").classList.add("err");
  }
  $("#run").disabled = false;
}
