
// Home panel override: use LECAPs data and chart style like LECAPs beta
document.addEventListener('DOMContentLoaded', () => {
  const chartEl = document.getElementById('yield-chart');
  const tbody = document.getElementById('bonds-table-body');
  const toggleBtn = document.getElementById('metric-toggle');
  const theadRow = document.querySelector('#bonds-table thead tr');
  if (!chartEl || !tbody || !toggleBtn || !theadRow || typeof Chart === 'undefined') return;

  // Replace header to summary view: Ticker | Vencimiento | TEM | Precio | TEA
  theadRow.innerHTML = `
    <th scope="col">Ticker</th>
    <th scope="col">Vencimiento</th>
    <th scope="col">TEM</th>
    <th scope="col">Precio</th>
    <th scope="col">TEA</th>
  `;

  const State = { rows: [], metric: 'ea', chart: null, lastRow: null };

  function sanitize(raw){
    try { const d = JSON.parse(JSON.stringify(raw)); const num = v => (typeof v==='string'&&v.trim()!==''?Number(v):v);
      d.params = d.params||{}; d.params.t_plus=num(d.params.t_plus); d.params.comision_pct=num(d.params.comision_pct); d.params.dm_pct=num(d.params.dm_pct); d.params.dm_monto=num(d.params.dm_monto);
      (d.items||[]).forEach(it=>{ it.tem=num(it.tem); it.precios=it.precios||{}; it.precios.ultimo=num(it.precios.ultimo); it.precios.compra=num(it.precios.compra); it.precios.cierre=num(it.precios.cierre);
        it.overrides=it.overrides||{}; it.overrides.comision_pct=num(it.overrides.comision_pct); it.overrides.dm_pct=num(it.overrides.dm_pct); it.overrides.dm_monto=num(it.overrides.dm_monto); it.overrides.t_plus=(it.overrides.t_plus===''?null:num(it.overrides.t_plus)); });
      return d; } catch { return raw; }
  }
  function pickPrecioAuto(pre){ const cand = [ {src:'ULTIMO', v: pre.ultimo}, {src:'COMPRA', v: pre.compra}, {src:'CIERRE', v: pre.cierre} ]; for (const c of cand) { if (typeof c.v==='number' && isFinite(c.v) && c.v>0) return { valor: c.v, src: c.src }; } return { valor: NaN, src:'N/A' }; }
  function addDays(d, n){ const x=new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate()+n); return x; }
  function diff30E360(d1, d2){ const y1=d1.getFullYear(), m1=d1.getMonth()+1, d1d=d1.getDate(); const y2=d2.getFullYear(), m2=d2.getMonth()+1, d2d=d2.getDate(); const dd1=Math.min(d1d,30); const dd2=Math.min(d2d,30); return (y2-y1)*360 + (m2-m1)*30 + (dd2-dd1); }

  function computeRows(data){
    const now = new Date(); const p = data.params||{};
    return (data.items||[]).map(it=>{
      const ovr=it.overrides||{}; const precios=it.precios||{};
      const em=new Date(it.emision); const vto=new Date(it.vencimiento);
      const tPlus=Number.isInteger(ovr.t_plus)?ovr.t_plus:(p.t_plus||0);
      const liqui=addDays(now,tPlus);
      const dias=Math.ceil((vto-liqui)/(1000*60*60*24));
      const vig360=diff30E360(em,vto); const meses=Math.floor(vig360/30); const frac=(vig360%30)/30;
      const tem=it.tem; const FV=100*Math.pow(1+tem, meses+frac);
      const pick=pickPrecioAuto(precios); const precio=pick.valor;
      const com=(ovr.comision_pct!=null)?ovr.comision_pct:(p.comision_pct||0);
      const dm_pct=(ovr.dm_pct!=null)?ovr.dm_pct:(p.dm_pct||0);
      const dm_monto=(ovr.dm_monto!=null)?ovr.dm_monto:(p.dm_monto||0);
      const precio_neto=(precio*(1+com)*(1+dm_pct))+dm_monto;
      const factor=FV/(precio_neto||NaN);
      const valid=dias>0 && isFinite(factor) && factor>0;
      const tir_em=valid? Math.pow(factor, 30/dias)-1 : NaN;
      const tir_ea=valid? Math.pow(factor, 360/dias)-1: NaN;
      return { ticker: it.ticker, vencimiento: it.vencimiento, dias, tem, precio, tir_ea };
    }).filter(r=> isFinite(r.tem) && isFinite(r.precio) && isFinite(r.tir_ea));
  }

  async function loadLecaps(){
    const ls = localStorage.getItem('lecapsData');
    if (ls) { try { return computeRows(sanitize(JSON.parse(ls))); } catch(_){} }
    try { const res = await fetch('data/lecaps.sample.json', { cache:'no-store'}); if (!res.ok) throw new Error(); const data = await res.json(); return computeRows(sanitize(data)); } catch { return []; }
  }

  function renderTable(){
    tbody.innerHTML = State.rows.map(r => `
      <tr data-ticker="${r.ticker}">
        <td>${r.ticker}</td>
        <td>${r.vencimiento}</td>
        <td>${(r.tem*100).toFixed(2)}%</td>
        <td>${r.precio.toFixed(2)}</td>
        <td>${(r.tir_ea*100).toFixed(2)}%</td>
      </tr>
    `).join('');
  }

  function highlightRow(ticker){
    if (State.lastRow && document.body.contains(State.lastRow)) { State.lastRow.style.backgroundColor=''; State.lastRow.style.outline=''; }
    State.lastRow=null; if(!ticker) return;
    const row = tbody.querySelector(`tr[data-ticker="${ticker}"]`);
    if (row){ row.style.backgroundColor='rgba(2,132,199,0.10)'; row.style.outline='1px solid rgba(2,132,199,0.35)'; State.lastRow=row; }
  }

  function renderChart(){
    const m=State.metric; // 'ea' or 'em'
    const datasets=[{ label: `TIR_${m.toUpperCase()} (%)`, data: State.rows.map(r=>({ x:r.dias, y:(m==='ea'? r.tir_ea : Math.pow(1+r.tir_ea,1/12)-1)*100, label:r.ticker })), backgroundColor:'rgba(13,110,253,0.6)', borderColor:'rgba(13,110,253,1)', pointRadius:6, pointHoverRadius:8, hitRadius:12 }];
    if (State.chart){ State.chart.data={datasets}; State.chart.options.scales.y.title.text=`TIR_${m.toUpperCase()} (%)`; State.chart.update(); return; }
    State.chart=new Chart(chartEl.getContext('2d'),{ type:'scatter', data:{datasets}, options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'nearest',intersect:false}, onHover:(evt,actives,chart)=>{ if(actives&&actives.length){ const p=actives[0]; const d=chart.data.datasets[p.datasetIndex].data[p.index]; highlightRow(d.label);} else { highlightRow(null);} }, scales:{ x:{ title:{display:true,text:'Dias al Vencimiento'} }, y:{ title:{display:true,text:`TIR_${m.toUpperCase()} (%)`} } }, plugins:{ tooltip:{ callbacks:{ title:(items)=>{ const it=items&&items[0]; return it?(it.raw.label||''):''; }, label:(ctx)=>{ const y=ctx.parsed.y; const tag=(State.metric==='ea'?'TIR_EA':'TIR_EM'); return `${tag}: ${y.toFixed(2)}%`; } } }, legend:{ display:true } } }});
  }

  toggleBtn.addEventListener('click', ()=>{ State.metric = (State.metric==='ea')?'em':'ea'; toggleBtn.textContent = `Ver ${State.metric==='ea'?'TIR_EM':'TIR_EA'}`; renderChart(); });

  loadLecaps().then(rows=>{ State.rows=rows; renderTable(); renderChart(); });
});
