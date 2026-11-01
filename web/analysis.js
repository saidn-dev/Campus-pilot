// Conflict detection and free-time maths. No AI here: plain rules, so results are always exact.

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIGHT_GAP_MIN = 10;   // less than this between classes in different rooms = rush
const LONG_STRETCH_MIN = 240; // 4h of classes with no break
const DAY_START = "08:00";
const DAY_END = "18:00";

function toMin(t) {
  if (!/^\d{2}:\d{2}$/.test(t || "")) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function toTime(min) {
  return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
}

function label(c) {
  return c.code || c.course || "Unnamed class";
}

function validClasses(classes) {
  return classes.filter(c => DAYS.includes(c.day) && toMin(c.start) !== null && toMin(c.end) > toMin(c.start));
}

function findConflicts(classes) {
  const issues = [];

  classes.forEach(c => {
    if (!DAYS.includes(c.day)) issues.push({ level: "error", kind: "invalid", ids: [c.id], text: `${label(c)} has no day set.` });
    else if (toMin(c.start) === null || toMin(c.end) === null) issues.push({ level: "error", kind: "invalid", day: c.day, ids: [c.id], text: `${label(c)} on ${c.day} is missing a start or end time.` });
    else if (toMin(c.end) <= toMin(c.start)) issues.push({ level: "error", kind: "invalid", day: c.day, ids: [c.id], text: `${label(c)} on ${c.day} ends before it starts (${c.start}-${c.end}).` });
  });

  const ok = validClasses(classes);
  DAYS.forEach(day => {
    const list = ok.filter(c => c.day === day).sort((a, b) => toMin(a.start) - toMin(b.start));

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (toMin(b.start) >= toMin(a.end)) break;
        const same = a.code && a.code === b.code && a.start === b.start && a.end === b.end;
        issues.push(same
          ? { level: "warn", kind: "duplicate", day, ids: [a.id, b.id], text: `${label(a)} is listed twice on ${day} at ${a.start}.` }
          : { level: "clash", kind: "clash", day, ids: [a.id, b.id], text: `${label(a)} (${a.start}-${a.end}) clashes with ${label(b)} (${b.start}-${b.end}) on ${day}.` });
      }
    }

    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i], b = list[i + 1];
      const gap = toMin(b.start) - toMin(a.end);
      if (gap >= 0 && gap < TIGHT_GAP_MIN && a.room && b.room && a.room !== b.room) {
        const text = gap === 0
          ? `No time to get from ${a.room} to ${b.room} on ${day}: ${label(a)} ends at ${a.end} and ${label(b)} starts straight after.`
          : `Only ${gap} min to get from ${a.room} to ${b.room} on ${day} (${label(a)} to ${label(b)}).`;
        issues.push({ level: "warn", kind: "tight", day, ids: [a.id, b.id], text });
      }
    }

    let runStart = null, runEnd = null, runIds = [];
    list.forEach(c => {
      const s = toMin(c.start), e = toMin(c.end);
      if (runEnd !== null && s - runEnd < 15) { runEnd = Math.max(runEnd, e); runIds.push(c.id); }
      else { checkRun(); runStart = s; runEnd = e; runIds = [c.id]; }
    });
    checkRun();
    function checkRun() {
      if (runStart !== null && runEnd - runStart >= LONG_STRETCH_MIN) {
        issues.push({ level: "warn", kind: "long", day, ids: runIds, text: `${day}: ${((runEnd - runStart) / 60).toFixed(1)}h of classes in a row (${toTime(runStart)}-${toTime(runEnd)}) with no real break.` });
      }
    }
  });

  return issues;
}

function freeGaps(classes, minLength = 60) {
  const ok = validClasses(classes);
  const gaps = {};
  DAYS.forEach(day => {
    const list = ok.filter(c => c.day === day).sort((a, b) => toMin(a.start) - toMin(b.start));
    if (!list.length) return;
    let cursor = toMin(DAY_START);
    const out = [];
    list.forEach(c => {
      if (toMin(c.start) - cursor >= minLength) out.push(`${toTime(cursor)}-${c.start}`);
      cursor = Math.max(cursor, toMin(c.end));
    });
    if (toMin(DAY_END) - cursor >= minLength) out.push(`${toTime(cursor)}-${DAY_END}`);
    gaps[day] = out;
  });
  return gaps;
}

function hoursPerDay(classes) {
  const out = {};
  validClasses(classes).forEach(c => {
    out[c.day] = (out[c.day] || 0) + (toMin(c.end) - toMin(c.start)) / 60;
  });
  return out;
}

if (typeof module !== "undefined") module.exports = { findConflicts, freeGaps, hoursPerDay, toMin, DAYS };
