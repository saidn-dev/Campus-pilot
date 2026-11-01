const $ = id => document.getElementById(id);
// namespaced: every project page on saidn-dev.github.io shares one origin, so one localStorage
const STORE_KEY = "campus-pilot:classes";
const OLD_STORE_KEY = "timetable-assistant";
const TYPES = ["Lecture", "Lab", "Tutorial", "Other"];

// set by the Pages build when the backend is hosted elsewhere (e.g. on Render); empty = same server
const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || "").replace(/\/$/, "");

let classes = load();
let imageFile = null;

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY) ?? localStorage.getItem(OLD_STORE_KEY);
    localStorage.removeItem(OLD_STORE_KEY);
    return JSON.parse(raw) || [];
  } catch { return []; }
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(classes)); } catch {}
}

function newId() {
  return Math.random().toString(36).slice(2, 9);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
}

function setStatus(el, text, isError = false) {
  el.textContent = text;
  el.classList.toggle("error", isError);
}

// ---------- server calls ----------

async function api(path, options, fallback) {
  let res;
  try {
    res = await fetch(API_BASE + path, { method: "POST", ...options });
  } catch {
    throw new Error(API_BASE
      ? "Couldn't reach the server. After a quiet spell it takes up to a minute to wake up, so try again shortly."
      : "Couldn't reach the server. Is it still running?");
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.detail || fallback);
  return data;
}

// a free host sleeps when idle; start waking it while the visitor picks a photo
if (API_BASE) fetch(API_BASE + "/api/health").catch(() => {});

// ---------- image upload ----------

function pickFile(file) {
  if (!file || !file.type.startsWith("image/")) return setStatus($("read-status"), "That is not an image.", true);
  imageFile = file;
  $("preview").src = URL.createObjectURL(file);
  $("preview").hidden = false;
  $("drop-text").textContent = file.name + " (tap to change)";
  $("read-btn").disabled = false;
  setStatus($("read-status"), "");
}

// shrink big phone photos so the upload is fast on mobile data
function shrinkImage(file, maxSide = 2000) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      if (scale === 1 && file.size < 3e6) return resolve(file);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => resolve(blob || file), "image/jpeg", 0.9);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

async function readTimetable() {
  if (!imageFile) return;
  if (DEMO) {
    return setStatus($("read-status"), "The live demo has no AI server, so it can't read photos. Use \"Try a sample timetable\" or add classes by hand, or run it locally to read your own timetable.", true);
  }
  $("read-btn").disabled = true;
  setStatus($("read-status"), "Gemma 4 is reading your timetable. This can take 20-60 seconds" + (API_BASE ? ", plus up to a minute if the server was asleep..." : "..."));
  try {
    const form = new FormData();
    form.append("image", await shrinkImage(imageFile), "timetable.jpg");
    const data = await api("/api/extract", { body: form }, "Reading failed.");
    if (!data.classes.length) throw new Error("Gemma could not find any classes in that image. Try a clearer photo.");
    classes = data.classes.map(c => ({ ...c, id: newId() }));
    save();
    render();
    setStatus($("read-status"), `Found ${classes.length} classes. Check them in the table below.`);
  } catch (err) {
    setStatus($("read-status"), err.message, true);
  } finally {
    $("read-btn").disabled = false;
  }
}

// ---------- rendering ----------

function render() {
  const issues = findConflicts(classes);
  const clashIds = new Set(issues.filter(i => i.level === "clash").flatMap(i => i.ids));
  renderIssues(issues);
  renderGrid(clashIds);
  renderRows(clashIds);
  $("tips-btn").disabled = classes.length === 0;
  $("ics-btn").disabled = classes.length === 0;
}

// ---------- calendar export (.ics) ----------

