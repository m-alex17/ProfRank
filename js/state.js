/* state.js: Application state: the settings object S (persisted in localStorage) and the last results R. */

let S = structuredClone(DEF),
  R = null,
  sortK = "rank",
  sortD = 1;

try {
  Object.assign(S, JSON.parse(localStorage.getItem("profrank-v2") || "{}"));
} catch (e) {}

const save = () => {
  try {
    localStorage.setItem("profrank-v2", JSON.stringify(S));
  } catch (e) {}
};
