/* settings-form.js: Settings form: fill/read the inputs and draw the topic editor. */

function fill() {
  for (const k of ["from", "minp", "topn", "perUni", "minScore", "maxEnrich", "mailto", "apikey", "uniq", "watch"])
    $("#" + k).value = S[k];
  if (S.uni && S.uniq)
    $("#uinfo").textContent = `Searching only: ${S.uni.name} (${S.uni.cc}). Clear the box to search the whole country.`;
  $("#country").value = countryName(S.country);
  $("#field").value = S.field;
  $("#lead").value = S.lastLead ? "1" : "0";
  $("#venues").value = S.venues.join("\n");
  $("#inst").checked = S.inst;
  $("#photos").checked = S.photos;
  $("#complete").checked = S.complete;
  drawTopics();
}

function readForm() {
  for (const k of ["mailto", "apikey", "uniq", "watch"]) S[k] = $("#" + k).value;
  for (const k of ["from", "minp", "topn", "perUni"]) S[k] = +$("#" + k).value || DEF[k];
  S.field = $("#field").value;
  S.lastLead = $("#lead").value === "1";
  S.venues = $("#venues")
    .value.split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  S.minScore = Math.max(0, +$("#minScore").value || 0);
  S.maxEnrich = +$("#maxEnrich").value || 60;
  S.inst = $("#inst").checked;
  S.photos = $("#photos").checked;
  S.complete = $("#complete").checked;
  save();
}

function drawTopics() {
  $("#topics").innerHTML = S.topics
    .map(
      (t, i) =>
        `<div class="tp card"><div class="head"><input type="text" data-i="${i}" data-f="name" value="${esc(t.name)}"><label class="wt">weight <input type="number" step="0.5" min="0" data-i="${i}" data-f="w" value="${t.w}" style="width:64px"></label><button class="del" data-del="${i}" title="Remove topic" aria-label="Remove topic">×</button></div><textarea rows="6" placeholder="one keyword or phrase per line" data-i="${i}" data-f="kw">${esc(t.kw.join("\n"))}</textarea><small class="cnt">${t.kw.length} keyword${t.kw.length === 1 ? "" : "s"}</small></div>`,
    )
    .join("");
}