function icsDate(d, time) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${time.replace(":", "")}00`;
}

function icsText(s) {
  return String(s || "").replace(/[\\;,]/g, ch => "\\" + ch).replace(/\n/g, "\\n");
}

function downloadCalendar() {
  const endInput = $("sem-end").value;
  const semEnd = endInput ? new Date(endInput + "T23:59:59") : new Date(Date.now() + 16 * 7 * 864e5);
  const until = icsDate(semEnd, "23:59").replace(/00$/, "59");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Timetable Assistant//EN", "CALSCALE:GREGORIAN"];
  classes.filter(c => DAYS.includes(c.day) && toMin(c.start) !== null && toMin(c.end) > toMin(c.start)).forEach(c => {
    // first date on or after today that falls on this class's weekday (Mon=1 ... Sun=0)
    const first = new Date(today);
    const want = (DAYS.indexOf(c.day) + 1) % 7;
    first.setDate(first.getDate() + ((want - first.getDay() + 7) % 7));
    lines.push(
      "BEGIN:VEVENT",
      `UID:${c.id}-${Date.now()}@timetable-assistant`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART:${icsDate(first, c.start)}`,
      `DTEND:${icsDate(first, c.end)}`,
      `RRULE:FREQ=WEEKLY;UNTIL=${until}`,
      `SUMMARY:${icsText([c.code, c.course].filter(Boolean).join(" "))} (${c.type})`,
      `LOCATION:${icsText(c.room)}`,
      `DESCRIPTION:${icsText(c.lecturer ? "Lecturer: " + c.lecturer : "")}`,
      "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", "DESCRIPTION:Class in 15 minutes", "END:VALARM",
      "END:VEVENT"
    );
  });
  lines.push("END:VCALENDAR");

  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" }));
  link.download = "timetable.ics";
  link.click();
}

function renderIssues(issues) {
  if (!classes.length) {
    $("issues").innerHTML = `<li>Add a timetable to check it for clashes.</li>`;
    return;
  }
  if (!issues.length) {
    $("issues").innerHTML = `<li class="ok">No clashes or problems found.</li>`;
    return;
  }
  const order = { clash: 0, error: 1, warn: 2 };
  $("issues").innerHTML = issues
    .sort((a, b) => order[a.level] - order[b.level])
    .map(i => `<li class="${i.level}">${esc(i.text)}</li>`)
    .join("");
}

function renderGrid(clashIds) {
  const ok = classes.filter(c => DAYS.includes(c.day) && toMin(c.start) !== null && toMin(c.end) > toMin(c.start));
  const grid = $("grid");
  if (!ok.length) { grid.innerHTML = ""; grid.style.gridTemplateColumns = ""; return; }

  const days = DAYS.filter(d => d !== "Sun" && d !== "Sat" || ok.some(c => c.day === d));
  const first = Math.min(8 * 60, ...ok.map(c => Math.floor(toMin(c.start) / 60) * 60));
  const last = Math.max(18 * 60, ...ok.map(c => Math.ceil(toMin(c.end) / 60) * 60));
  const pxPerMin = 1;
  const height = (last - first) * pxPerMin;

  grid.style.gridTemplateColumns = `48px repeat(${days.length}, minmax(110px, 1fr))`;

  let html = `<div></div>` + days.map(d => `<div class="head">${d}</div>`).join("");
  html += `<div class="hours" style="height:${height}px">`;
  for (let m = first; m <= last; m += 60) html += `<span style="top:${(m - first) * pxPerMin}px">${String(m / 60).padStart(2, "0")}:00</span>`;
  html += `</div>`;

  days.forEach(day => {
    html += `<div class="col" style="height:${height}px">`;
    for (let m = first + 60; m < last; m += 60) html += `<div class="line" style="top:${(m - first) * pxPerMin}px"></div>`;
    layoutDay(ok.filter(c => c.day === day)).forEach(({ c, lane, lanes }) => {
      const top = (toMin(c.start) - first) * pxPerMin;
      const h = (toMin(c.end) - toMin(c.start)) * pxPerMin;
      const cls = `event ${c.type} ${clashIds.has(c.id) ? "clash" : ""}`;
      html += `<div class="${cls}" style="top:${top}px;height:${h}px;left:calc(${(lane / lanes) * 100}% + 2px);width:calc(${100 / lanes}% - 4px)" title="${esc(c.course)}">
        <b>${esc(c.code || c.course)}</b><span>${c.start}-${c.end}${c.room ? " · " + esc(c.room) : ""}</span></div>`;
    });
    html += `</div>`;
  });

  grid.innerHTML = html;
}

// put overlapping classes side by side instead of on top of each other
function layoutDay(list) {
  const sorted = [...list].sort((a, b) => toMin(a.start) - toMin(b.start));
  const out = [];
  let group = [], groupEnd = -1, laneEnds = [];
  const flush = () => { group.forEach(g => (g.lanes = laneEnds.length)); out.push(...group); group = []; laneEnds = []; };
  sorted.forEach(c => {
    if (toMin(c.start) >= groupEnd) flush();
    let lane = laneEnds.findIndex(end => end <= toMin(c.start));
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
    laneEnds[lane] = toMin(c.end);
    group.push({ c, lane });
    groupEnd = Math.max(groupEnd, toMin(c.end));
  });
  flush();
  return out;
}

