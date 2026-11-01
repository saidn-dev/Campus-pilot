// Demo mode for the static GitHub Pages build. There is no backend there, so photo reading is
// switched off and tips come from simple rules over the current classes instead of Gemma.
// The Pages workflow adds <meta name="demo-mode"> to index.html; turn it on locally with ?demo.

const DEMO = !!document.querySelector('meta[name="demo-mode"]') || new URLSearchParams(location.search).has("demo");

const DEMO_CLASSES = [
  { code: "CS201", course: "Data Structures", type: "Lecture", day: "Mon", start: "09:00", end: "11:00", room: "LT1", lecturer: "Dr. Okafor" },
  { code: "MA210", course: "Linear Algebra", type: "Lecture", day: "Mon", start: "11:05", end: "12:30", room: "B204", lecturer: "Prof. Mensah" },
  { code: "CS201", course: "Data Structures", type: "Lab", day: "Tue", start: "14:00", end: "17:00", room: "Lab 3", lecturer: "Ms. Achieng" },
  { code: "PH150", course: "Physics for Engineers", type: "Lecture", day: "Wed", start: "08:00", end: "10:00", room: "LT2", lecturer: "Dr. Banda" },
  { code: "EN105", course: "Technical Writing", type: "Tutorial", day: "Wed", start: "09:30", end: "11:00", room: "C12", lecturer: "Mr. Mwangi" },
  { code: "MA210", course: "Linear Algebra", type: "Tutorial", day: "Thu", start: "10:00", end: "11:00", room: "B110", lecturer: "Prof. Mensah" },
  { code: "PH150", course: "Physics for Engineers", type: "Lab", day: "Thu", start: "11:10", end: "13:00", room: "Lab 1", lecturer: "Dr. Banda" },
  { code: "CS220", course: "Databases", type: "Lecture", day: "Thu", start: "13:10", end: "15:00", room: "LT1", lecturer: "Dr. Nyambura" },
  { code: "CS220", course: "Databases", type: "Lab", day: "Fri", start: "10:00", end: "12:00", room: "Lab 2", lecturer: "Mr. Otieno" },
];

function demoSample() {
  return DEMO_CLASSES.map(c => ({ ...c }));
}

// Rule-based stand-in for /api/tips, built from whatever classes are on screen right now.
function demoTips(classes) {
  const issues = findConflicts(classes);
  const ok = validClasses(classes);
  const tips = [];
  const of = kind => issues.filter(i => i.kind === kind);

  if (of("invalid").length) {
    tips.push({ title: "Fill in the missing details.", detail: `${of("invalid").length} class(es) have no day or valid times, so they are left out of the grid, the checks and the calendar.` });
  }
  of("clash").slice(0, 2).forEach(i => {
    tips.push({ title: `Sort out the ${i.day} clash first.`, detail: `${i.text} Ask about another group for one of them before the add/drop deadline.` });
  });
  of("duplicate").slice(0, 1).forEach(i => {
    tips.push({ title: "Remove the duplicate.", detail: `${i.text} Delete one copy so it doesn't show up twice in your calendar.` });
  });
  of("tight").slice(0, 2).forEach(i => {
    tips.push({ title: `Plan the ${i.day} room change.`, detail: `${i.text} Sit near the exit and pack up a minute early.` });
  });
  of("long").slice(0, 1).forEach(i => {
    tips.push({ title: `Bring food on ${i.day}.`, detail: `${i.text} Pack lunch and water so you aren't running on empty by the end.` });
  });

  const hours = hoursPerDay(classes);
  const busiest = Object.entries(hours).sort((a, b) => b[1] - a[1])[0];
  if (busiest && busiest[1] >= 4) {
    const courses = [...new Set(ok.filter(c => c.day === busiest[0]).map(c => c.code || c.course))].join(", ");
    tips.push({ title: `${busiest[0]} is your heaviest day.`, detail: `${+busiest[1].toFixed(1)}h of classes (${courses}). Skim the notes the evening before so you can follow along.` });
  }

  const gap = Object.entries(freeGaps(classes))
    .flatMap(([day, list]) => list.map(g => ({ day, g, len: toMin(g.split("-")[1]) - toMin(g.split("-")[0]) })))
    .sort((a, b) => b.len - a.len)[0];
  if (gap && gap.len >= 120) {
    tips.push({ title: `Use your ${gap.day} ${gap.g} gap.`, detail: `That's ${+(gap.len / 60).toFixed(1)}h free between 08:00 and 18:00. Block it for problem sets or reading instead of letting it drift.` });
  }

  const freeDays = DAYS.slice(0, 5).filter(d => !ok.some(c => c.day === d));
  if (ok.length && freeDays.length) {
    tips.push({ title: `Make ${freeDays[0]} a study day.`, detail: `You have no classes on ${freeDays.join(", ")}. Treat it like a class day with set hours so the time doesn't disappear.` });
  }

  if (tips.length < 5 && ok.length) {
    tips.push({ title: "Do a weekly review.", detail: "Pick one free hour at the end of the week to go over every course's notes while they're fresh." });
  }
  return tips.slice(0, 7);
}
