const api = window.lookerStudio || window.dscc;

let state = {
  monthCursor: new Date(),
  selectionMode: 'range',     // puedes cambiarlo en Estilo si quieres
  allowMulti: false,          // en rango ignoramos multiselección a propósito
  dateFieldId: null,

  // NUEVO: control explícito del rango
  rangeStart: null,           // Date del primer clic
  rangeEnd: null              // Date del segundo clic
};

const pad = n => String(n).padStart(2,'0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const firstDOM = d => new Date(d.getFullYear(), d.getMonth(), 1);
const lastDOM  = d => new Date(d.getFullYear(), d.getMonth()+1, 0);

function getWeeksGrid(date, monStart=true){
  const first = firstDOM(date), last = lastDOM(date);
  const start = new Date(first), s = (first.getDay() + (7 - (monStart?1:0))) % 7;
  start.setDate(first.getDate() - s);
  const end = new Date(last), t = (6 - ((end.getDay() + (7 - (monStart?1:0))) % 7));
  end.setDate(last.getDate() + t);

  const days = [];
  for (let cur=new Date(start); cur<=end; cur.setDate(cur.getDate()+1)) days.push(new Date(cur));
  const weeks=[]; for(let i=0;i<days.length;i+=7) weeks.push(days.slice(i,i+7));
  return weeks;
}

function weekStart(d){ const c=new Date(d); const delta=(c.getDay()+6)%7; c.setDate(c.getDate()-delta); return c; }

function sameDay(a,b){ return a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function beforeOrEqual(a,b){ return a.getTime() <= b.getTime(); }

function* daysBetween(a,b){ const d=new Date(a); while(d<=b){ yield new Date(d); d.setDate(d.getDate()+1); } }
function buildRangeSet(a,b){ const set=new Set(); for(const d of daysBetween(a,b)) set.add(ymd(d)); return set; }

function clearRange(){ state.rangeStart = null; state.rangeEnd = null; }

function render(root){
  root.innerHTML = '';

  // Header
  const hdr = document.createElement('div'); hdr.className='hdr';
  const prev = document.createElement('button'); prev.className='arrow'; prev.textContent='‹';
  const next = document.createElement('button'); next.className='arrow'; next.textContent='›';
  const title= document.createElement('div');   title.className='title';
  title.textContent = state.monthCursor.toLocaleDateString(undefined, {month:'long', year:'numeric'});
  prev.onclick=()=>{ state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth()-1, 1); render(root); };
  next.onclick=()=>{ state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth()+1, 1); render(root); };
  hdr.append(prev,title,next);
  root.appendChild(hdr);

  // DOW
  const grid = document.createElement('div'); grid.className='grid';
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(n=>{ const el=document.createElement('div'); el.className='dow'; el.textContent=n; grid.appendChild(el); });

  // Days
  const weeks = getWeeksGrid(state.monthCursor, true);
  const haveStart = !!state.rangeStart;
  const haveEnd   = !!state.rangeEnd;
  let start = state.rangeStart, end = state.rangeEnd;
  if (haveStart && haveEnd && end < start) { const tmp=start; start=end; end=tmp; }

  weeks.flat().forEach(d=>{
    const cell = document.createElement('div'); cell.className='cell';
    if (d.getMonth() !== state.monthCursor.getMonth()) cell.classList.add('muted');

    const keyDate = ymd(d);
    const isStart = haveStart && sameDay(d, start);
    const isEnd   = haveEnd   && sameDay(d, end);
    const inRange = haveStart && haveEnd && beforeOrEqual(start,d) && beforeOrEqual(d,end);

    if (inRange) cell.classList.add('inrange');
    if (isStart || isEnd) cell.classList.add('endpoint');

    const dot = document.createElement('div'); dot.className='dot'; dot.textContent = d.getDate();
    cell.appendChild(dot);

    cell.onclick = () => handleClick(d);
    cell.title = keyDate;
    grid.appendChild(cell);
  });

  root.appendChild(grid);

  const tb = document.createElement('div'); tb.className='toolbar';
  const clear = document.createElement('button'); clear.className='clear'; clear.textContent='Limpiar selección';
  clear.onclick = ()=>{ clearRange(); sendFilter([]); render(root); };
  tb.appendChild(clear);
  root.appendChild(tb);
}

function handleClick(d){
  switch(state.selectionMode){

    case 'range': {
      // 1º clic: fija inicio, 2º clic: fija fin y envía filtro del rango
      if (!state.rangeStart || (state.rangeStart && state.rangeEnd)) {
        // Empieza rango nuevo => borra lo anterior
        state.rangeStart = d;
        state.rangeEnd = null;
        // NO enviamos filtro aún (para que no “salte” a un solo día)
      } else {
        state.rangeEnd = d;
        // Normaliza orden y envía todo el rango
        let a = state.rangeStart, b = state.rangeEnd;
        if (b < a) { const t=a; a=b; b=t; }
        const values = Array.from(buildRangeSet(a,b));
        sendFilter(values);
      }
      break;
    }

    case 'day': {
      // Reemplaza selección (sin mantener días viejos)
      state.rangeStart = d; state.rangeEnd = d;
      sendFilter([ymd(d)]);
      break;
    }

    case 'week': {
      const start = weekStart(d);
      const vals = [];
      for(let i=0;i<7;i++){ vals.push(ymd(new Date(start.getFullYear(), start.getMonth(), start.getDate()+i))); }
      state.rangeStart = start; state.rangeEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate()+6);
      sendFilter(vals);
      break;
    }

    case 'month': {
      const first = firstDOM(d), last = lastDOM(d);
      const vals = Array.from(buildRangeSet(first,last));
      state.rangeStart = first; state.rangeEnd = last;
      sendFilter(vals);
      break;
    }
  }

  render(document.getElementById('root'));
}

function sendFilter(values){
  if (!state.dateFieldId || !(window.lookerStudio||window.dscc)) return;
  const payload = { type:'FILTER', data:[{ fieldId: state.dateFieldId, operator:'IN', values }] };
  if (window.lookerStudio?.postMessage) window.lookerStudio.postMessage(payload);
  else if (window.dscc?.sendInteraction) window.dscc.sendInteraction(payload);
}

// Suscripción a datos/estilo
function onData(p){
  try{
    const dim = (p.fields?.ds?.dimensions?.[0]) || (p.fields?.dimensions?.[0]);
    state.dateFieldId = dim?.id || dim?.name || dim?.fieldId || state.dateFieldId;
  }catch(e){}
  const st = p.style||{};
  state.selectionMode = st.selectionMode?.value || state.selectionMode;
  // En modo 'range' ignoramos allowMulti para que siempre reemplace
  render(document.getElementById('root'));
}

const root = document.getElementById('root');
if (window.lookerStudio?.on){ lookerStudio.on('data', onData); lookerStudio.on('style', onData); }
else if (window.dscc?.subscribeToData){ dscc.subscribeToData(onData, {transform:'table'}); }
else { onData({ fields:{ ds:{ dimensions:[{id:'date_dim'}] } }, style:{} }); }
