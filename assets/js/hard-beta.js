;(function(){
  const HardBeta = {
    state: { rows: [], metric: 'EA', showTrend: false, chart: null, highlightTicker: null, hoverTicker: null },
    els: {},
    init(){ this.cacheEls(); this.bindEvents(); this.load(); },
    cacheEls(){ this.els = {
      tbody: document.getElementById('hard-tbody'),
      curve: document.getElementById('hard-curve'),
      metricEA: document.getElementById('hard-metric-ea'),
      metricEM: document.getElementById('hard-metric-em'),
      trend: document.getElementById('hard-trend-toggle')
    }; },
    bindEvents(){
      const setMetric = (m)=>{ this.state.metric=m; this.els.metricEA.classList.toggle('is-active', m==='EA'); this.els.metricEM.classList.toggle('is-active', m==='EM'); this.els.metricEA.setAttribute('aria-pressed', m==='EA'?'true':'false'); this.els.metricEM.setAttribute('aria-pressed', m==='EM'?'true':'false'); try{ localStorage.setItem('hardMetric', m); }catch(_){} this.renderChart(); };
      this.els.metricEA?.addEventListener('click', ()=> setMetric('EA'));
      this.els.metricEM?.addEventListener('click', ()=> setMetric('EM'));
      if (this.els.trend){ this.els.trend.addEventListener('change', ()=>{ this.state.showTrend=!!this.els.trend.checked; this.renderChart(); }); }
      // clear selection on outside click
      document.addEventListener('click', (e)=>{ if (this.state.highlightTicker && !(this.els.curve?.contains(e.target))) { this.state.highlightTicker=null; this.syncRowHighlight(); } });
    },
    async load(){
      // restore metric pref
      try{ const m=localStorage.getItem('hardMetric'); if (m==='EA'||m==='EM'){ this.state.metric=m; } }catch(_){ }
      const rows = await this.loadRows();
      this.state.rows = rows;
      this.renderTable();
      this.renderChart();
    },
    async loadRows(){
      const sanitize = (raw)=>{ try{ const d=JSON.parse(JSON.stringify(raw)); const num=v=> (typeof v==='string'&&v.trim()!==''?Number(v):v); (d.items||[]).forEach(it=>{ it.cupon=num(it.cupon); it.ytm_ea=num(it.ytm_ea); it.ytm_em=num(it.ytm_em); it.precios=it.precios||{}; it.precios.ultimo=num(it.precios.ultimo); }); return d; }catch{return raw}; };
      const computeYTM = (pricePct, cuponAnual, fechaVto)=>{ try{ const par=100; const cSemi = (cuponAnual||0)*par/2; const now=new Date(); // generar pagos semestrales restantes
          const pagos=[]; let d=new Date(now); // aproximacion: 6 meses sucesivos hasta vencer
          while (d < fechaVto){ const next=new Date(d.getFullYear(), d.getMonth()+6, d.getDate()); if (next>fechaVto) break; d=next; pagos.push({date:new Date(d), amount:cSemi}); }
          pagos.push({date:new Date(fechaVto), amount:cSemi+par});
          const dias = pagos.map(p=> Math.max(1, Math.ceil((p.date - now)/(1000*60*60*24))));
          const nSemi = dias.map(dd=> Math.max(0.5, dd/182.5));
          const target = pricePct; // precio sobre 100
          // biseccion en y_semi (0..1)
          let lo=0.0001, hi=1.5; const pv=(y)=> pagos.reduce((s,p,i)=> s + p.amount/Math.pow(1+y, nSemi[i]), 0);
          for(let k=0;k<60;k++){ const mid=(lo+hi)/2; const v=pv(mid); if (isNaN(v)) break; if (v>target) lo=mid; else hi=mid; }
          const ySemi=(lo+hi)/2; const yEA=Math.pow(1+ySemi,2)-1; const yEM=Math.pow(1+yEA,1/12)-1; return {ea:yEA, em:yEM};
        }catch{return {ea:NaN, em:NaN}} };
      const compute = (d)=>{ const now=new Date(); const items=(d.items||[]).map(it=>{ const vto=new Date(it.vencimiento); const dias=Math.ceil((vto-now)/(1000*60*60*24)); const precio=(typeof it.precios?.ultimo==='number')?it.precios.ultimo:NaN; let ytm_ea=it.ytm_ea; let ytm_em= (typeof it.ytm_em==='number')?it.ytm_em : (isFinite(ytm_ea)? (Math.pow(1+ytm_ea,1/12)-1): NaN); if (!isFinite(ytm_ea) && isFinite(precio)){ const y=computeYTM(precio, it.cupon, vto); ytm_ea=y.ea; ytm_em=y.em; } return { ticker: it.ticker, vencimiento: it.vencimiento, dias, cupon: it.cupon, precio, ytm_ea, ytm_em }; }).filter(r=> isFinite(r.precio) && isFinite(r.ytm_ea)); return items; };
      const ls = localStorage.getItem('hardBondsData'); if (ls){ try{ return compute(sanitize(JSON.parse(ls))); }catch{} }
      try{ const res=await fetch('../data/hardbonds.sample.json',{cache:'no-store'}); if(!res.ok) return []; const data=await res.json(); return compute(sanitize(data)); }catch{ return []; }
    },
    renderTable(){ const tb=this.els.tbody; tb.innerHTML=''; this.state.rows.forEach(r=>{ const tr=document.createElement('tr'); tr.setAttribute('data-ticker', r.ticker); tr.innerHTML=[this.esc(r.ticker), this.esc(r.vencimiento), this.num(r.dias,0), this.pct(r.cupon,2), this.num(r.precio,2), this.pct(r.ytm_em,2), this.pct(r.ytm_ea,2)].map(td=>`<td>${td}</td>`).join(''); tb.appendChild(tr); }); },
    renderChart(){ const ctx=this.els.curve.getContext('2d'); const m=this.state.metric; const pts=this.state.rows.map(r=>({ x:r.dias, y:(m==='EA'? r.ytm_ea : r.ytm_em)*100, label:r.ticker })); const trend=this.state.showTrend? this.trendCurve(pts):[]; const ds=[{ label:`YTM_${m} (%)`, data:pts, parsing:false, backgroundColor:'rgba(13,110,253,0.6)', borderColor:'rgba(13,110,253,1)', pointRadius:6, pointHoverRadius:8 }]; if(trend.length) ds.push({ type:'line', label:'Tendencia', data:trend, parsing:false, borderColor:'rgba(108,117,125,0.85)', borderWidth:2, pointRadius:0, tension:0.35, borderDash:[6,4] }); if(this.state.chart){ this.state.chart.data={datasets:ds}; this.state.chart.options.scales.y.title.text=`YTM_${m} (%)`; this.state.chart.update(); return;} this.state.chart=new Chart(ctx,{ type:'scatter', data:{datasets:ds}, options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'nearest',intersect:false}, onHover:(e,act,chart)=>{ /* optional row highlight */ }, scales:{ x:{ title:{display:true,text:'Dias al Vencimiento'}}, y:{ title:{display:true,text:`YTM_${m} (%)`}} }, plugins:{ tooltip:{ callbacks:{ title:(items)=>{ const it=items&&items[0]; return it?(it.raw.label||''):''; }, label:(c)=>`YTM_${m}: ${c.parsed.y.toFixed(2)}%` } }, legend:{ display:true } } }); },
    trendCurve(points){ const arr=points.filter(p=>isFinite(p.x)&&isFinite(p.y)).sort((a,b)=>a.x-b.x); const n=arr.length; if(n<3) return []; const win=Math.max(3,Math.floor(n/6)); const half=Math.floor(win/2); const out=[]; for(let i=0;i<n;i++){ let s=0,c=0; for(let j=Math.max(0,i-half); j<=Math.min(n-1,i+half); j++){ s+=arr[j].y; c++; } out.push({x:arr[i].x, y:s/c}); } if(out.length>200){ const step=Math.ceil(out.length/200); return out.filter((_,idx)=> idx%step===0);} return out; },
    num(v,dec){ if(!isFinite(v)) return ''; return Number(v).toFixed(dec); }, pct(v,dec){ if(!isFinite(v)) return ''; return (v*100).toFixed(dec)+'%'; }, esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, (c)=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); },
    syncRowHighlight(){ const rows=this.els.tbody?.querySelectorAll('tr[data-ticker]')||[]; const hl=this.state.highlightTicker; const hv=this.state.hoverTicker; rows.forEach(tr=>{ const t=tr.getAttribute('data-ticker'); const should=hl? (hl===t):(hv===t); tr.classList.toggle('hard-row-highlight', !!should); }); }
  };
  window.HardBeta = HardBeta; document.addEventListener('DOMContentLoaded',()=> HardBeta.init());
})();
