/* keyword-matcher.js: keyword handling.
 *  - Stage 1 uses toQuery()/queryChunks() to build a broad OpenAlex search ("all these words").
 *  - Stage 2 uses match() to decide, in the browser, which of your topics a paper belongs to. It looks at the title,
 *    the abstract and OpenAlex's own topic and keyword labels, and records WHY a paper matched.
 */

const STOPWORDS = new Set("a an and or not of for the in on to with by from via using at as is are".split(" "));
// OpenAlex drops these words from searches, so they must not appear inside AND queries.
const QUERY_STOP = new Set([
  ...STOPWORDS,
  ..."be but if into it no such that their then there these they this was will".split(" "),
]);
const ALIAS = { applica: "app", applic: "app" }; // application(s) = app(s)

class KeywordMatcher {
  // One keyword per line, or separated by commas / semicolons, with optional bullets or numbering.
  static parse(text) {
    return [
      ...new Set(
        String(text)
          .split(/[\n;,]+/)
          .map((x) => x.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, "").trim())
          .filter(Boolean),
      ),
    ];
  }

  static words(text) {
    return String(text)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
  }

  // Light stemmer: plurals, -ing, -ed, then cut long words to 7 letters so that efficient/efficiency,
  // sustainable/sustainability and generate/generation meet.
  static stem(word) {
    let w = word.toLowerCase();
    if (w.length > 4 && w.endsWith("ies")) w = w.slice(0, -3) + "y";
    else if (w.length > 4 && /(ss|x|z|ch|sh)es$/.test(w)) w = w.slice(0, -2);
    else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
    if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
    else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
    if (w.length > 7) w = w.slice(0, 7);
    return ALIAS[w] || w;
  }

  // Short ALL-CAPS words (IT, AI, GUI) must match capitalised text, so "IT" does not match the word "it".
  static isAcronym(w) {
    return w.length <= 5 && w === w.toUpperCase() && /\p{L}/u.test(w);
  }

  static tokenize(text) {
    return KeywordMatcher.words(text)
      .filter((w) => !STOPWORDS.has(w.toLowerCase()))
      .map((w) => ({ n: KeywordMatcher.stem(w), up: KeywordMatcher.isAcronym(w) }));
  }

  static abstractText(inv) {
    if (!inv) return "";
    const out = [];
    for (const [w, ps] of Object.entries(inv)) for (const p of ps) out[p] = w;
    return out.join(" ");
  }

  // ---- stage 1: OpenAlex query ----
  // mode "and": every word somewhere in title/abstract. mode "phrase": the words side by side, as one phrase.
  static toQuery(kw, mode = "and") {
    const exact = /^\s*".+"\s*$/.test(kw);
    const ws = KeywordMatcher.words(kw)
      .map((w) => w.toLowerCase())
      .filter((w) => !QUERY_STOP.has(w));
    if (!ws.length) return "";
    if (ws.length === 1) return ws[0];
    return exact || mode === "phrase" ? `"${ws.join(" ")}"` : `(${ws.join(" AND ")})`;
  }

  // OpenAlex limits a URL to about 4 KB, so long keyword lists are split into several queries.
  static queryChunks(kws, mode = "and") {
    const parts = kws.map((k) => KeywordMatcher.toQuery(k, mode)).filter(Boolean),
      out = [];
    let cur = [];
    for (const x of parts) {
      if (cur.length && cur.join(" OR ").length + x.length > 2200) {
        out.push(cur);
        cur = [];
      }
      cur.push(x);
    }
    if (cur.length) out.push(cur);
    return out.map((c) => "(" + c.join(" OR ") + ")");
  }

  // ---- stage 2: matching in the browser ----
  static compile(raw) {
    const words = KeywordMatcher.words(raw)
      .filter((w) => !STOPWORDS.has(w.toLowerCase()))
      .map((w) => ({ n: KeywordMatcher.stem(w), acr: KeywordMatcher.isAcronym(w) }));
    if (!words.length) return null;
    return { raw: raw.replace(/^\s*"|"\s*$/g, "").trim(), exact: /^\s*".+"\s*$/.test(raw), words };
  }

  constructor(topics) {
    this.topics = topics.map((t) => ({
      name: t.name,
      kws: t.kw.map(KeywordMatcher.compile).filter(Boolean),
    }));
  }

  // Does keyword `kw` occur in this token list? Words must be near each other (or adjacent for "quoted" keywords),
  // except in short labels where it is enough that all words appear.
  static occurs(kw, toks, loose) {
    const ws = kw.words;
    const pos = ws.map((w) => {
      const p = [];
      toks.forEach((t, i) => t.n === w.n && (!w.acr || t.up) && p.push(i));
      return p;
    });
    if (pos.some((p) => !p.length)) return false;
    if (ws.length === 1 || loose) return true;
    if (kw.exact) return pos[0].some((s) => ws.every((w, k) => toks[s + k]?.n === w.n && (!w.acr || toks[s + k].up)));
    const radius = ws.length * 3 + 3;
    return pos[0].some((a) => pos.every((p) => p.some((b) => Math.abs(a - b) <= radius)));
  }

  units(work) {
    const u = [{ where: "title", rank: 0, toks: KeywordMatcher.tokenize(work.title || "") }];
    const abs = KeywordMatcher.abstractText(work.abstract_inverted_index);
    if (abs) u.push({ where: "abstract", rank: 1, toks: KeywordMatcher.tokenize(abs) });
    for (const t of work.topics || [])
      u.push({
        where: `OpenAlex topic "${t.display_name}"`,
        rank: 2,
        loose: true,
        toks: KeywordMatcher.tokenize(t.display_name || ""),
      });
    for (const k of work.keywords || [])
      u.push({
        where: `OpenAlex keyword "${k.display_name}"`,
        rank: 3,
        loose: true,
        toks: KeywordMatcher.tokenize(k.display_name || ""),
      });
    return u;
  }

  // -> Map(topic name -> short evidence text), only for topics the paper matches.
  match(work) {
    const units = this.units(work),
      best = new Map();
    for (const t of this.topics)
      for (const kw of t.kws)
        for (const u of units)
          if (KeywordMatcher.occurs(kw, u.toks, u.loose)) {
            if (!best.has(t.name) || u.rank < best.get(t.name).rank)
              best.set(t.name, { rank: u.rank, text: `"${kw.raw}" in ${u.where}` });
            break;
          }
    return new Map([...best].map(([k, v]) => [k, v.text]));
  }
}

const parseKeywords = (text) => KeywordMatcher.parse(text);
