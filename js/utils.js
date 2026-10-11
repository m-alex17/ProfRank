/* utils.js: Small helpers shared by every module (DOM shortcut, escaping, sleep, log line, progress bar). */

const $ = (s) => document.querySelector(s);

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- OpenAlex ----------
const resetAt = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1)).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const log = (m) => {
  const l = $("#log");
  l.textContent += m + "\n";
  l.scrollTop = l.scrollHeight;
  const st = $("#status");
  st.textContent = m.trim();
  st.classList.toggle("err", m.startsWith("ERROR"));
};

const prog = (f) => ($("#bar i").style.width = Math.round(f * 100) + "%");

// ---------- authors from OpenAlex ----------
const key = (t) =>
  (t || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
