// Lightweight override for home chart/table: improved tooltip and row highlight
document.addEventListener('DOMContentLoaded', () => {
  const chartEl = document.getElementById('yield-chart');
  const tbody = document.getElementById('bonds-table-body');
  const toggleBtn = document.getElementById('metric-toggle');
  if (!chartEl || !tbody || !toggleBtn || typeof Chart === 'undefined') return;

  const State = { bonds: [], metric: 'tea', chart: null, lastRow: null };

  const calc = (bond) => {
    const precioLimpio = parseFloat(bond.precio_limpio) || 0;
    const comisionBp = parseFloat(bond.comision_bp) || 0;
    const interesDevengado = parseFloat(bond.interes_devengado) || 0;
    const valorNominal = parseFloat(bond.valor_nominal) || 0;
    const comision = precioLimpio * (comisionBp / 10000);
    const precioSucio = precioLimpio + interesDevengado + comision;
    const hoy = new Date(bond.fecha_liquidacion);
    const vto = new Date(bond.vencimiento);
    const diasAlVto = Math.max(1, (vto - hoy) / (1000*60*60*24));
    const rendimientoVto = precioSucio > 0 ? (valorNominal / precioSucio) - 1 : 0;
    const tem = precioSucio > 0 ? Math.pow(valorNominal / precioSucio, 30 / diasAlVto) - 1 : 0;
    const tea = Math.pow(1 + tem, 12) - 1;
    return { ...bond, comision, precio_sucio: precioSucio, dias_al_vto: diasAlVto, rendimiento_vto: rendimientoVto, tem, tea };
  };

  async function load() {
    const localData = localStorage.getItem('bondsData');
    if (localData) { try { return JSON.parse(localData).map(calc); } catch(_){} }
    try { const res = await fetch('data/bonds.json'); if (!res.ok) throw new Error(); const data = await res.json(); return data.map(calc); } catch(_){ return []; }
  }

  function renderTable() {
    tbody.innerHTML = State.bonds.map(b => `
      <tr data-ticker="${b.ticker}">
        <td>${b.ticker}</td>
        <td>${b.vencimiento}</td>
        <td>${b.dias_al_vto.toFixed(0)} (${(b.dias_al_vto/30).toFixed(1)})</td>
        <td>${b.precio_limpio.toFixed(2)}</td>
        <td>${b.interes_devengado.toFixed(2)}</td>
        <td>${b.comision_bp} ($${b.comision.toFixed(2)})</td>
        <td>${b.precio_sucio.toFixed(2)}</td>
        <td>${(b.rendimiento_vto*100).toFixed(2)}%</td>
        <td>${(b.tem*100).toFixed(2)}%</td>
        <td>${(b.tea*100).toFixed(2)}%</td>
      </tr>
    `).join('');
  }

  function highlightRow(ticker) {
    if (State.lastRow && document.body.contains(State.lastRow)) {
      State.lastRow.style.backgroundColor = '';
      State.lastRow.style.outline = '';
    }
    State.lastRow = null;
    if (!ticker) return;
    const row = tbody.querySelector(`tr[data-ticker="${ticker}"]`);
    if (row) {
      row.style.backgroundColor = 'rgba(2,132,199,0.10)';
      row.style.outline = '1px solid rgba(2,132,199,0.35)';
      State.lastRow = row;
    }
  }

  function renderChart() {
    const m = State.metric;
    const datasets = [{
      label: `Rendimiento (${m.toUpperCase()}) vs. Días al Vto.`,
      data: State.bonds.map(b => ({ x: b.dias_al_vto, y: b[m]*100, label: b.ticker })),
      backgroundColor: 'rgba(13,110,253,0.6)',
      borderColor: 'rgba(13,110,253,1)',
      pointRadius: 6,
      pointHoverRadius: 8,
      hitRadius: 12
    }];
    if (State.chart) {
      State.chart.data = { datasets };
      State.chart.options.scales.y.title.text = `Rendimiento ${m.toUpperCase()} (%)`;
      State.chart.update();
      return;
    }
    State.chart = new Chart(chartEl.getContext('2d'), {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        onHover: (evt, actives, chart) => {
          if (actives && actives.length) {
            const p = actives[0];
            const d = chart.data.datasets[p.datasetIndex].data[p.index];
            highlightRow(d.label);
          } else { highlightRow(null); }
        },
        scales: {
          x: { title: { display: true, text: 'Días al Vencimiento' } },
          y: { title: { display: true, text: `Rendimiento ${m.toUpperCase()} (%)` } }
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => { const it = items && items[0]; return it ? (it.raw.label || '') : ''; },
              label: (ctx) => { const y = ctx.parsed.y; const tag = (State.metric==='tea'?'TEA':'TEM'); return `${tag}: ${y.toFixed(2)}%`; }
            }
          },
          legend: { display: true }
        }
      }
    });
  }

  toggleBtn.addEventListener('click', () => {
    State.metric = (State.metric === 'tea') ? 'tem' : 'tea';
    toggleBtn.textContent = `Ver ${State.metric === 'tea' ? 'TEM' : 'TEA'}`;
    renderChart();
  });

  load().then(data => { State.bonds = data; renderTable(); renderChart(); });
});

