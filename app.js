const SUBJECTS = [
  { name: "Русский язык", price: 200 },
  { name: "Математика", price: 200 },
  { name: "Чтение", price: 200 },
  { name: "Окружающий мир", price: 100 },
  { name: "Английский", price: 100 },
  { name: "ИЗО", price: 100 },
  { name: "Труд", price: 100 },
  { name: "Физкультура", price: 100 },
];
const $ = id => document.getElementById(id);
const rub = n => n.toLocaleString("ru-RU") + " ₽";
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? b : c; };
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

let sb = null, debt = null, entries = [], lastLeft = null, pendingDel = null, busy = false;
const picked = new Map(); // subject name -> { s, count }

function setStatus(text) { $("status").textContent = text; $("status").hidden = !text; }
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2200); }

// Chips
function makeChip(s, i) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "chip" + (s.price === 200 ? " big" : ""); b.id = "chip" + i;
  b.setAttribute("aria-pressed", "false");
  const n = document.createElement("span"); n.textContent = s.name;
  const p = document.createElement("span"); p.className = "p"; p.textContent = s.price + " ₽";
  b.append(n, p);
  b.onclick = () => { if (picked.has(s.name)) picked.delete(s.name); else picked.set(s.name, { s, count: 1 }); syncPicked(); };
  return b;
}
function syncPicked() {
  SUBJECTS.forEach((s, i) => $("chip" + i).setAttribute("aria-pressed", picked.has(s.name) ? "true" : "false"));
  const sel = $("sel"); sel.replaceChildren(); sel.hidden = !picked.size;
  picked.forEach((p, name) => {
    const r = document.createElement("div"); r.className = "sel-row";
    r.innerHTML = '<span class="n"></span><div class="stepper" role="group"><button type="button" aria-label="Меньше">−</button><span></span><button type="button" aria-label="Больше">+</button></div><span class="s"></span>';
    r.querySelector(".n").textContent = name;
    r.querySelector(".stepper").setAttribute("aria-label", "Пятёрок по предмету " + name);
    r.querySelector(".stepper span").textContent = p.count;
    r.querySelector(".s").textContent = "−" + rub(p.s.price * p.count);
    const [minus, plus] = r.querySelectorAll("button");
    minus.onclick = () => { if (p.count > 1) p.count--; else picked.delete(name); syncPicked(); };
    plus.onclick = () => { p.count = Math.min(20, p.count + 1); syncPicked(); };
    sel.append(r);
  });
  updateBtn();
}
SUBJECTS.forEach((s, i) => (s.price === 200 ? $("chipsBig") : $("chipsSmall")).append(makeChip(s, i)));
$("date").value = todayISO();

function updateBtn() {
  const b = $("addBtn");
  if (!picked.size) { b.disabled = true; b.textContent = "Выбери предметы"; return; }
  let n = 0, sum = 0;
  picked.forEach(p => { n += p.count; sum += p.s.price * p.count; });
  b.disabled = !sb || busy;
  b.textContent = `Записать ${n > 1 ? n + " " + plural(n, "пятёрку", "пятёрки", "пятёрок") : "пятёрку"} · −${rub(sum)}`;
}