function renderRows(clashIds) {
  const option = (list, value) => list.map(v => `<option ${v === value ? "selected" : ""}>${v}</option>`).join("");
  $("rows").innerHTML = classes.map(c => `
    <tr data-id="${c.id}" class="${clashIds.has(c.id) ? "clash" : ""}">
      <td><input data-f="code" value="${esc(c.code)}"></td>
      <td><input data-f="course" value="${esc(c.course)}"></td>
      <td><select data-f="type">${option(TYPES, c.type)}</select></td>
      <td><select data-f="day"><option value="">?</option>${option(DAYS, c.day)}</select></td>
      <td><input data-f="start" type="time" value="${esc(c.start)}"></td>
      <td><input data-f="end" type="time" value="${esc(c.end)}"></td>
      <td><input data-f="room" value="${esc(c.room)}"></td>
      <td><input data-f="lecturer" value="${esc(c.lecturer)}"></td>
      <td><button class="del" aria-label="Delete class">✕</button></td>
    </tr>`).join("") || `<tr><td colspan="9" class="status">No classes yet.</td></tr>`;
}

// ---------- tips ----------

async function getTips() {
  $("tips-btn").disabled = true;
  $("tips").innerHTML = "";
  setStatus($("tips-status"), DEMO ? "" : "Gemma 4 is thinking about your week...");
  const analysis = {
    classes: classes.map(({ id, ...c }) => c),
    problems: findConflicts(classes).map(i => `${i.level}: ${i.text}`),
    hours_per_day: hoursPerDay(classes),
    free_gaps_of_1h_or_more_between_08_and_18: freeGaps(classes),
  };
  try {
    let data;
    if (DEMO) {
      data = { tips: demoTips(classes) };
    } else {
      data = await api("/api/tips", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis }),
      }, "Could not get tips.");
    }
    $("tips").innerHTML = data.tips.map(t => `<li><b>${esc(t.title)}</b>${esc(t.detail)}</li>`).join("");
    setStatus($("tips-status"), "");
  } catch (err) {
    setStatus($("tips-status"), err.message, true);
  } finally {
    $("tips-btn").disabled = false;
  }
}

// ---------- events ----------

$("file").addEventListener("change", e => pickFile(e.target.files[0]));
$("drop").addEventListener("dragover", e => { e.preventDefault(); $("drop").classList.add("over"); });
$("drop").addEventListener("dragleave", () => $("drop").classList.remove("over"));
$("drop").addEventListener("drop", e => {
  e.preventDefault();
  $("drop").classList.remove("over");
  pickFile(e.dataTransfer.files[0]);
});
$("read-btn").addEventListener("click", readTimetable);
$("tips-btn").addEventListener("click", getTips);
$("ics-btn").addEventListener("click", downloadCalendar);

$("add-btn").addEventListener("click", () => {
  classes.push({ id: newId(), code: "", course: "", type: "Lecture", day: "Mon", start: "09:00", end: "10:00", room: "", lecturer: "" });
  save();
  render();
});

$("clear-btn").addEventListener("click", () => {
  if (!classes.length || !confirm("Remove all classes?")) return;
  classes = [];
  save();
  render();
});

$("rows").addEventListener("change", e => {
  const row = e.target.closest("tr");
  const c = row && classes.find(x => x.id === row.dataset.id);
  if (!c || !e.target.dataset.f) return;
  c[e.target.dataset.f] = e.target.value;
  save();
  render();
});

$("rows").addEventListener("click", e => {
  if (!e.target.classList.contains("del")) return;
  classes = classes.filter(x => x.id !== e.target.closest("tr").dataset.id);
  save();
  render();
});

if (DEMO) {
  $("demo-banner").hidden = false;
  $("sample-btn").hidden = false;
  $("sample-btn").addEventListener("click", () => {
    if (classes.length && !confirm("Replace your current classes with the sample timetable?")) return;
    classes = demoSample().map(c => ({ ...c, id: newId() }));
    save();
    render();
    $("tips").innerHTML = "";
    setStatus($("read-status"), `Loaded ${classes.length} sample classes. Edit them and the checks and tips update to match.`);
  });
}

render();
