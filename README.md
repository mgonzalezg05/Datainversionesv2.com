# datainversiones.com

Desarrollo local rápido (LECAPs beta)
- Abrir `index.html` desde un servidor estático simple (o doble click para ver localmente).
- La página secundaria LECAPs está en `pages/lecaps-beta.html`.

Activos nuevos (scoped)
- CSS: `assets/css/lecaps-beta.css`
- JS: `assets/js/lecaps-beta.js`
- Ejemplo: `data/lecaps.sample.json`

Notas
- Enlace “LECAPs (beta)” agregado en menú desktop y móvil (no se modifican otros ítems).
- Cálculo: base 30/360 (30E/360), TEM mensual, costos (comisión y DM) y T+N.
- Gráfico: Chart.js cargado únicamente en la página secundaria; refleja exactamente la vista filtrada.
- Cargar otro JSON con el botón “Cargar JSON” en LECAPs; validación cliente con errores claros.