// Render
function render() {
  const paid = entries.reduce((s, e) => s + (e.amount || 0), 0);
  const nFives = entries.reduce((s, e) => s + (e.count || 1), 0);
  const total = debt ?? 0;
  const left = Math.max(0, total - paid);
  const frac = total > 0 ? Math.min(1, paid / total) : 0;
  $("left").textContent = debt == null ? "—" : rub(left);
  $("paid").textContent = rub(paid);
  $("debt").textContent = debt == null ? "—" : rub(total);
  $("fives").textContent = nFives;
  $("pct").textContent = Math.round(frac * 100) + "%";
  $("ringBar").style.strokeDashoffset = 314.16 * (1 - frac);
  const done = debt != null && total > 0 && left === 0;
  $("hero").classList.toggle("is-done", done);
  if (done && lastLeft != null && lastLeft > 0) confetti();
  lastLeft = debt == null ? null : left;
  if (document.activeElement !== $("debtInput") && debt != null) $("debtInput").value = debt;

  // by subject
  const by = {};
  entries.forEach(e => { const k = e.subject; by[k] = by[k] || { sum: 0, n: 0 }; by[k].sum += e.amount || 0; by[k].n += e.count || 1; });
  const rows = Object.entries(by).sort((a, b) => b[1].sum - a[1].sum);
  const max = rows.length ? rows[0][1].sum : 1;
  const subj = $("subj"); subj.replaceChildren();
  if (!rows.length) { const p = document.createElement("p"); p.className = "empty"; p.textContent = "Тут появятся предметы, за которые уже списано."; subj.append(p); }
  rows.forEach(([name, v]) => {
    const r = document.createElement("div"); r.className = "subj-row";
    r.innerHTML = '<span class="n"></span><span class="s"></span><div class="meter"><i></i></div><span class="c"></span>';
    r.querySelector(".n").textContent = name;
    r.querySelector(".s").textContent = "−" + rub(v.sum);
    r.querySelector("i").style.width = (v.sum / max * 100) + "%";
    r.querySelector(".c").textContent = v.n + " " + plural(v.n, "пятёрка", "пятёрки", "пятёрок");
    subj.append(r);
  });

  // journal by date, newest first; running remainder after each day
  const log = $("log"); log.replaceChildren();
  if (!entries.length) { log.innerHTML = '<p class="empty"><b>Пока пусто</b>Выбери предмет выше и нажми «Записать».</p>'; return; }
  const sorted = [...entries].sort((a, b) => (a.date + a.created_at).localeCompare(b.date + b.created_at));
  const leftAfter = {}; let run = total;
  sorted.forEach(e => { run -= e.amount || 0; leftAfter[e.date] = Math.max(0, run); });
  const days = {};
  sorted.slice().reverse().forEach(e => (days[e.date] = days[e.date] || []).push(e));
  Object.keys(days).sort().reverse().forEach(date => {
    const d = document.createElement("div"); d.className = "day";
    const h = document.createElement("div"); h.className = "day-h";
    const b = document.createElement("b");
    b.textContent = new Date(date + "T12:00:00").toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" });
    const s = document.createElement("span"); s.textContent = "осталось " + rub(leftAfter[date]);
    h.append(b, s); d.append(h);
    days[date].forEach(e => {
      const row = document.createElement("div"); row.className = "entry";
      row.innerHTML = '<div class="mark">5</div><div class="what"><b></b><small></small></div><span class="amt"></span><button class="del" type="button" aria-label="Удалить запись">×</button>';
      row.querySelector("b").textContent = e.subject;
      row.querySelector("small").textContent = e.count > 1 ? `${e.count} × ${rub(e.price)}` : rub(e.price);
      row.querySelector(".amt").textContent = "−" + rub(e.amount);
      const del = row.querySelector(".del");
      if (pendingDel === e.id) { del.classList.add("confirm"); del.textContent = "Удалить?"; }
      del.onclick = async () => {
        if (pendingDel !== e.id) { pendingDel = e.id; render(); setTimeout(() => { if (pendingDel === e.id) { pendingDel = null; render(); } }, 4000); return; }
        pendingDel = null;
        const { error } = await sb.from("fives").delete().eq("id", e.id);
        if (error) { toast("Не удалось удалить — проверь интернет"); return; }
        toast("Запись удалена");
        load();
      };
      d.append(row);
    });
    log.append(d);
  });
}

