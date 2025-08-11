// === Helpers para API ===
const API = {
  sendFilter(fieldId, values) {
    // payload común
    const payload = { type: 'FILTER', data: [{ fieldId, operator: 'IN', values }] };

    if (window.lookerStudio && typeof window.lookerStudio.postMessage === 'function') {
      window.lookerStudio.postMessage(payload);
    } else if (window.dscc && typeof window.dscc.sendInteraction === 'function') {
      window.dscc.sendInteraction(payload);
    }
  },
  subscribe(onData) {
    if (window.lookerStudio && typeof window.lookerStudio.on === 'function') {
      window.lookerStudio.on('data', onData);
      window.lookerStudio.on('style', onData);
    } else if (window.dscc && typeof window.dscc.subscribeToData === 'function') {
      window.dscc.subscribeToData(onData, { transform: 'table' });
    } else {
      // Dev fallback
      onData({ fields: { ds: { dimensions: [{ id: 'date_dim' }] } }, style: {} });
    }
  }
};

// === Estado ===
const state = {
  monthCursor: new Date(),
  selectionMode: 'range',
  dateFieldId: null,
  rangeStart: null,
  rangeEnd: null
};

// === Utils fecha ===
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const firstDOM = d => new Date(d.getFullYear(), d.getMonth(), 1);
const lastDOM  = d => new Date(d.getFullYear(), d.getMonth()+1, 0);
const sameDay  = (a,b) => a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
const beforeOrEqual = (a,b) => a.getTime() <= b.getTime();

function getWeeksGrid(date, monStart = true) {
  const first = firstDOM(date), last = lastDOM(date);
  const start = new Date(first), s = (first.getDay() + (7 - (monStart ? 1 : 0))) % 7;
  start.setDate(first.getDate() - s);
  const end = new Date(last), t = (6 - ((end.getDay() + (7 - (monStart ? 1 : 0))) % 7));
  end.setDate(last.getDate() + t);
  const days = [];
  for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) days.push(new Date(cur));
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}
function* daysBetween(a,b){ const d=new Date(a); while(d<=b){ yield new Date(d); d.setDate(d.getDate()+1); } }
function buildRangeSet(a,b){ const set=new Set(); for(const d of daysBetween(a,b)) set.add(ymd(d)); return Array.from(set); }
function weekStart(d){ const c=new Date(d); const delta=(c.getDay()+6)%7; c.setDate(c.getDate()-delta); return c; }

// === Styles ===
const css = `
:root{--fg:#1f2937;--muted:#9ca3af;--light:#f3f4f6;--accent:#2563eb;--accent-soft:rgba(37,99,235,.18)}
*{box-sizing:border-box} body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:var(--fg)}
.cal{max-width:420px;margin:0 auto;padding:8px 12px}
.hdr{display:flex;align-items:center;justify-content:center;gap:12px;margin:8px 0 12px}
.arrow{border:none;background:transparent;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px;color:var(--fg)}
.title{font-size:24px;font-weight:700;letter-spacing:.2px;min-width:220px;text-align:center;text-transform:none}
.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}
.dow{text-align:center;font-size:12px;color:var(--muted);user-select:none}
.cell{aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;position:relative;border-radius:12px;cursor:pointer;user-select:none}
.cell.muted{color:var(--muted)}
.dot{position:absolute;inset:4px;display:flex;align-items:center;justify-content:center;border-radius:999px;font-weight:600;transition:background .15s ease,color .15s ease,outline .15s ease}
.cell:hover .dot{outline:2px solid var(--light)}
.cell.inrange .dot{background:var(--accent-soft);color:var(--fg)}
.cell.endpoint .dot{background:var(--accent);color:#fff}
.toolbar{display:flex;justify-content:flex-end;margin-top:12px}
.clear{border:none;background:transparent;color:var(--muted);cursor:pointer;font-size:12px;padding:4px 8px}
.clear:hover{color:var(--fg)}
`;
const styleEl = document.createElement('style');
styleEl.textContent = css;
document.head.appendChild(styleEl);

// Root
const root = document.createElement('div');
root.id = 'root';
root.className = 'cal';
document.body.appendChild(root);

// === Render ===
function render() {
  const container = root;
  container.innerHTML = '';

  // Header
  const hdr = document.createElement('div'); hdr.className = 'hdr';
  const prev = document.createElement('button'); prev.className = 'arrow'; prev.textContent = '‹';
  const next = document.createElement('button'); next.className = 'arrow'; next.textContent = '›';
  const title = document.createElement('div'); title.className = 'title';
  title.textContent = state.monthCursor.toLocaleDateString(undefined, { month:'long', year:'numeric' });
  prev.onclick = () => { state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth()-1, 1); render(); };
  next.onclick = () => { state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth()+1, 1); render(); };
  hdr.append(prev, title, next);
  container.appendChild(hdr);

  // DOW
  const grid = document.createElement('div'); grid.className = 'grid';
  ['L','M','X','J','V','S','D'].forEach(n => {
    const el = document.createElement('div'); el.className = 'dow'; el.textContent = n; grid.appendChild(el);
  });

  // Days
  const weeks = getWeeksGrid(state.monthCursor, true);
  const haveStart = !!state.rangeStart;
  const haveEnd = !!state.rangeEnd;
  let start = state.rangeStart, end = state.rangeEnd;
  if (haveStart && haveEnd && end < start) { const tmp = start; start = end; end = tmp; }

  weeks.flat().forEach(d
