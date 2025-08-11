const api = window.lookerStudio || window.dscc;

let state = {
  monthCursor: new Date(),
  selection: new Set(),     // 'YYYY-MM-DD'
  lastActive: null,         // último día clicado (para círculo sólido)
  selectionMode: 'day',
  allowMulti: true,
  dateFieldId: null
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
  weeks.flat().forEach(d=>{
    const cell = document.createElement('div'); cell.className='cell';
    if (d.getMonth() !== state.monthCursor.getMonth()) cell.classList.add('muted');
    const key = ymd(d);
    if (state.selection.has(key)) {
    cell.classList.add('active'); // todos los seleccionados se ven igual
  }

    const dot = document.createElement('div'); dot.className='dot'; dot.textContent = d.getDate();
    cell.appendChild(dot);

    cell.onclick = () => handleClick(d);
    cell.title = key;
    grid.appendChild(cell);
  });

  root.appendChild(grid);

  // Toolbar
  const tb = document.createElement('div'); tb.className='toolbar';
  const clear = document.createElement('button'); clear.className='clear'; clear.textContent='Limpiar selección';
  clear.onclick = ()=>{ state.selection.clear(); state.lastActive=null; sendFilter(); render(root); };
  tb.appendChild(clear);
  root.appendChild(tb);
}

function handleClick(d){
  const key = ymd(d);
  switch(state.selectionMode){
    case 'day':
      if (state.allowMulti){
        if (state.selection.has(key)) state.selection.delete(key); else state.selection.add(key);
      } else { state.selection = new Set([key]); }
      state.lastActive = key;
      break;

    case 'week': {
      const start = weekStart(d);
      const tmp = new Set();
      for(let i=0;i<7;i++) tmp.add(ymd(new Date(start.getFullYear(), start.getMonth(), start.getDate()+i)));
      state.selection = state.allowMulti ? union(state.selection,tmp) : tmp;
      state.lastActive = key;
      break;
    }

    case 'month': {
      const first = firstDOM(d), last = lastDOM(d);
      const tmp = new Set();
      for(let x=new Date(first); x<=last; x.setDate(x.getDate()+1)) tmp.add(ymd(x));
      state.selection = state.allowMulti ? union(state.selection,tmp) : tmp;
      state.lastActive = key;
      break;
    }

    case 'range':
      if (!state._rangeStart) { state._rangeStart = d; state.lastActive = key; }
      else {
        const a = state._rangeStart < d ? state._rangeStart : d;
        const b = state._rangeStart < d ? d : state._rangeStart;
        const tmp = new Set();
        for(let x=new Date(a); x<=b; x.setDate(x.getDate()+1)) tmp.add(ymd(x));
        state.selection = state.allowMulti ? union(state.selection,tmp) : tmp;
        state._rangeStart = null;
        state.lastActive = key;
      }
      break;
  }
  sendFilter();
  render(document.getElementById('root'));
}
const union = (a,b)=>{ const r=new Set(a); for(const v of b) r.add(v); return r; };

function sendFilter(){
  if (!state.dateFieldId || !(window.lookerStudio||window.dscc)) return;
  const values = Array.from(state.selection);
  const payload = { type:'FILTER', data:[{ fieldId: state.dateFieldId, operator:'IN', values }] };

  if (window.lookerStudio?.postMessage) window.lookerStudio.postMessage(payload);
  else if (window.dscc?.sendInteraction) window.dscc.sendInteraction(payload);
}

// Hook de datos/estilo
function onData(p){
  try{
    const dim = (p.fields?.ds?.dimensions?.[0]) || (p.fields?.dimensions?.[0]);
    state.dateFieldId = dim?.id || dim?.name || dim?.fieldId || state.dateFieldId;
  }catch(e){}
  const st = p.style||{};
  state.selectionMode = st.selectionMode?.value || state.selectionMode;
  state.allowMulti   = !!(st.allowMulti ? st.allowMulti.value : state.allowMulti);
  render(document.getElementById('root'));
}

const root = document.getElementById('root');
if (window.lookerStudio?.on){ lookerStudio.on('data', onData); lookerStudio.on('style', onData); }
else if (window.dscc?.subscribeToData){ dscc.subscribeToData(onData, {transform:'table'}); }
else { onData({ fields:{ ds:{ dimensions:[{id:'date_dim'}] } }, style:{} }); }

