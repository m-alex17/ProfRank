/* openalex-client.js: every call to the OpenAlex API goes through this class. */

class OpenAlexError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status; // HTTP status, 0 for network problems
  }
}

const WORK_LIGHT = "id,title,publication_year,cited_by_count,authorships,primary_location";
// Progressively simpler field lists, in case OpenAlex rejects one of the optional fields.
const WORK_SELECTS = [
  WORK_LIGHT + ",abstract_inverted_index,topics,keywords",
  WORK_LIGHT + ",abstract_inverted_index,topics",
  WORK_LIGHT + ",abstract_inverted_index",
  WORK_LIGHT,
];

class OpenAlexClient {
  constructor({ apiKey = "", mailto = "" } = {}) {
    this.apiKey = apiKey.trim();
    this.mailto = mailto.trim();
    this.searches = 0; // text-search requests (cost $1 per 1,000)
    this.lists = 0; // plain filter requests (cost $0.10 per 1,000)
    this.selectIdx = 0;
  }

  static fromSettings(s) {
    return new OpenAlexClient({ apiKey: s.apikey || "", mailto: s.mailto || "" });
  }

  get requests() {
    return this.searches + this.lists;
  }

  get estimatedCost() {
    return this.searches * 0.001 + this.lists * 0.0001;
  }

  async getJson(path, params = {}) {
    const parts = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
    if (this.apiKey) parts.push("api_key=" + encodeURIComponent(this.apiKey));
    if (this.mailto) parts.push("mailto=" + encodeURIComponent(this.mailto));
    const url = `${API}${path}?${parts.join("&")}`;
    const isSearch = /search/.test(`${params.filter || ""}${params.search || ""}`);
    let err,
      status = 0,
      fatal = false;
    for (let i = 0; i < 4; i++) {
      try {
        isSearch ? this.searches++ : this.lists++;
        const r = await fetch(url);
        if (r.ok) return await r.json();
        status = r.status;
        err = `${r.status} ${(await r.text()).slice(0, 300)}`;
        if (r.status === 429 && /budget/i.test(err)) {
          fatal = true;
          break;
        }
        if (![429, 500, 502, 503, 504].includes(r.status)) break;
      } catch (e) {
        status = 0;
        err =
          `could not reach api.openalex.org (${e.message}). If you are viewing this inside a chat preview, ` +
          "download the file and open it directly in your browser, because previews block internet access.";
      }
      await sleep(800 * 2 ** i);
    }
    throw new OpenAlexError(
      fatal
        ? "OpenAlex daily free limit reached. Paste a free OpenAlex API key in the API key field " +
            `(openalex.org/settings/api), then run again. If you already added one, today's allowance is used up and resets at ${resetAt()} your local time (midnight UTC).`
        : err,
      status,
    );
  }

  // All works matching the filters (optionally a title+abstract text search), newest first, so that if a result set
  // is ever cut off it loses the OLDEST papers rather than the least-cited ones.
  async works(filters, { search = "", select = WORK_LIGHT, maxPages = 15 } = {}) {
    const fl = search ? [...filters, `title_and_abstract.search:${search}`] : filters;
    let cursor = "*",
      count = 0;
    const works = [];
    for (let p = 0; p < maxPages && cursor; p++) {
      const d = await this.getJson("/works", {
        filter: fl.join(","),
        per_page: 100,
        sort: "publication_date:desc",
        cursor,
        select,
      });
      if (p === 0) count = d.meta?.count ?? 0;
      works.push(...d.results);
      cursor = d.results.length ? d.meta.next_cursor : null;
      await sleep(80);
    }
    return { works, count, truncated: Math.max(0, count - works.length) };
  }

  // Same, but also asks for abstracts and OpenAlex's own topic/keyword labels (used for matching in the browser).
  async worksFull(filters, opts = {}) {
    for (; this.selectIdx < WORK_SELECTS.length; this.selectIdx++) {
      try {
        return await this.works(filters, { ...opts, select: WORK_SELECTS[this.selectIdx] });
      } catch (e) {
        if (e.status !== 400 || this.selectIdx === WORK_SELECTS.length - 1) throw e;
      }
    }
  }

  async count(filters, search = "") {
    const fl = search ? [...filters, `title_and_abstract.search:${search}`] : filters;
    const d = await this.getJson("/works", { filter: fl.join(","), per_page: 1, select: "id" });
    return d.meta?.count ?? 0;
  }

  author(id) {
    return this.getJson(`/authors/${id}`);
  }

  searchAuthors(name) {
    return this.getJson("/authors", { search: name, per_page: 15 });
  }

  searchInstitutions(q) {
    return this.getJson("/institutions", {
      search: q,
      per_page: 8,
      select: "id,display_name,country_code,type,works_count",
    });
  }
}
