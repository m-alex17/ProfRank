/* country-picker.js: Searchable, alphabetical country picker. */

// ---------- form ----------
// Searchable, alphabetical country picker (keyboard: arrows, Enter, Esc)
function initCountry() {
  const inp = $("#country"),
    list = $("#clist");
  const sorted = [...COUNTRIES].sort((a, b) => a[1].localeCompare(b[1]));
  const name = (c) => (COUNTRIES.find((x) => x[0] === c) || [])[1] || "";
  let shown = [],
    idx = 0;
  const mark = () => {
    [...list.children].forEach((li, i) => li.classList.toggle("on", i === idx));
    list.children[idx]?.scrollIntoView({ block: "nearest" });
  };
  const open = (q) => {
    const t = q.trim().toLowerCase();
    shown = sorted.filter(([c, n]) => !t || n.toLowerCase().includes(t) || c.toLowerCase() === t);
    // while searching, names that start with the text come first
    if (t) shown.sort((a, b) => b[1].toLowerCase().startsWith(t) - a[1].toLowerCase().startsWith(t));
    idx = Math.max(
      0,
      shown.findIndex((x) => x[0] === S.country && !t),
    );
    list.innerHTML =
      shown.map(([c, n, r]) => `<li data-c="${c}"><span>${n}</span>${r ? "<em>Europe</em>" : ""}</li>`).join("") ||
      '<li class="none">No match</li>';
    list.hidden = false;
    inp.setAttribute("aria-expanded", "true");
    mark();
  };
  const close = () => {
    list.hidden = true;
    inp.setAttribute("aria-expanded", "false");
    inp.value = name(S.country);
  };
  const pick = (c) => {
    S.country = c;
    save();
    close();
  };
  inp.addEventListener("focus", () => {
    inp.select();
    open("");
  });
  inp.addEventListener("input", () => open(inp.value));
  inp.addEventListener("blur", close);
  inp.addEventListener("keydown", (e) => {
    if (list.hidden && e.key !== "Escape") return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      idx = Math.max(0, Math.min(shown.length - 1, idx + (e.key === "ArrowDown" ? 1 : -1)));
      mark();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[idx]) pick(shown[idx][0]);
      inp.blur();
    } else if (e.key === "Escape") {
      close();
      inp.blur();
    }
  });
  list.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li[data-c]");
    if (li) {
      e.preventDefault();
      pick(li.dataset.c);
      inp.blur();
    }
  });
  return name;
}
