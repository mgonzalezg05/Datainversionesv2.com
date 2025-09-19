;(function(){
  const LecapsBeta = {
    state: {
      raw: null,
      items: [],
      params: { base: '30_360', t_plus: 0, comision_pct: 0, dm_pct: 0, dm_monto: 0 },
      filter: { hideStale: false, minDias: 0, mesVto: 'ALL', src: 'AUTO' },
      sort: { key: 'vencimiento', dir: 'asc' },
      metric: 'EA',
      showTrend: false,
      charts: { ea: null, em: null },
      highlightTicker: null,
      hoverTicker: null,
      userComPct: null,
      quoteMode: 'CI'
    },

    init(){
      this.cacheEls();
      // restore user prefs (commission %, quote mode)
      try {
        const savedCom = localStorage.getItem('lecapsUserCommission');
        if (savedCom != null && this.els.userCommission) {
          const pct = parseFloat(savedCom);
          if (isFinite(pct)) {
            this.els.userCommission.value = pct.toFixed(2);
            this.state.userComPct = pct/100;
          }
        }
        const savedQuote = localStorage.getItem('lecapsQuoteMode');
        if (savedQuote === 'CI' || savedQuote === '24HS') {
          this.state.quoteMode = savedQuote;
        }
      } catch(_){ }
      this.bindEvents();
      if (this.state.quoteMode === '24HS' && this.els.quote24h) {
        this.els.quote24h.click();
      }
      this.loadSampleFallback();
    },

    cacheEls(){
      this.els = {
        tbody: document.getElementById('lecaps-tbody'),
        curve: document.getElementById('lecaps-curve'),
        curveEm: document.getElementById('lecaps-curve-em'),
        curveWrapEA: document.getElementById('lecaps-curve-ea-wrap'),
        curveWrapEM: document.getElementById('lecaps-curve-em-wrap'),
        metricEA: document.getElementById('lecaps-metric-ea'),
        metricEM: document.getElementById('lecaps-metric-em'),
        trendToggle: document.getElementById('lecaps-trend-toggle'),
        userCommission: document.getElementById('lecaps-user-commission'),
        quoteCI: document.getElementById('lecaps-quote-ci'),
        quote24h: document.getElementById('lecaps-quote-24h')
      };
    },

    bindEvents(){
      // no parametros editables en esta pagina

      // sin filtros en esta pagina

      // export se puede invocar por consola si fuera necesario

      // clear persistent highlight when clicking anywhere outside the charts
      document.addEventListener('click', (e)=>{
        const inEA = this.els.curve && this.els.curve.contains(e.target);
        const inEM = this.els.curveEm && this.els.curveEm.contains(e.target);
        if (this.state.highlightTicker && !(inEA || inEM)) {
          this.state.highlightTicker = null;
          this.syncRowHighlight();
        }
      });

      // metric switch
      const setMetric = (m)=>{
        this.state.metric = m;
        this.els.metricEA.classList.toggle('is-active', m==='EA');
        this.els.metricEM.classList.toggle('is-active', m==='EM');
        this.els.metricEA.setAttribute('aria-pressed', m==='EA' ? 'true':'false');
        this.els.metricEM.setAttribute('aria-pressed', m==='EM' ? 'true':'false');
        this.els.curveWrapEA.classList.toggle('lecaps-hidden', m!=='EA');
        this.els.curveWrapEM.classList.toggle('lecaps-hidden', m!=='EM');
      };
      this.els.metricEA.addEventListener('click', ()=> setMetric('EA'));
      this.els.metricEM.addEventListener('click', ()=> setMetric('EM'));
      setMetric('EA');

      // user commission override
      if (this.els.userCommission) {
        this.els.userCommission.addEventListener('input', ()=>{
          const raw = (this.els.userCommission.value||'').toString().replace(',', '.');
          const v = parseFloat(raw);
          this.state.userComPct = isFinite(v) ? (v/100) : null;
          this.compute();
          try { if (isFinite(v)) localStorage.setItem('lecapsUserCommission', v.toFixed(2)); } catch(_){ }
        });
      }

      // quote mode toggle (CI / 24 hs)
      const setQuote = (mode)=>{
        this.state.quoteMode = mode;
        if (this.els.quoteCI && this.els.quote24h) {
          this.els.quoteCI.classList.toggle('is-active', mode==='CI');
          this.els.quote24h.classList.toggle('is-active', mode==='24HS');
          this.els.quoteCI.setAttribute('aria-pressed', mode==='CI' ? 'true':'false');
          this.els.quote24h.setAttribute('aria-pressed', mode==='24HS' ? 'true':'false');
        }
        this.render();
      };
      if (this.els.quoteCI) this.els.quoteCI.addEventListener('click', ()=> { setQuote('CI'); try { localStorage.setItem('lecapsQuoteMode','CI'); } catch(_){ } });
      if (this.els.quote24h) this.els.quote24h.addEventListener('click', ()=> { setQuote('24HS'); try { localStorage.setItem('lecapsQuoteMode','24HS'); } catch(_){ } });
      setQuote('CI');

      // trend toggle
      if (this.els.trendToggle) {
        this.els.trendToggle.checked = !!this.state.showTrend;
        this.els.trendToggle.addEventListener('change', ()=>{
          this.state.showTrend = !!this.els.trendToggle.checked;
          // re-render charts with/without trend
          this.render();
        });
      }

      // sorting by header click
      const thead = document.querySelector('#lecaps-table thead');
      if (thead) {
        thead.addEventListener('click', (e)=>{
          const th = e.target.closest('th[data-key]');
          if (!th) return;
          const key = th.getAttribute('data-key');
          if (!key) return;
          const cur = this.state.sort;
          const dir = (cur.key===key && cur.dir==='asc') ? 'desc' : 'asc';
          this.state.sort = { key, dir };
          this.render();
        });
      }
    },

    async loadSampleFallback(){
      try {
        // Prefer localStorage override if available (set from Admin panel)
        const stored = localStorage.getItem('lecapsData');
        if (stored) {
          try {
            const dataLS = this.sanitize(JSON.parse(stored));
            const v = this.validate(dataLS);
            if (v.ok) {
              this.state.raw = dataLS;
              this.applyParamsFromData(dataLS);
              this.compute();
              return;
            }
          } catch (_) { /* ignore */ }
        }
        // Fallback to sample file
        const res = await fetch('../data/lecaps.sample.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = this.sanitize(await res.json());
        const { ok, errors } = this.validate(data);
        if (!ok) { this.showErrors(errors); return; }
        this.state.raw = data;
        this.applyParamsFromData(data);
        this.compute();
      } catch (_) { /* ignore offline */ }
    },

    validate(data){
      const errors = [];
      if (!data || typeof data !== 'object') errors.push('Raiz debe ser objeto');
      if (!data.version || typeof data.version !== 'string') errors.push('Falta version (p.ej. lecaps.v1)');
      if (!data.updated_at || isNaN(Date.parse(data.updated_at))) errors.push('updated_at invalido');
      const p = data.params || {};
      if (p.base && p.base !== '30_360' && p.base !== 'ACT_365') errors.push('params.base debe ser 30_360 o ACT_365');
      if (p.t_plus != null && (!Number.isInteger(p.t_plus) || p.t_plus < 0)) errors.push('params.t_plus debe ser entero >= 0');
      if (p.comision_pct != null && typeof p.comision_pct !== 'number') errors.push('params.comision_pct debe ser numero');
      if (p.dm_pct != null && typeof p.dm_pct !== 'number') errors.push('params.dm_pct debe ser numero');
      if (p.dm_monto != null && typeof p.dm_monto !== 'number') errors.push('params.dm_monto debe ser numero');
      if (!Array.isArray(data.items)) errors.push('items debe ser lista');

      (data.items||[]).forEach((it, idx)=>{
        if (!it || typeof it !== 'object') { errors.push(`item[${idx}] invalido`); return; }
        ['ticker','emision','vencimiento','tem'].forEach(k=>{ if (it[k]==null) errors.push(`item[${idx}].${k} requerido`); });
        if (it.emision && isNaN(Date.parse(it.emision))) errors.push(`item[${idx}].emision invalida`);
        if (it.vencimiento && isNaN(Date.parse(it.vencimiento))) errors.push(`item[${idx}].vencimiento invalido`);
        if (typeof it.tem !== 'number') errors.push(`item[${idx}].tem debe ser numero`);
        if (it.precios && typeof it.precios !== 'object') errors.push(`item[${idx}].precios invalido`);
        if (it.precios && it.precios.hora && isNaN(Date.parse(it.precios.hora))) errors.push(`item[${idx}].precios.hora invalido`);
        if (it.overrides && typeof it.overrides !== 'object') errors.push(`item[${idx}].overrides invalido`);
      });

      return { ok: errors.length===0, errors };
    },

    sanitize(raw){
      try {
        const data = JSON.parse(JSON.stringify(raw));
        const num = (v)=> (typeof v==='string' && v.trim()!=='' ? Number(v) : v);
        data.params = data.params || {};
        data.params.t_plus = num(data.params.t_plus);
        data.params.comision_pct = num(data.params.comision_pct);
        data.params.dm_pct = num(data.params.dm_pct);
        data.params.dm_monto = num(data.params.dm_monto);
        (data.items||[]).forEach(it=>{
          it.tem = num(it.tem);
          it.precios = it.precios || {};
          it.precios.ultimo = num(it.precios.ultimo);
          it.precios.compra = num(it.precios.compra);
          it.precios.cierre = num(it.precios.cierre);
          it.overrides = it.overrides || {};
          it.overrides.comision_pct = num(it.overrides.comision_pct);
          it.overrides.dm_pct = num(it.overrides.dm_pct);
          it.overrides.dm_monto = num(it.overrides.dm_monto);
          it.overrides.t_plus = (it.overrides.t_plus===''? null : num(it.overrides.t_plus));
        });
        return data;
      } catch { return raw; }
    },

    applyParamsFromData(data){
      const p = data.params || {};
      // Force base 30_360 as per spec (ignore ACT_365)
      this.state.params.base = '30_360';
      this.state.params.t_plus = Number.isInteger(p.t_plus) && p.t_plus>=0 ? p.t_plus : 0;
      this.state.params.comision_pct = typeof p.comision_pct==='number' ? p.comision_pct : 0;
      this.state.params.dm_pct = typeof p.dm_pct==='number' ? p.dm_pct : 0;
      this.state.params.dm_monto = typeof p.dm_monto==='number' ? p.dm_monto : 0;

      // Reflect into UI if inputs exist (page may be read-only)
      if (this.els.tplus) this.els.tplus.value = String(this.state.params.t_plus);
      if (this.els.comision) this.els.comision.value = (this.state.params.comision_pct*100).toFixed(2);
      if (this.els.dmpct) this.els.dmpct.value = (this.state.params.dm_pct*100).toFixed(2);
      if (this.els.dmmonto) this.els.dmmonto.value = String(this.state.params.dm_monto);
    },

    setParams(patch){
      Object.assign(this.state.params, patch || {});
      this.compute();
    },

    compute(){
      if (!this.state.raw) { this.renderEmpty(); return; }
      const now = new Date();
      const items = (this.state.raw.items||[]).map((it)=>{
        const ovr = it.overrides || {};
        const precios = it.precios || {};
        const emision = new Date(it.emision);
        const vto = new Date(it.vencimiento);
        const tPlus = Number.isInteger(ovr.t_plus) ? ovr.t_plus : this.state.params.t_plus;
        const fechaLiqui = this.addDays(now, tPlus);

        const diasAlVto = Math.ceil((vto - fechaLiqui) / (1000*60*60*24));
        const vig360 = this.diff30E360(emision, vto);
        const meses = Math.floor(vig360 / 30);
        const frac = (vig360 % 30) / 30;
        const tem = it.tem; // monthly effective
        const FV = 100 * Math.pow(1 + tem, meses + frac);

        // price selection
        const srcPref = this.state.filter.src;
        const pick = (srcPref==='AUTO') ? this.pickPrecioAuto(precios) : this.pickPrecioFor(srcPref, precios);
        const precio_base = pick.valor;
        const fuente_precio = this.state.quoteMode; // display label (CI o 24HS)

        let comBase = (ovr.comision_pct!=null) ? ovr.comision_pct : (this.state.params.comision_pct||0);
        const com = (this.state.userComPct!=null) ? this.state.userComPct : comBase;
        const dm_pct = (ovr.dm_pct!=null) ? ovr.dm_pct : (this.state.params.dm_pct||0);
        const dm_monto = (ovr.dm_monto!=null) ? ovr.dm_monto : (this.state.params.dm_monto||0);

        const precio_neto = (precio_base * (1 + com) * (1 + dm_pct)) + dm_monto;
        const factor_total = FV / precio_neto;

        const valid = diasAlVto > 0 && factor_total>0 && isFinite(factor_total);
        const tir_em = valid ? Math.pow(factor_total, 30 / diasAlVto) - 1 : NaN; // mensual efectiva
        const tir_ea = valid ? Math.pow(factor_total, 360 / diasAlVto) - 1 : NaN; // anual efectiva base 360

        const stale = this.isStale(precios.hora, now);

        return {
          ticker: it.ticker,
          emision: it.emision,
          vencimiento: it.vencimiento,
          dias: diasAlVto,
          tem,
          FV,
          precio_base,
          fuente_precio,
          com,
          dm_pct,
          dm_monto,
          precio_neto,
          tir_em,
          tir_ea,
          stale,
          valid
        };
      }).filter(r => r.valid);

      this.state.items = items;
      this.render();
    },

    render(){
      const f = this.state.filter;
      let visible = this.state.items.filter(it => {
        if (f.hideStale && it.stale) return false;
        if (f.minDias && it.dias < f.minDias) return false;
        if (f.mesVto && f.mesVto!=='ALL') {
          const m = (new Date(it.vencimiento)).toISOString().slice(0,7); // YYYY-MM
          if (m !== f.mesVto) return false;
        }
        return true;
      });

      // sort
      const s = this.state.sort;
      const dir = s.dir==='desc' ? -1 : 1;
      visible.sort((a,b)=>{
        const ka = a[s.key];
        const kb = b[s.key];
        if (s.key==='vencimiento' || s.key==='emision') {
          return (new Date(ka) - new Date(kb)) * dir;
        }
        if (typeof ka==='number' && typeof kb==='number') return (ka - kb) * dir;
        return String(ka).localeCompare(String(kb)) * dir;
      });

      // top-3 by TIR_EA for styling
      const top3 = [...visible].sort((a,b)=> (b.tir_ea||-1) - (a.tir_ea||-1)).slice(0,3).map(x=>x.ticker);

      // table
      const tbody = this.els.tbody;
      tbody.innerHTML = '';
      for (const r of visible) {
        const tr = document.createElement('tr');
        tr.setAttribute('data-ticker', r.ticker);
        if (r.stale) tr.classList.add('lecaps-row-stale');
        if (top3.includes(r.ticker)) tr.classList.add('lecaps-top');
        if (this.state.highlightTicker === r.ticker || this.state.hoverTicker === r.ticker) tr.classList.add('lecaps-row-highlight');
        tr.innerHTML = [
          this.esc(r.ticker),
          this.esc(r.vencimiento),
          this.num(r.dias,0),
          this.pct(r.tem, 3),
          this.num(r.FV,2),
          `${this.num(r.precio_base,2)} (${this.esc(r.fuente_precio)})`,
          this.num(r.precio_neto,2),
          this.pct(r.tir_em,2),
          this.pct(r.tir_ea,2),
          r.stale ? 'Si' : 'No'
        ].map(td=> `<td>${td}</td>`).join('');
        tbody.appendChild(tr);
      }

      // chart
      this.renderChartEA(visible, top3);
      this.renderChartEM(visible, top3);

      // update sort indicators
      this.updateSortIndicators();
    },

    renderEmpty(){
      this.els.tbody.innerHTML = '';
      this.renderChartEA([], []);
      this.renderChartEM([], []);
    },

    renderChartEA(rows, top3){
      const ctx = this.els.curve.getContext('2d');
      const dataPoints = rows.map(r=>({
        x: r.dias,
        y: (r.tir_ea||0)*100,
        r: top3.includes(r.ticker) ? 6 : 4,
        backgroundColor: 'rgba(13,110,253,0.6)',
        borderColor: 'rgba(13,110,253,1)',
        ticker: r.ticker,
        stale: r.stale,
        fuente: r.fuente_precio,
        etiqueta: `${r.ticker} - ${this.num(r.dias,0)}d - ${this.pct(r.tir_ea,2)} - src: ${r.fuente_precio}`
      }));

      const trend = this.state.showTrend ? this.computeTrendCurve(dataPoints) : [];

      const cfg = {
        type: 'scatter',
        data: { datasets: [
          { label: 'TIR_EA (%)', data: dataPoints, parsing: false, pointRadius: (ctx)=> ctx.raw?.r || 4 },
          trend.length ? { type: 'line', label: 'Tendencia', data: trend, parsing: false, borderColor: 'rgba(108,117,125,0.85)', borderWidth: 2, pointRadius: 0, tension: 0.35, borderDash: [6,4] } : null
        ].filter(Boolean) },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'nearest', intersect: false },
          onHover: (evt, actives, chart) => {
            if (this.state.highlightTicker) { return; }
            if (actives && actives.length) {
              const p = actives[0];
              const d = chart.data.datasets[p.datasetIndex].data[p.index];
              this.state.hoverTicker = d.ticker;
            } else {
              this.state.hoverTicker = null;
            }
            this.syncRowHighlight();
          },
          onClick: (evt, actives, chart) => {
            if (actives && actives.length) {
              const p = actives[0];
              const d = chart.data.datasets[p.datasetIndex].data[p.index];
              this.state.highlightTicker = (this.state.highlightTicker === d.ticker) ? null : d.ticker;
              this.state.hoverTicker = null;
            } else {
              // click sobre el fondo del grafico: limpiar seleccion
              this.state.highlightTicker = null;
            }
            this.syncRowHighlight();
          },
          scales: {
            x: { title: { display: true, text: 'Dias al Vencimiento' } },
            y: { title: { display: true, text: 'TIR_EA (%)' } }
          },
          plugins: {
            tooltip: {
              filter: (item) => item.datasetIndex === 0,
              callbacks: {
                title: (items)=>{
                  const it = items && items[0];
                  return it ? (it.raw.ticker || '') : '';
                },
                label: (ctx)=>{
                  const y = ctx.parsed.y;
                  return `TIR_EA: ${y.toFixed(2)}%`;
                }
              }
            },
            legend: { display: false }
          }
        }
      };

      if (this.state.charts.ea) { this.state.charts.ea.destroy(); this.state.charts.ea = null; }
      this.state.charts.ea = new Chart(ctx, cfg);
    },

    renderChartEM(rows, top3){
      const ctx = this.els.curveEm.getContext('2d');
      const dataPoints = rows.map(r=>({
        x: r.dias,
        y: (r.tir_em||0)*100,
        r: top3.includes(r.ticker) ? 6 : 4,
        backgroundColor: 'rgba(13,110,253,0.6)',
        borderColor: 'rgba(13,110,253,1)',
        ticker: r.ticker,
        stale: r.stale,
        fuente: r.fuente_precio,
        etiqueta: `${r.ticker} - ${this.num(r.dias,0)}d - ${this.pct(r.tir_em,2)} - src: ${r.fuente_precio}`
      }));

      const trend = this.state.showTrend ? this.computeTrendCurve(dataPoints) : [];

      const cfg = {
        type: 'scatter',
        data: { datasets: [
          { label: 'TIR_EM (%)', data: dataPoints, parsing: false, pointRadius: (ctx)=> ctx.raw?.r || 4 },
          trend.length ? { type: 'line', label: 'Tendencia', data: trend, parsing: false, borderColor: 'rgba(108,117,125,0.85)', borderWidth: 2, pointRadius: 0, tension: 0.35, borderDash: [6,4] } : null
        ].filter(Boolean) },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'nearest', intersect: false },
          onHover: (evt, actives, chart) => {
            if (this.state.highlightTicker) { return; }
            if (actives && actives.length) {
              const p = actives[0];
              const d = chart.data.datasets[p.datasetIndex].data[p.index];
              this.state.hoverTicker = d.ticker;
            } else {
              this.state.hoverTicker = null;
            }
            this.syncRowHighlight();
          },
          onClick: (evt, actives, chart) => {
            if (actives && actives.length) {
              const p = actives[0];
              const d = chart.data.datasets[p.datasetIndex].data[p.index];
              this.state.highlightTicker = (this.state.highlightTicker === d.ticker) ? null : d.ticker;
              this.state.hoverTicker = null;
            } else {
              // click sobre el fondo del grafico: limpiar seleccion
              this.state.highlightTicker = null;
            }
            this.syncRowHighlight();
          },
          scales: {
            x: { title: { display: true, text: 'Dias al Vencimiento' } },
            y: { title: { display: true, text: 'TIR_EM (%)' } }
          },
          plugins: {
            tooltip: {
              filter: (item) => item.datasetIndex === 0,
              callbacks: {
                title: (items)=>{
                  const it = items && items[0];
                  return it ? (it.raw.ticker || '') : '';
                },
                label: (ctx)=>{
                  const y = ctx.parsed.y;
                  return `TIR_EM: ${y.toFixed(2)}%`;
                }
              }
            },
            legend: { display: false }
          }
        }
      };

      if (this.state.charts.em) { this.state.charts.em.destroy(); this.state.charts.em = null; }
      this.state.charts.em = new Chart(ctx, cfg);
    },

    exportVisible(fmt){
      // read current table rows
      const rows = Array.from(this.els.tbody.querySelectorAll('tr')).map(tr=>{
        const cells = tr.querySelectorAll('td');
        return {
          ticker: cells[0]?.textContent || '',
          vencimiento: cells[1]?.textContent || '',
          dias: cells[2]?.textContent || '',
          tem: cells[3]?.textContent || '',
          fv: cells[4]?.textContent || '',
          precio_src: cells[5]?.textContent || '',
          precio_neto: cells[6]?.textContent || '',
          tir_em: cells[7]?.textContent || '',
          tir_ea: cells[8]?.textContent || '',
          stale: cells[9]?.textContent || ''
        };
      });

      if (fmt==='json') {
        const blob = new Blob([JSON.stringify(rows)], {type:'application/json'});
        this.download(blob, 'lecaps.visible.json');
      } else {
        const headers = Object.keys(rows[0]||{});
        const csv = [headers.join(','), ...rows.map(r=> headers.map(h=> '"'+String(r[h]).replaceAll('"','""')+'"').join(','))].join('\n');
        const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
        this.download(blob, 'lecaps.visible.csv');
      }
    },

    // Helpers
    showErrors(msgs){
      if (this.els && this.els.errors) {
        this.els.errors.hidden = false;
        this.els.errors.innerHTML = msgs.map(m=> `<div>- ${this.esc(m)}</div>`).join('');
      } else {
        console.warn('LECAPs validation errors:', msgs);
      }
    },
    clearErrors(){ if (this.els && this.els.errors){ this.els.errors.hidden = true; this.els.errors.textContent = ''; } },
    download(blob, filename){
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, (c)=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); },
    num(v, dec){ if (!isFinite(v)) return ''; return Number(v).toFixed(dec); },
    pct(v, dec){ if (!isFinite(v)) return ''; return (v*100).toFixed(dec) + '%'; },
    addDays(d, n){ const x=new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate()+n); return x; },
    isWeekend(d){ const day=d.getDay(); return day===0 || day===6; },
    businessDaysDiff(from, to){
      if (!from) return Infinity;
      const a = new Date(from);
      const b = new Date(to);
      if (isNaN(a)||isNaN(b)) return Infinity;
      // count whole business days between dates (approx, no holidays)
      let days = 0;
      let cur = new Date(a.getFullYear(), a.getMonth(), a.getDate());
      const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
      const step = (end - cur) >= 0 ? 1 : -1;
      while ((step>0 && cur < end) || (step<0 && cur > end)) {
        cur.setDate(cur.getDate() + step);
        if (!this.isWeekend(cur)) days += step;
      }
      return Math.abs(days);
    },
    isStale(horaIso, now){
      if (!horaIso) return true;
      const bd = this.businessDaysDiff(horaIso, now||new Date());
      return bd >= 1; // >= 1 dia habil
    },
    diff30E360(d1, d2){
      // 30E/360 European
      const y1=d1.getFullYear(), m1=d1.getMonth()+1, d1d=d1.getDate();
      const y2=d2.getFullYear(), m2=d2.getMonth()+1, d2d=d2.getDate();
      const dd1 = Math.min(d1d, 30);
      const dd2 = Math.min(d2d, 30);
      return (y2 - y1)*360 + (m2 - m1)*30 + (dd2 - dd1);
    },
    pickPrecioAuto(pre){
      const cand = [
        {src:'ULTIMO', v: pre.ultimo},
        {src:'COMPRA', v: pre.compra},
        {src:'CIERRE', v: pre.cierre}
      ];
      for (const c of cand) { if (typeof c.v==='number' && c.v>0) return { valor: c.v, src: c.src }; }
      return { valor: NaN, src:'N/A' };
    },
    pickPrecioFor(src, pre){
      const map = { ULTIMO:'ultimo', COMPRA:'compra', CIERRE:'cierre' };
      const key = map[src] || 'ultimo';
      const v = pre[key];
      if (typeof v==='number' && v>0) return { valor: v, src };
      // fallback to auto if requested src missing/invalid
      return this.pickPrecioAuto(pre);
    },
    populateMesFilter(items){
      const sel = this.els.filterMes;
      const set = new Set(items.map(it=> (new Date(it.vencimiento)).toISOString().slice(0,7)));
      const arr = Array.from(set).sort();
      const prev = sel.value;
      sel.innerHTML = '<option value="ALL">Todos</option>' + arr.map(m=> `<option value="${m}">${m}</option>`).join('');
      sel.value = prev && (prev==='ALL' || set.has(prev)) ? prev : 'ALL';
    },

    updateSortIndicators(){
      const ths = document.querySelectorAll('#lecaps-table thead th[data-key]');
      ths.forEach(th=> th.classList.remove('lecaps-sort-asc','lecaps-sort-desc'));
      const active = Array.from(ths).find(th => th.getAttribute('data-key') === this.state.sort.key);
      if (active) {
        active.classList.add(this.state.sort.dir==='desc' ? 'lecaps-sort-desc' : 'lecaps-sort-asc');
      }
    },

    // Compute smoothed trend curve using moving-average over sorted x
    computeTrendCurve(points){
      const arr = points.filter(p => isFinite(p?.x) && isFinite(p?.y)).sort((a,b)=> a.x - b.x);
      const n = arr.length;
      if (n < 3) return [];
      const win = Math.max(3, Math.floor(n/6));
      const half = Math.floor(win/2);
      const out = [];
      for (let i=0;i<n;i++){
        let s=0,c=0;
        for (let j=Math.max(0,i-half); j<=Math.min(n-1,i+half); j++) { s += arr[j].y; c++; }
        out.push({ x: arr[i].x, y: s/c });
      }
      // optional downsample if too many points
      if (out.length > 200) {
        const step = Math.ceil(out.length / 200);
        return out.filter((_,idx)=> idx % step === 0);
      }
      return out;
    },

    syncRowHighlight(){
      const rows = this.els.tbody?.querySelectorAll('tr[data-ticker]') || [];
      const hl = this.state.highlightTicker;
      const hv = this.state.hoverTicker;
      rows.forEach(tr => {
        const t = tr.getAttribute('data-ticker');
        const should = hl ? (hl === t) : (hv === t);
        tr.classList.toggle('lecaps-row-highlight', !!should);
      });
    }
  };

  window.LecapsBeta = LecapsBeta;
})();



