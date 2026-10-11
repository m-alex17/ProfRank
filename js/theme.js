/* theme.js: Light/dark theme toggle. */

// ---------- theme ----------
(function () {
  const root = document.documentElement,
    btn = $("#theme");
  let t = null;
  try {
    t = localStorage.getItem("profrank-theme");
  } catch (e) {}
  if (!t) t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const apply = (v) => {
    root.dataset.theme = v;
    try {
      localStorage.setItem("profrank-theme", v);
    } catch (e) {}
  };
  apply(t);
  btn.onclick = () => apply(root.dataset.theme === "dark" ? "light" : "dark");
})();
