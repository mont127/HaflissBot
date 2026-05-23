const MAX_ENTRIES = 100;

const entries = [];

function formatEntry(level, args) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const msg = args
    .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
    .join(" ");
  return `[${ts}] [${level}] ${msg}`;
}

function capture(level, original) {
  return (...args) => {
    original(...args);
    entries.push(formatEntry(level, args));
    if (entries.length > MAX_ENTRIES) entries.shift();
  };
}

console.log = capture("LOG", console.log);
console.warn = capture("WARN", console.warn);
console.error = capture("ERR", console.error);

function getLogs(count = 30) {
  return entries.slice(-count);
}

module.exports = { getLogs };
