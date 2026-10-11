/* diagnostics.js: "Why isn't this person found?"
 * Looks at ONE researcher's real OpenAlex record and reports, step by step, what your settings would do with it. */

class Diagnostics {
  constructor(settings) {
    this.s = settings;
    this.client = OpenAlexClient.fromSettings(settings);
  }

  async run(input) {
    const { s, client } = this,
      m = String(input).match(/\bA\d{6,}\b/i);
    if (!m)
      throw new Error("Paste an OpenAlex author id or profile URL, e.g. https://openalex.org/authors/A5012345678");
    const id = m[0].toUpperCase(),
      topics = s.topics.filter((t) => t.kw.length && t.w > 0);
    if (!topics.length) throw new Error("Add at least one topic with keywords first.");
    const a = await client.author(id),
      matcher = new KeywordMatcher(topics),
      { works, count } = await client.worksFull([`authorships.author.id:${id}`], { maxPages: 8 });
    const place = s.uni ? { cc: s.uni.cc, name: s.uni.name } : { cc: s.country, name: countryName(s.country) };
    const L = [];
    const ins = (a.last_known_institutions || [])[0] || (a.affiliations || [])[0]?.institution;
    L.push(`${a.display_name} (${id}), ${ins?.display_name || "no institution listed"}`);
    L.push(
      `OpenAlex lists ${a.works_count} works for this profile; fetched ${works.length}${works.length < count ? " (newest first)" : ""}.`,
    );

    // 1. years
    const years = works.map((w) => w.publication_year).filter(Boolean),
      since = works.filter((w) => w.publication_year >= s.from).length;
    L.push(
      `Years: ${Math.min(...years)} to ${Math.max(...years)}. Since ${s.from} (your setting): ${since} works; older: ${works.length - since}.`,
    );

    // 2. this person's OWN affiliation on each paper
    const aff = {};
    const mine = (w) => (w.authorships || []).find((x) => shortId(x.author?.id || "") === id);
    for (const w of works) {
      const ins2 = mine(w)?.institutions || [];
      const label = ins2.length
        ? ins2.map((i) => `${i.display_name} [${i.country_code}]`).join(" / ")
        : "(no affiliation listed on the paper)";
      aff[label] = (aff[label] || 0) + 1;
    }
    L.push("Affiliation OpenAlex lists for this person on those papers:");
    Object.entries(aff)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 5)
      .forEach(([k, v]) => L.push(`   ${v} x ${k}`));

    // 3. which papers match which topic (title, abstract, OpenAlex topic/keyword labels)
    const per = {};
    let ownLocalMatching = 0;
    for (const w of works) {
      const mt2 = matcher.match(w);
      if (!mt2.size) continue;
      const isNew = w.publication_year >= s.from,
        own = (mine(w)?.institutions || []).some((i) => i.country_code === place.cc);
      if (own && isNew) ownLocalMatching++;
      for (const [t, ev] of mt2) {
        const e = (per[t] ??= { since: 0, older: 0, ex: [] });
        isNew ? e.since++ : e.older++;
        if (e.ex.length < 3) e.ex.push(`      - ${w.title} (${w.publication_year}) -> matched ${ev}`);
      }
    }
    L.push(`Papers matching your topics (since ${s.from} / older):`);
    for (const t of topics) {
      const e = per[t.name] || { since: 0, older: 0, ex: [] };
      L.push(`   ${t.name}: ${e.since} / ${e.older}`);
      L.push(...e.ex);
    }

    // 4. would the main search find this person at all?
    L.push(`Would stage 1 discover this person in ${place.name}?`);
    L.push(
      `   Matching papers since ${s.from} where OpenAlex lists a ${place.cc} affiliation for them: ${ownLocalMatching}`,
    );
    const place2 = s.uni
      ? `authorships.institutions.lineage:${shortId(s.uni.id)}`
      : `authorships.institutions.country_code:${place.cc}`;
    let searchHits = 0;
    for (const t of topics) {
      const base = [
        `authorships.author.id:${id}`,
        place2,
        `from_publication_date:${s.from}-01-01`,
        ...(s.field ? [`topics.field.id:${s.field}`] : []),
      ];
      for (const ch of KeywordMatcher.queryChunks(t.kw)) {
        try {
          searchHits += await client.count(base, ch);
        } catch (e) {
          L.push(`   (search check skipped: ${e.message.slice(0, 80)})`);
          break;
        }
      }
    }
    L.push(`   Papers OpenAlex's own search returns for them here with your filters: ${searchHits}`);

    // 5. verdict
    const totalSince = Object.values(per).reduce((n, e) => n + e.since, 0),
      totalOlder = Object.values(per).reduce((n, e) => n + e.older, 0);
    let v;
    if (!totalSince && !totalOlder)
      v =
        "No paper matched your keywords (checked title, abstract and OpenAlex's own topic and keyword labels). Add the wording this person actually uses in their titles.";
    else if (!totalSince) v = `All ${totalOlder} matching papers are older than ${s.from}. Lower "Papers since year".`;
    else if (!ownLocalMatching)
      v = `OpenAlex lists no ${place.cc} affiliation for this person on any matching paper, so the country-wide search cannot discover them. Put them in "Always check these people" and they will always be included.`;
    else if (!searchHits)
      v = `OpenAlex's own search does not return their papers with your filters. Try Research field = Any field, or add keyword variants.`;
    else
      v = `They should be found. If they are missing from the list, their score is below "Min. score" or beyond "Max researchers to keep"; add them to the watchlist to force them in.`;
    L.push("", "Verdict: " + v);
    L.push(`(requests used: ${client.requests})`);
    return L;
  }
}
