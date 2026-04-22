const state = {
  proyectos: [],
  proyectoId: null,
  proyecto: null,
  cabida: [],
  gantt: [],
  costos: [],
  financiamiento: {},
  capital: {},
  calculos: {},
};

function showTab(tabId, button) {
  document.querySelectorAll('.tab-pane').forEach((pane) => pane.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach((tab) => tab.classList.remove('active'));

  const pane = document.getElementById(`tab-${tabId}`);
  if (pane) pane.classList.add('active');
  if (button) button.classList.add('active');
}

function createPendingAction(name) {
  return function pendingAction() {
    console.info('[pendiente]', name, 'aun no esta conectado en esta primera version dinamica.');
  };
}

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function setHtml(id, value) {
  const el = $(id);
  if (el) el.innerHTML = value;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtNumber(value, decimals = 0) {
  return new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(toNumber(value));
}

function fmtUf(value) {
  return `${fmtNumber(value)} UF`;
}

function fmtPct(value) {
  return `${fmtNumber(value, 1)}%`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Error ${response.status}`);
  }

  return response.json();
}

function ensureProjectControls() {
  if ($('project-selector')) return;

  const topRow = document.querySelector('.proj-header > div');
  if (!topRow) return;

  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.alignItems = 'center';
  controls.style.gap = '8px';
  controls.innerHTML = `
    <select id="project-selector" class="inp" style="min-width:240px"></select>
    <button id="project-create-btn" type="button" class="btn-outline">+ Proyecto</button>
  `;

  topRow.appendChild(controls);

  $('project-selector').addEventListener('change', (event) => {
    loadProject(event.target.value);
  });

  $('project-create-btn').addEventListener('click', async () => {
    const nombre = window.prompt('Nombre del proyecto nuevo');
    if (!nombre) return;

    const direccion = window.prompt('Direccion del proyecto', '') || '';
    await api('/api/proyectos', {
      method: 'POST',
      body: JSON.stringify({ nombre, direccion, tipo: 'Residencial' }),
    });
    await loadProjects();
  });
}

function renderProjectSelector() {
  const selector = $('project-selector');
  if (!selector) return;

  selector.innerHTML = state.proyectos.map((proyecto) => `
    <option value="${escapeHtml(proyecto.id)}" ${proyecto.id === state.proyectoId ? 'selected' : ''}>
      ${escapeHtml(proyecto.nombre)}
    </option>
  `).join('');
}

function getCabidaMetrics(rows) {
  return rows.reduce((acc, row) => {
    const cantidad = toNumber(row.cantidad);
    const vendiblePorUnidad = toNumber(row.sup_interior) + toNumber(row.sup_terrazas);
    const losaPorUnidad = vendiblePorUnidad + toNumber(row.sup_comunes);

    acc.unidades += cantidad;
    acc.estacionamientos += toNumber(row.estacionamientos);
    acc.bodegas += toNumber(row.bodegas);
    acc.interior += toNumber(row.sup_interior) * cantidad;
    acc.terrazas += toNumber(row.sup_terrazas) * cantidad;
    acc.comunes += toNumber(row.sup_comunes) * cantidad;
    acc.util += toNumber(row.sup_util_mun) * cantidad;
    acc.vendible += vendiblePorUnidad * cantidad;
    acc.losa += losaPorUnidad * cantidad;
    return acc;
  }, {
    unidades: 0,
    estacionamientos: 0,
    bodegas: 0,
    interior: 0,
    terrazas: 0,
    comunes: 0,
    util: 0,
    vendible: 0,
    losa: 0,
  });
}

function renderCabidaTables(rows) {
  const totals = getCabidaMetrics(rows);

  const unitRows = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.uso)}</td>
      <td style="text-align:center">${fmtNumber(row.cantidad)}</td>
      <td style="text-align:center">${fmtNumber(row.estacionamientos)}</td>
      <td style="text-align:center">${fmtNumber(row.bodegas)}</td>
      <td style="text-align:center;color:#2563eb">${fmtNumber(toNumber(row.sup_interior) + toNumber(row.sup_terrazas), 1)}</td>
    </tr>
  `).join('');

  const areaRows = rows.map((row) => {
    const cantidad = toNumber(row.cantidad);
    const interior = toNumber(row.sup_interior) * cantidad;
    const terrazas = toNumber(row.sup_terrazas) * cantidad;
    const comunes = toNumber(row.sup_comunes) * cantidad;
    const util = toNumber(row.sup_util_mun) * cantidad;
    const vendible = interior + terrazas;
    const losa = vendible + comunes;

    return `
      <tr>
        <td>${escapeHtml(row.uso)}</td>
        <td style="text-align:center">${fmtNumber(interior, 1)}</td>
        <td style="text-align:center">${fmtNumber(terrazas, 1)}</td>
        <td style="text-align:center">${fmtNumber(comunes, 1)}</td>
        <td style="text-align:center">${fmtNumber(util, 1)}</td>
        <td style="text-align:center;color:#2563eb">${fmtNumber(vendible, 1)}</td>
        <td style="text-align:center;color:#16a34a">${fmtNumber(losa, 1)}</td>
      </tr>
    `;
  }).join('');

  setHtml('res-cabida-tbody', unitRows);
  setHtml('cabida-tbody', unitRows);
  setHtml('res-cabida-tfoot', `
    <td>Total</td>
    <td style="text-align:center">${fmtNumber(totals.unidades)}</td>
    <td style="text-align:center">${fmtNumber(totals.estacionamientos)}</td>
    <td style="text-align:center">${fmtNumber(totals.bodegas)}</td>
    <td style="text-align:center">${fmtNumber(totals.unidades ? totals.vendible / totals.unidades : 0, 1)}</td>
  `);
  setHtml('cabida-tfoot', `
    <td>Total</td>
    <td style="text-align:center">${fmtNumber(totals.unidades)}</td>
    <td style="text-align:center">${fmtNumber(totals.estacionamientos)}</td>
    <td style="text-align:center">${fmtNumber(totals.bodegas)}</td>
    <td style="text-align:center">${fmtNumber(totals.unidades ? totals.vendible / totals.unidades : 0, 1)}</td>
  `);

  setHtml('res-sup-tbody', rows.map((row) => {
    const cantidad = toNumber(row.cantidad);
    const vendible = (toNumber(row.sup_interior) + toNumber(row.sup_terrazas)) * cantidad;
    const losa = (toNumber(row.sup_interior) + toNumber(row.sup_terrazas) + toNumber(row.sup_comunes)) * cantidad;
    return `
      <tr>
        <td>${escapeHtml(row.uso)}</td>
        <td style="text-align:center;color:#2563eb">${fmtNumber(vendible, 1)} m²</td>
        <td style="text-align:center;color:#16a34a">${fmtNumber(losa, 1)} m²</td>
      </tr>
    `;
  }).join(''));

  setHtml('res-sup-tfoot', `
    <td>Total</td>
    <td style="text-align:center">${fmtNumber(totals.vendible, 1)} m²</td>
    <td style="text-align:center">${fmtNumber(totals.losa, 1)} m²</td>
  `);

  setHtml('sup-tbody', areaRows);
  setHtml('sup-tfoot', `
    <td>Total</td>
    <td style="text-align:center">${fmtNumber(totals.interior, 1)}</td>
    <td style="text-align:center">${fmtNumber(totals.terrazas, 1)}</td>
    <td style="text-align:center">${fmtNumber(totals.comunes, 1)}</td>
    <td style="text-align:center">${fmtNumber(totals.util, 1)}</td>
    <td style="text-align:center">${fmtNumber(totals.vendible, 1)}</td>
    <td style="text-align:center">${fmtNumber(totals.losa, 1)}</td>
  `);
}

function renderCabidaEditor(rows) {
  setHtml('cabida-editor', `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px">
      ${rows.map((row) => `
        <div class="card" data-cabida-row>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="grid-column:1 / -1">
              <label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Uso</label>
              <input class="inp" data-field="uso" value="${escapeHtml(row.uso)}"/>
            </div>
            <div>
              <label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Cantidad</label>
              <input class="inp" type="number" data-field="cantidad" value="${toNumber(row.cantidad)}"/>
            </div>
            <div>
              <label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Estac.</label>
              <input class="inp" type="number" data-field="estacionamientos" value="${toNumber(row.estacionamientos)}"/>
            </div>
            <div>
              <label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Bodegas</label>
              <input class="inp" type="number" data-field="bodegas" value="${toNumber(row.bodegas)}"/>
            </div>
            <div>
              <label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Sup. interior</label>
              <input class="inp" type="number" step="0.01" data-field="sup_interior" value="${toNumber(row.sup_interior)}"/>
            </div>
            <div>
              <label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Terrazas</label>
              <input class="inp" type="number" step="0.01" data-field="sup_terrazas" value="${toNumber(row.sup_terrazas)}"/>
            </div>
            <div>
              <label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Comunes</label>
              <input class="inp" type="number" step="0.01" data-field="sup_comunes" value="${toNumber(row.sup_comunes)}"/>
            </div>
            <div>
              <label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Util mun.</label>
              <input class="inp" type="number" step="0.01" data-field="sup_util_mun" value="${toNumber(row.sup_util_mun)}"/>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `);
}

function renderGanttPreview() {
  const maxFin = Math.max(1, ...state.gantt.map((hito) => toNumber(hito.fin)));
  setHtml('gantt-preview', state.gantt.map((hito) => {
    const left = (toNumber(hito.inicio) / maxFin) * 100;
    const width = (Math.max(1, toNumber(hito.duracion)) / maxFin) * 100;
    return `
      <div class="gantt-row">
        <div class="gantt-label">${escapeHtml(hito.nombre)}</div>
        <div class="gantt-track">
          <div class="gantt-bar" style="left:${left}%;width:${width}%;background:${escapeHtml(hito.color || '#3b82f6')}">
            ${fmtNumber(hito.duracion)} m
          </div>
        </div>
      </div>
    `;
  }).join(''));
}

function renderCostStructure() {
  const total = state.costos
    .flatMap((categoria) => categoria.partidas || [])
    .reduce((sum, partida) => sum + toNumber(partida.total_neto), 0);

  const colors = ['#0f172a', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444'];
  setHtml('estructura-costos-list', state.costos.map((categoria, index) => {
    const subtotal = (categoria.partidas || []).reduce((sum, partida) => sum + toNumber(partida.total_neto), 0);
    const pct = total ? (subtotal / total) * 100 : 0;
    return `
      <div class="dist-row">
        <div class="dist-label">${escapeHtml(categoria.nombre)}</div>
        <div class="dist-bar-wrap"><div class="dist-bar" style="width:${pct}%;background:${colors[index % colors.length]}"></div></div>
        <div class="dist-pct">${fmtPct(pct)}</div>
      </div>
    `;
  }).join(''));
}

function renderProjectHeader() {
  setText('proj-title', state.proyecto?.nombre || 'Proyecto');
  setText('proj-dir', state.proyecto?.direccion || 'Sin direccion');
  setText('nav-user', 'modo dinamico local');
}

function renderKpis() {
  setText('kpi-ventas', fmtUf(state.calculos.ventas_brutas));
  setText('kpi-margen', fmtUf(state.calculos.margen_neto));
  setText('kpi-margen-pct', `${fmtPct(state.calculos.margen_pct)} s/ventas`);
  setText('floating-value', fmtUf(state.calculos.costos_netos));

  const deudaMax = toNumber(state.calculos.costos_netos) * ((toNumber(state.financiamiento.credito_terreno_pct) + toNumber(state.financiamiento.linea_construccion_pct)) / 200);
  const intereses = toNumber(state.calculos.costos_netos) * ((toNumber(state.financiamiento.credito_terreno_tasa) + toNumber(state.financiamiento.linea_construccion_tasa)) / 200);

  setText('fin-deuda-max', fmtUf(deudaMax));
  setText('fin-deuda-mes', 'Estimacion inicial');
  setText('fin-intereses', fmtUf(intereses));
  setText('cap-req', fmtUf(Math.max(0, toNumber(state.calculos.costos_netos) - deudaMax)));
  setText('cap-margen', fmtUf(state.calculos.margen_neto));
}

function renderAll() {
  renderProjectSelector();
  renderProjectHeader();
  renderCabidaTables(state.cabida);
  renderCabidaEditor(state.cabida);
  renderGanttPreview();
  renderCostStructure();
  renderKpis();
}

function getCabidaRowsFromEditor() {
  return Array.from(document.querySelectorAll('[data-cabida-row]')).map((row) => ({
    uso: row.querySelector('[data-field="uso"]')?.value?.trim() || 'Nuevo uso',
    cantidad: toNumber(row.querySelector('[data-field="cantidad"]')?.value),
    estacionamientos: toNumber(row.querySelector('[data-field="estacionamientos"]')?.value),
    bodegas: toNumber(row.querySelector('[data-field="bodegas"]')?.value),
    sup_interior: toNumber(row.querySelector('[data-field="sup_interior"]')?.value),
    sup_terrazas: toNumber(row.querySelector('[data-field="sup_terrazas"]')?.value),
    sup_comunes: toNumber(row.querySelector('[data-field="sup_comunes"]')?.value),
    sup_util_mun: toNumber(row.querySelector('[data-field="sup_util_mun"]')?.value),
  }));
}

async function loadProjects() {
  state.proyectos = await api('/api/proyectos');
  if (!state.proyectos.length) return;
  await loadProject(state.proyectos[0].id);
}

async function loadProject(projectId) {
  state.proyectoId = projectId;

  const [proyecto, cabida, gantt, costos, financiamiento, capital, calculos] = await Promise.all([
    api(`/api/proyectos/${projectId}`),
    api(`/api/proyectos/${projectId}/cabida`),
    api(`/api/proyectos/${projectId}/gantt`),
    api(`/api/proyectos/${projectId}/costos`),
    api(`/api/proyectos/${projectId}/financiamiento`).catch(() => ({})),
    api(`/api/proyectos/${projectId}/capital`).catch(() => ({})),
    api(`/api/proyectos/${projectId}/calculos`).catch(() => ({})),
  ]);

  state.proyecto = proyecto;
  state.cabida = cabida;
  state.gantt = gantt;
  state.costos = costos;
  state.financiamiento = financiamiento;
  state.capital = capital;
  state.calculos = calculos;

  renderAll();
}

async function guardarCabida() {
  if (!state.proyectoId) return;
  const rows = getCabidaRowsFromEditor().filter((row) => row.uso);
  await api(`/api/proyectos/${state.proyectoId}/cabida`, {
    method: 'POST',
    body: JSON.stringify(rows),
  });
  await loadProject(state.proyectoId);
}

function agregarUso() {
  const rows = getCabidaRowsFromEditor();
  rows.push({
    uso: 'Nuevo uso',
    cantidad: 0,
    estacionamientos: 0,
    bodegas: 0,
    sup_interior: 0,
    sup_terrazas: 0,
    sup_comunes: 0,
    sup_util_mun: 0,
  });
  renderCabidaEditor(rows);
}

[
  'guardarVentas',
  'guardarGantt',
  'guardarConstruccion',
  'guardarCostos',
  'guardarFinanciamiento',
  'guardarCapital',
  'agregarHito',
  'agregarPartidaLinea',
  'toggleEstructura',
  'setCostosView',
  'setDeudaView',
  'setInteresView',
  'setCapTab',
  'exportarExcel',
  'expandAllCostos',
  'handleFileUpload',
  'calcularFinanciamiento',
  'calcularCapital',
  'updateConstrParams',
].forEach((fnName) => {
  window[fnName] = createPendingAction(fnName);
});

window.showTab = showTab;
window.guardarCabida = guardarCabida;
window.agregarUso = agregarUso;

document.addEventListener('DOMContentLoaded', async () => {
  ensureProjectControls();

  const activeTab = document.querySelector('.tab-btn.active');
  if (activeTab) {
    const match = activeTab.getAttribute('onclick')?.match(/showTab\('([^']+)'/);
    if (match) showTab(match[1], activeTab);
  }

  try {
    await loadProjects();
  } catch (error) {
    console.error(error);
    setText('proj-title', 'No se pudo cargar la version dinamica');
    setText('proj-dir', error.message);
  }
});
