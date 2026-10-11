/* university-picker.js: Single-university lookup. */

const inU = (i, U) => !!i && (i.lineage || []).concat(i.id).includes(U.id);

async function findUni() {
  const q = $("#uniq").value.trim();
  S.uniq = q;
  if (!q) {
    S.uni = null;
    $("#upick").hidden = true;
    $("#uinfo").textContent = "";
    save();
    return;
  }
  $("#uinfo").textContent = "Searching ...";
  const d = await OpenAlexClient.fromSettings(S).searchInstitutions(q.replace(/\s*\(.*?\)\s*/g, " ").trim() || q),
    r = d.results || [];
  if (!r.length) {
    S.uni = null;
    save();
    $("#uinfo").textContent = "No institution found. Try the English name or fewer words.";
    throw new Error(`No institution found for "${q}".`);
  }
  const pk = $("#upick");
  pk.innerHTML = r
    .map(
      (x, i) =>
        `<option value="${i}">${esc(x.display_name)} (${x.country_code || "?"}, ${(x.works_count || 0).toLocaleString()} papers)</option>`,
    )
    .join("");
  pk.hidden = false;
  const set = (i) => {
    const x = r[i];
    S.uni = { id: x.id, name: x.display_name, cc: x.country_code, q };
    save();
    $("#uinfo").textContent =
      `Searching only: ${x.display_name} (${x.country_code}). Clear the box to search the whole country.`;
  };
  pk.onchange = () => set(+pk.value);
  set(0);
}
