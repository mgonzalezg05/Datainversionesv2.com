document.addEventListener('DOMContentLoaded', () => {
  const App = {
    state: {
      bonds: [],
      currentMetric: 'tea',
      sortConfig: { key: 'vencimiento', asc: true }
    },
    elements: {
      // Home
      tableBody: document.getElementById('bonds-table-body'),
      yieldChart: null,
      metricToggle: document.getElementById('metric-toggle'),
      tableHeaders: document.querySelectorAll('#bonds-table thead th'),

      // Admin
      adminTableBody: document.getElementById('admin-bonds-table-body'),
      bondForm: document.getElementById('bond-form'),
      formTitle: document.getElementById('form-title'),
      cancelEditBtn: document.getElementById('cancel-edit'),
      importBtn: document.getElementById('import-btn'),
      importInput: document.getElementById('import-input'),
      exportBtn: document.getElementById('export-btn')
    },

    init() {
      if (document.getElementById('chart-container')) this.initHomePage();
      if (document.getElementById('admin-panel')) this.initAdminPage();
    },

    // --- DATA & CALCULOS ---
    calculateBondMetrics(bond) {
      const precioLimpio = parseFloat(bond.precio_limpio) || 0;
      const comisionBp = parseFloat(bond.comision_bp) || 0;
      const interesDevengado = parseFloat(bond.interes_devengado) || 0;
      const valorNominal = parseFloat(bond.valor_nominal) || 0;

      const comision = precioLimpio * (comisionBp / 10000);
      const precioSucio = precioLimpio + interesDevengado + comision;

      const hoy = new Date(bond.fecha_liquidacion);
      const vto = new Date(bond.vencimiento);
      const diasAlVto = Math.max(1, (vto - hoy) / (1000 * 60 * 60 * 24));

      const rendimientoVto = precioSucio > 0 ? (valorNominal / precioSucio) - 1 : 0;
      const tem = precioSucio > 0 ? Math.pow(valorNominal / precioSucio, 30 / diasAlVto) - 1 : 0;
      const tea = Math.pow(1 + tem, 12) - 1;

      return {
        ...bond,
        comision,
        precio_sucio: precioSucio,
        dias_al_vto: diasAlVto,
        rendimiento_vto: rendimientoVto,
        tem,
        tea
      };
    },

    processBondsData(data) {
      return data.map(bond => this.calculateBondMetrics(bond));
    },

    async loadBonds() {
      try {
        const localData = localStorage.getItem('bondsData');
        if (localData) {
          this.state.bonds = this.processBondsData(JSON.parse(localData));
          return;
        }
        const response = await fetch('data/bonds.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        this.state.bonds = this.processBondsData(data);
        localStorage.setItem('bondsData', JSON.stringify(data));
      } catch (error) {
        console.error('Error cargando bonds.json:', error);
        alert('No se pudo cargar bonds.json. Si trabajás local, importá el JSON desde el panel de administración.');
      }
    },

    saveBondsToStorage() {
      const rawBonds = this.state.bonds.map(({ comision, precio_sucio, dias_al_vto, rendimiento_vto, tem, tea, ...rest }) => rest);
      localStorage.setItem('bondsData', JSON.stringify(rawBonds));
    },

    // --- HOME ---
    async initHomePage() {
      await this.loadBonds();
      this.renderBondsTable();
      this.renderChart();
      this.addHomeEventListeners();
    },

    renderBondsTable() {
      if (!this.elements.tableBody) return;
      this.sortBonds();
      this.elements.tableBody.innerHTML = this.state.bonds.map(bond => `
        <tr>
          <td>${bond.ticker}</td>
          <td>${bond.vencimiento}</td>
          <td>${bond.dias_al_vto.toFixed(0)} (${(bond.dias_al_vto / 30).toFixed(1)})</td>
          <td>${bond.precio_limpio.toFixed(2)}</td>
          <td>${bond.interes_devengado.toFixed(2)}</td>
          <td>${bond.comision_bp} ($${bond.comision.toFixed(2)})</td>
          <td>${bond.precio_sucio.toFixed(2)}</td>
          <td>${(bond.rendimiento_vto * 100).toFixed(2)}%</td>
          <td>${(bond.tem * 100).toFixed(2)}%</td>
          <td>${(bond.tea * 100).toFixed(2)}%</td>
        </tr>
      `).join('');
    },

    renderChart() {
      const canvas = document.getElementById('yield-chart');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const metric = this.state.currentMetric;

      const data = {
        datasets: [{
          label: `Rendimiento (${metric.toUpperCase()}) vs. Días al Vto.`,
          data: this.state.bonds.map(bond => ({ x: bond.dias_al_vto, y: bond[metric] * 100, label: bond.ticker })),
          backgroundColor: 'rgba(13, 110, 253, 0.6)',
          borderColor: 'rgba(13, 110, 253, 1)',
          pointRadius: 6,
          pointHoverRadius: 8
        }]
      };

      const baseOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          x: { title: { display: true, text: 'Días al Vencimiento' } },
          y: { title: { display: true, text: `Rendimiento ${metric.toUpperCase()} (%)` } }
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => {
                const it = items && items[0];
                return it ? (it.raw.label || '') : '';
              },
              label: (ctx) => `(${ctx.parsed.x.toFixed(0)} días, ${ctx.parsed.y.toFixed(2)}%)`
            }
          },
          legend: { display: true }
        }
      };

      if (this.elements.yieldChart) {
        this.elements.yieldChart.data = data;
        this.elements.yieldChart.options.scales.y.title.text = `Rendimiento ${metric.toUpperCase()} (%)`;
        this.elements.yieldChart.update();
      } else {
        this.elements.yieldChart = new Chart(ctx, { type: 'scatter', data, options: baseOptions });
      }
    },

    addHomeEventListeners() {
      this.elements.metricToggle?.addEventListener('click', () => {
        this.state.currentMetric = this.state.currentMetric === 'tea' ? 'tem' : 'tea';
        this.elements.metricToggle.textContent = `Ver ${this.state.currentMetric === 'tea' ? 'TEM' : 'TEA'}`;
        this.renderChart();
      });

      this.elements.tableHeaders.forEach(header => {
        header.addEventListener('click', () => {
          const key = header.dataset.key;
          if (!key) return;
          if (this.state.sortConfig.key === key) {
            this.state.sortConfig.asc = !this.state.sortConfig.asc;
          } else {
            this.state.sortConfig.key = key;
            this.state.sortConfig.asc = true;
          }
          this.renderBondsTable();
        });
      });
    },

    sortBonds() {
      const { key, asc } = this.state.sortConfig;
      this.state.bonds.sort((a, b) => {
        let valA = a[key];
        let valB = b[key];
        if (key === 'vencimiento') { valA = new Date(valA); valB = new Date(valB); }
        if (valA < valB) return asc ? -1 : 1;
        if (valA > valB) return asc ? 1 : -1;
        return 0;
      });
    },

    // --- ADMIN ---
    async initAdminPage() {
      await this.loadBonds();
      this.renderAdminTable();
      this.addAdminEventListeners();
    },

    renderAdminTable() {
      if (!this.elements.adminTableBody) return;
      this.sortBonds();
      this.elements.adminTableBody.innerHTML = this.state.bonds.map(bond => `
        <tr>
          <td>${bond.ticker}</td>
          <td>${bond.tipo}</td>
          <td>${bond.vencimiento}</td>
          <td>${bond.precio_limpio}</td>
          <td>${bond.comision_bp}</td>
          <td>
            <button class="btn" onclick="App.editBond('${bond.id}')">Editar</button>
            <button class="btn danger" onclick="App.deleteBond('${bond.id}')">Eliminar</button>
          </td>
        </tr>
      `).join('');
    },

    addAdminEventListeners() {
      this.elements.bondForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveBond();
      });
      this.elements.cancelEditBtn?.addEventListener('click', () => this.resetForm());
      this.elements.importBtn?.addEventListener('click', () => this.elements.importInput?.click());
      this.elements.importInput?.addEventListener('change', (e) => this.importBonds(e));
      this.elements.exportBtn?.addEventListener('click', () => this.exportBonds());
    },

    editBond(id) {
      const bond = this.state.bonds.find(b => b.id === id);
      if (!bond || !this.elements.bondForm) return;
      this.elements.formTitle.textContent = 'Editar Bono';
      this.elements.bondForm.elements['id'].value = bond.id;
      this.elements.bondForm.elements['ticker'].value = bond.ticker;
      this.elements.bondForm.elements['tipo'].value = bond.tipo;
      this.elements.bondForm.elements['vencimiento'].value = bond.vencimiento;
      this.elements.bondForm.elements['valor_nominal'].value = bond.valor_nominal;
      this.elements.bondForm.elements['precio_limpio'].value = bond.precio_limpio;
      this.elements.bondForm.elements['interes_devengado'].value = bond.interes_devengado;
      this.elements.bondForm.elements['comision_bp'].value = bond.comision_bp;
      this.elements.bondForm.elements['fecha_liquidacion'].value = bond.fecha_liquidacion;
      this.elements.bondForm.elements['fuente_cotizacion'].value = bond.fuente_cotizacion;
      this.elements.cancelEditBtn.classList.remove('hidden');
      window.scrollTo(0, 0);
    },

    deleteBond(id) {
      if (!confirm('¿Estás seguro de eliminar este bono?')) return;
      this.state.bonds = this.state.bonds.filter(b => b.id !== id);
      this.saveBondsToStorage();
      this.state.bonds = this.processBondsData(this.state.bonds);
      this.renderAdminTable();
    },

    saveBond() {
      if (!this.elements.bondForm) return;
      const formData = new FormData(this.elements.bondForm);
      const id = formData.get('id');
      const bondData = Object.fromEntries(formData.entries());
      bondData.valor_nominal = parseFloat(bondData.valor_nominal);
      bondData.precio_limpio = parseFloat(bondData.precio_limpio);
      bondData.interes_devengado = parseFloat(bondData.interes_devengado);
      bondData.comision_bp = parseFloat(bondData.comision_bp);

      if (id) {
        this.state.bonds = this.state.bonds.map(b => b.id === id ? { ...b, ...bondData } : b);
      } else {
        bondData.id = crypto.randomUUID();
        this.state.bonds.push(bondData);
      }
      this.saveBondsToStorage();
      this.state.bonds = this.processBondsData(this.state.bonds);
      this.renderAdminTable();
      this.resetForm();
    },

    resetForm() {
      if (!this.elements.bondForm) return;
      this.elements.formTitle.textContent = 'Agregar Nuevo Bono';
      this.elements.bondForm.reset();
      this.elements.bondForm.elements['id'].value = '';
      this.elements.cancelEditBtn.classList.add('hidden');
    },

    importBonds(event) {
      const file = event?.target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!Array.isArray(data)) throw new Error('El JSON debe ser un array de bonos.');
          localStorage.setItem('bondsData', JSON.stringify(data));
          this.state.bonds = this.processBondsData(data);
          this.renderAdminTable();
          alert(`${data.length} bonos importados correctamente.`);
        } catch (err) {
          console.error('Error parseando JSON:', err);
          alert(`Error al importar: ${err.message}`);
        }
      };
      reader.readAsText(file);
    },

    exportBonds() {
      const rawBonds = this.state.bonds.map(({ comision, precio_sucio, dias_al_vto, rendimiento_vto, tem, tea, ...rest }) => rest);
      const dataStr = JSON.stringify(rawBonds, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bonds.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  window.App = App;
  App.init();
});

