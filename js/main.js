/* main.js: Start-up wiring: populate lists, attach event handlers, first draw. Loaded last. */

const countryName = initCountry();

$("#field").innerHTML =
  '<option value="">Any field</option>' +
  Object.entries(FIELDS)
    .map(([i, n]) => `<option value="${i}">${n}</option>`)
    .join("");

$("#preset").innerHTML =
  '<option value="">Load an example...</option>' +
  Object.keys(PRESETS)
    .map((n) => `<option>${n}</option>`)
    .join("");

$("#preset").onchange = (e) => {
  const P = PRESETS[e.target.value];
  e.target.value = "";
  if (!P || (S.topics.some((t) => t.kw.length) && !confirm("Replace your current topics with this example?"))) return;
  Object.assign(S, {
    field: P.field,
    lastLead: P.lastLead,
    venues: [...P.venues],
    topics: structuredClone(P.topics),
  });
  save();
  fill();
};

// After you leave a keyword box, show the cleaned-up list that will actually be searched.
$("#topics").addEventListener("change", (e) => {
  const d = e.target.dataset;
  if (d.f === "kw") e.target.value = S.topics[d.i].kw.join("\n");
});

$("#topics").addEventListener("input", (e) => {
  const d = e.target.dataset;
  if (d.f == null) return;
  const t = S.topics[d.i];
  t[d.f] = d.f === "kw" ? parseKeywords(e.target.value) : d.f === "w" ? +e.target.value || 0 : e.target.value;
  save();
  if (d.f === "kw") {
    const n = S.topics[d.i].kw.length;
    e.target.parentElement.querySelector(".cnt").textContent = `${n} keyword${n === 1 ? "" : "s"}`;
  }
});

$("#topics").addEventListener("click", (e) => {
  const i = e.target.dataset.del;
  if (i != null) {
    S.topics.splice(i, 1);
    save();
    drawTopics();
  }
});

$("#add").onclick = () => {
  S.topics.push({ name: "New topic", w: 2, kw: [] });
  save();
  drawTopics();
};

$("#reset").onclick = () => {
  if (!confirm("Reset topics and settings? Your API key and email are kept.")) return;
  const keep = { apikey: $("#apikey").value, mailto: $("#mailto").value };
  S = structuredClone(DEF);
  Object.assign(S, keep);
  save();
  fill();
};

// Persist every change immediately, so nothing typed is lost (including the API key)
$("#settings").addEventListener("input", () => readForm());

fill();

$("#ufind").onclick = () => findUni().catch((e) => ($("#uinfo").textContent = e.message));

$("#uniq").addEventListener("input", () => {
  if (!$("#uniq").value.trim()) {
    S.uni = null;
    S.uniq = "";
    $("#upick").hidden = true;
    $("#uinfo").textContent = "";
    save();
  }
});

$("#tb").addEventListener("click", (e) => {
  if (e.target.closest("a")) return;
  const tr = e.target.closest("tr.r");
  if (!tr) return;
  const nx = tr.nextElementSibling;
  if (nx && nx.classList.contains("d")) {
    nx.remove();
    return;
  }
  const p = R.profs.find((x) => x.id === tr.dataset.id);
  tr.insertAdjacentHTML("afterend", explain(p));
});

document.querySelectorAll("th[data-k]").forEach(
  (h) =>
    (h.onclick = () => {
      const k = h.dataset.k;
      sortD = sortK === k ? -sortD : ["score", "np", "nl"].includes(k) ? -1 : 1;
      sortK = k;
      draw();
    }),
);

["q", "uf"].forEach((i) => ($("#" + i).oninput = draw));

$("#csv").onclick = () => {
  const c = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const t = [
    [
      "rank",
      "name",
      "university",
      "score",
      "papers",
      "last_author_papers",
      "topics",
      "topic_breakdown",
      "openalex",
      "orcid",
      "top_papers",
    ].join(","),
  ].concat(
    R.profs.map((p) =>
      [
        p.rank,
        c(p.name),
        c(p.uni),
        p.score,
        p.np,
        p.nl,
        c(p.topics.join("; ")),
        c(
          p.parts
            .filter((t) => t.n)
            .map((t) => `${t.topic} ${Math.round(t.share * 100)}%`)
            .join("; "),
        ),
        p.id,
        p.orcid,
        c(p.best.map((b) => b.title + " (" + b.year + ")").join(" | ")),
      ].join(","),
    ),
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + t.join("\n")], { type: "text/csv" }));
  a.download = "professors.csv";
  a.click();
};

$("#run").onclick = onRun;

$("#dgbtn").onclick = async () => {
  const out = $("#dgout");
  readForm();
  out.textContent = "Checking ...";
  try {
    out.textContent = (await new Diagnostics(S).run($("#dgid").value)).join("\n");
  } catch (e) {
    out.textContent = "Could not diagnose: " + e.message;
  }
};