// Data
async function load() {
  const [s, f] = await Promise.all([
    sb.from("settings").select("debt").eq("id", 1).maybeSingle(),
    sb.from("fives").select("*").order("date").order("created_at"),
  ]);
  if (s.error || f.error) { setStatus(navigator.onLine ? "Не удалось загрузить данные. Проверь config.js и таблицы в Supabase." : "Нет интернета. Данные обновятся, когда связь появится."); return; }
  setStatus("");
  debt = s.data ? s.data.debt : null;
  entries = f.data;
  render();
}
let loadTimer;
const loadSoon = () => { clearTimeout(loadTimer); loadTimer = setTimeout(load, 250); };

$("addBtn").onclick = async () => {
  if (!picked.size || !sb) return;
  const date = $("date").value || todayISO();
  const rows = [...picked].map(([name, p]) => ({ subject: name, price: p.s.price, count: p.count, amount: p.s.price * p.count, date }));
  busy = true; updateBtn();
  const { error } = await sb.from("fives").insert(rows);
  busy = false;
  if (error) { toast("Не записалось — проверь интернет и нажми ещё раз"); updateBtn(); return; }
  toast(`Молодец! −${rub(rows.reduce((s, r) => s + r.amount, 0))}`);
  picked.clear(); syncPicked();
  load();
};

$("saveDebt").onclick = async () => {
  const v = Math.round(Number($("debtInput").value));
  if (!sb || !(v >= 0)) { toast("Введи сумму числом"); return; }
  const { error } = await sb.from("settings").upsert({ id: 1, debt: v });
  if (error) { toast("Не удалось сохранить"); return; }
  toast("Сумма долга: " + rub(v));
  load();
};

// Confetti in red-pen, ink and gold
function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = $("confetti"), x = c.getContext("2d");
  c.width = innerWidth; c.height = innerHeight;
  const cs = getComputedStyle(document.documentElement);
  const cols = ["--red", "--ink", "--gold", "--green"].map(v => cs.getPropertyValue(v).trim());
  const P = Array.from({ length: 140 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * .5, vy: 2 + Math.random() * 3, vx: -1.5 + Math.random() * 3, r: Math.random() * 6.28, s: 6 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)] }));
  let f = 0;
  (function tick() {
    x.clearRect(0, 0, c.width, c.height);
    P.forEach(p => { p.y += p.vy; p.x += p.vx; p.r += .1; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); x.restore(); });
    if (++f < 240) requestAnimationFrame(tick); else x.clearRect(0, 0, c.width, c.height);
  })();
}

// Install as an app
(function setupInstall() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  let hidden = false;
  try { hidden = localStorage.getItem("installHidden") === "1"; } catch {}
  if (standalone || hidden) return;
  const box = $("install");
  $("installClose").onclick = () => { box.hidden = true; try { localStorage.setItem("installHidden", "1"); } catch {} };
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) {
    $("installText").textContent = "Чтобы поставить на экран телефона: нажми «Поделиться» в Safari, затем «На экран „Домой“».";
    box.hidden = false;
  }
  addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    $("installText").textContent = "Поставь «Пятёрки» на экран телефона, чтобы открывать как приложение.";
    $("installBtn").hidden = false;
    box.hidden = false;
    $("installBtn").onclick = async () => { e.prompt(); await e.userChoice; box.hidden = true; };
  });
  addEventListener("appinstalled", () => { box.hidden = true; });
})();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

render();

(function start() {
  const cfg = window.APP_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || cfg.supabaseUrl.includes("YOUR_") || !cfg.supabaseKey || cfg.supabaseKey.includes("YOUR_")) {
    setStatus("Приложение не настроено: впиши адрес и ключ Supabase в файл config.js.");
    return;
  }
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: false } });
  setStatus("Загружаем тетрадку…");
  updateBtn();
  load();
  // Live updates: any change by anyone triggers a fresh load
  sb.channel("dolg")
    .on("postgres_changes", { event: "*", schema: "public", table: "fives" }, loadSoon)
    .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, loadSoon)
    .subscribe();
  // Phones drop live connections in the background; catch up on return
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") loadSoon(); });
  addEventListener("online", loadSoon);
})();
