const state = {
  proyectos: [],
  proyectoId: null,
  proyecto: null,
  cabida: [],
  gantt: [],
  ventasConfig: [],
  ventasCronograma: [],
  construccion: {},
  costos: [],
  financiamiento: {},
  capital: {},
  calculos: {},
  health: null,
  sync: {
    status: 'loading',
    message: 'Verificando conexion',
    detail: 'Conectando con backend',
    lastSavedAt: null,
  },
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
    console.info('[pendiente]', name, 'aun no esta conectado en esta version.');
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

function normalizeProject(project = {}) {
  return {
    ...project,
    terraza_util_pct: project.terraza_util_pct ?? 50,
    comunes_tipo: project.comunes_tipo || 'porcentaje',
    comunes_valor: project.comunes_valor ?? 0,
    estacionamientos_cantidad: project.estacionamientos_cantidad ?? 0,
    estacionamientos_sup_interior: project.estacionamientos_sup_interior ?? 0,
    estacionamientos_sup_terrazas: project.estacionamientos_sup_terrazas ?? 0,
    bodegas_cantidad: project.bodegas_cantidad ?? 0,
    bodegas_sup_interior: project.bodegas_sup_interior ?? 0,
    bodegas_sup_terrazas: project.bodegas_sup_terrazas ?? 0,
  };
}

function getMunicipalUsefulPerUnit(interior, terraza, pct = state.proyecto?.terraza_util_pct) {
  return toNumber(interior) + (toNumber(terraza) * toNumber(pct) / 100);
}

function getBaseUnitRows() {
  return state.cabida.map((row) => ({
    ...row,
    sup_comunes: 0,
    sup_util_mun: getMunicipalUsefulPerUnit(row.sup_interior, row.sup_terrazas),
    isAccessory: false,
  }));
}

function getUsefulMunicipalAreaTotal() {
  const unitRows = getBaseUnitRows().concat(getCabidaAccessoryRows());
  return unitRows.reduce((sum, row) => sum + (toNumber(row.sup_util_mun) * toNumber(row.cantidad)), 0);
}

function getCommonAreaTotal() {
  const proyecto = normalizeProject(state.proyecto);
  if (proyecto.comunes_tipo === 'total') return toNumber(proyecto.comunes_valor);
  return getUsefulMunicipalAreaTotal() * toNumber(proyecto.comunes_valor) / 100;
}

function getAboveGradeAreaTotal() {
  return getUsefulMunicipalAreaTotal() + getCommonAreaTotal();
}

function getCabidaAccessoryRows() {
  const proyecto = normalizeProject(state.proyecto);
  return [
    {
      uso: 'ESTACIONAMIENTOS',
      cantidad: toNumber(proyecto.estacionamientos_cantidad),
      sup_interior: toNumber(proyecto.estacionamientos_sup_interior),
      sup_terrazas: toNumber(proyecto.estacionamientos_sup_terrazas),
      sup_comunes: 0,
      sup_util_mun: getMunicipalUsefulPerUnit(proyecto.estacionamientos_sup_interior, proyecto.estacionamientos_sup_terrazas),
      isAccessory: true,
    },
    {
      uso: 'BODEGAS',
      cantidad: toNumber(proyecto.bodegas_cantidad),
      sup_interior: toNumber(proyecto.bodegas_sup_interior),
      sup_terrazas: toNumber(proyecto.bodegas_sup_terrazas),
      sup_comunes: 0,
      sup_util_mun: getMunicipalUsefulPerUnit(proyecto.bodegas_sup_interior, proyecto.bodegas_sup_terrazas),
      isAccessory: true,
    },
  ].filter((row) => row.cantidad > 0);
}

function getCabidaDisplayRows() {
  return getBaseUnitRows().concat(getCabidaAccessoryRows());
}

function getAccessorySalesConfig() {
  const source = state.ventasConfig[0] || {};
  return {
    precio_estacionamiento: toNumber(source.precio_estacionamiento),
    precio_bodega: toNumber(source.precio_bodega),
  };
}

function normalizeConstruccion(data = {}) {
  return {
    ...data,
    sup_sobre_tierra: data.sup_sobre_tierra ?? 0,
    costo_uf_m2_sobre_tierra: data.costo_uf_m2_sobre_tierra ?? 0,
    sup_bajo_tierra: data.sup_bajo_tierra ?? 0,
    pct_bajo_tierra_sobre_cota_0: data.pct_bajo_tierra_sobre_cota_0 ?? 0,
    costo_uf_m2_bajo_tierra: data.costo_uf_m2_bajo_tierra ?? 0,
    plazo_meses: data.plazo_meses ?? 0,
    anticipo_pct: data.anticipo_pct ?? 0,
    retencion_pct: data.retencion_pct ?? 0,
    ancho_curva: data.ancho_curva ?? 0.5,
    peak_gasto: data.peak_gasto ?? 0.5,
  };
}

function getConstructionDuration() {
  const hito = state.gantt.find((row) => /CONSTRUCCION/i.test(row.nombre || ''));
  return hito ? Math.max(1, toNumber(hito.duracion)) : Math.max(1, toNumber(state.construccion?.plazo_meses || 1));
}

function getConstructionMetrics() {
  const source = normalizeConstruccion(state.construccion);
  const supSobreTierra = getAboveGradeAreaTotal();
  const supBajoTierra = supSobreTierra * toNumber(source.pct_bajo_tierra_sobre_cota_0) / 100;
  const totalSt = supSobreTierra * toNumber(source.costo_uf_m2_sobre_tierra);
  const totalBt = supBajoTierra * toNumber(source.costo_uf_m2_bajo_tierra);
  const totalNeto = totalSt + totalBt;
  const totalBruto = totalNeto * 1.19;
  const supTotal = supSobreTierra + supBajoTierra;

  return {
    ...source,
    sup_sobre_tierra: supSobreTierra,
    sup_bajo_tierra: supBajoTierra,
    total_st: totalSt,
    total_bt: totalBt,
    total_neto: totalNeto,
    total_bruto: totalBruto,
    sup_total: supTotal,
    uf_prom: supTotal ? totalNeto / supTotal : 0,
    uf_bruto: supTotal ? totalBruto / supTotal : 0,
    plazo_meses: getConstructionDuration(),
  };
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

function fmtDateTime(value) {
  if (!value) return 'Sin registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin registro';
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function setSyncStatus(status, message, detail) {
  state.sync.status = status;
  state.sync.message = message;
  state.sync.detail = detail;
  renderSyncStatus();
}

function renderSyncStatus() {
  const badge = $('sync-badge');
  const icon = $('sync-icon');
  const label = $('sync-label');
  const detail = $('sync-detail');
  if (!badge || !icon || !label || !detail) return;

  const variants = {
    loading: { color: '#475569', bg: '#f8fafc', border: '#cbd5e1', icon: '☁' },
    ok: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: '☁ ✓' },
    saving: { color: '#b45309', bg: '#fffbeb', border: '#fde68a', icon: '↻' },
    error: { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', icon: '⚠' },
  };

  const variant = variants[state.sync.status] || variants.loading;
  badge.style.color = variant.color;
  badge.style.background = variant.bg;
  badge.style.borderColor = variant.border;
  icon.textContent = variant.icon;
  label.textContent = state.sync.message;
  detail.textContent = state.sync.detail;
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

async function refreshHealthStatus() {
  try {
    state.health = await api('/api/health');
    setSyncStatus('ok', 'SINCRONIZADO', `Base ${state.health.database} · ${state.health.environment}`);
  } catch (error) {
    setSyncStatus('error', 'SIN CONEXION', error.message);
  }
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

function ensureActionButtons() {
  $('tour-interactivo-btn')?.addEventListener('click', () => {
    window.alert('Tour interactivo: 1) define cabida, 2) arma gantt, 3) configura ventas, 4) guarda y valida sincronizacion.');
  });

  $('tour-guiado-btn')?.addEventListener('click', () => {
    window.alert('Tour guiado: parte en Cabida Proyecto, sigue con Carta Gantt y luego Ventas para que los calculos tengan sentido.');
  });

  $('bitacora-btn')?.addEventListener('click', () => {
    const lines = [
      `Proyecto activo: ${state.proyecto?.nombre || 'Sin proyecto'}`,
      `Estado sistema: ${state.sync.message}`,
      `Detalle: ${state.sync.detail}`,
      `Ultima actualizacion proyecto: ${fmtDateTime(state.proyecto?.updated_at)}`,
      `Ultimo guardado local: ${fmtDateTime(state.sync.lastSavedAt)}`,
      `Hitos gantt: ${state.gantt.length}`,
      `Usos comerciales: ${state.ventasConfig.length}`,
    ];
    window.alert(lines.join('\n'));
  });

  $('compartir-btn')?.addEventListener('click', async () => {
    const url = new URL(window.location.href);
    if (state.proyectoId) url.searchParams.set('projectId', state.proyectoId);
    try {
      await navigator.clipboard.writeText(url.toString());
      setSyncStatus('ok', 'LINK COPIADO', `Proyecto ${state.proyecto?.nombre || ''}`.trim());
      setTimeout(() => renderProjectHeader(), 1600);
      setTimeout(() => renderSyncStatus(), 1600);
    } catch (_error) {
      window.prompt('Copia este enlace del proyecto', url.toString());
    }
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
    const utilPorUnidad = getMunicipalUsefulPerUnit(row.sup_interior, row.sup_terrazas);

    acc.unidades += cantidad;
    acc.interior += toNumber(row.sup_interior) * cantidad;
    acc.terrazas += toNumber(row.sup_terrazas) * cantidad;
    acc.comunes += toNumber(row.sup_comunes) * cantidad;
    acc.util += utilPorUnidad * cantidad;
    acc.vendible += vendiblePorUnidad * cantidad;
    acc.losa += losaPorUnidad * cantidad;
    return acc;
  }, {
    unidades: 0,
    interior: 0,
    terrazas: 0,
    comunes: 0,
    util: 0,
    vendible: 0,
    losa: 0,
  });
}

function renderCabidaTables(rows) {
  const displayRows = getCabidaDisplayRows();
  const totals = getCabidaMetrics(displayRows);
  const commonAreaTotal = getCommonAreaTotal();

  const unitRows = displayRows.map((row) => `
    <tr>
      <td>${escapeHtml(row.uso)}</td>
      <td style="text-align:center">${fmtNumber(row.cantidad)}</td>
      <td style="text-align:center">${fmtNumber(row.sup_interior, 1)}</td>
      <td style="text-align:center">${fmtNumber(row.sup_terrazas, 1)}</td>
      <td style="text-align:center">${fmtNumber(getMunicipalUsefulPerUnit(row.sup_interior, row.sup_terrazas), 1)}</td>
      <td style="text-align:center;color:#2563eb">${fmtNumber(toNumber(row.sup_interior) + toNumber(row.sup_terrazas), 1)}</td>
    </tr>
  `).join('');

  const areaRows = displayRows.map((row) => {
    const cantidad = toNumber(row.cantidad);
    const interior = toNumber(row.sup_interior) * cantidad;
    const terrazas = toNumber(row.sup_terrazas) * cantidad;
    const comunes = 0;
    const util = getMunicipalUsefulPerUnit(row.sup_interior, row.sup_terrazas) * cantidad;
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
  }).join('') + `
    <tr>
      <td>COMUNES EDIFICIO</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">${fmtNumber(commonAreaTotal, 1)}</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center;color:#2563eb">-</td>
      <td style="text-align:center;color:#16a34a">${fmtNumber(commonAreaTotal, 1)}</td>
    </tr>
  `;

  setHtml('res-cabida-tbody', unitRows);
  setHtml('cabida-tbody', unitRows);
  setHtml('res-cabida-tfoot', `
    <td>Total</td>
    <td style="text-align:center">${fmtNumber(totals.unidades)}</td>
    <td style="text-align:center">${fmtNumber(totals.unidades ? totals.interior / totals.unidades : 0, 1)}</td>
    <td style="text-align:center">${fmtNumber(totals.unidades ? totals.terrazas / totals.unidades : 0, 1)}</td>
    <td style="text-align:center">${fmtNumber(totals.unidades ? totals.util / totals.unidades : 0, 1)}</td>
    <td style="text-align:center">${fmtNumber(totals.unidades ? totals.vendible / totals.unidades : 0, 1)}</td>
  `);
  setHtml('cabida-tfoot', `
    <td>Total</td>
    <td style="text-align:center">${fmtNumber(totals.unidades)}</td>
    <td style="text-align:center">${fmtNumber(totals.unidades ? totals.interior / totals.unidades : 0, 1)}</td>
    <td style="text-align:center">${fmtNumber(totals.unidades ? totals.terrazas / totals.unidades : 0, 1)}</td>
    <td style="text-align:center">${fmtNumber(totals.unidades ? totals.util / totals.unidades : 0, 1)}</td>
    <td style="text-align:center">${fmtNumber(totals.unidades ? totals.vendible / totals.unidades : 0, 1)}</td>
  `);

  setHtml('res-sup-tbody', displayRows.map((row) => {
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
    <td style="text-align:center">${fmtNumber(commonAreaTotal, 1)}</td>
    <td style="text-align:center">${fmtNumber(totals.util, 1)}</td>
    <td style="text-align:center">${fmtNumber(totals.vendible, 1)}</td>
    <td style="text-align:center">${fmtNumber(totals.losa + commonAreaTotal, 1)}</td>
  `);
}

function renderCabidaEditor(rows) {
  const proyecto = normalizeProject(state.proyecto);
  setHtml('cabida-editor', `
    <div class="card" style="margin-bottom:12px;background:#f8fafc">
      <div class="sec-title" style="font-size:14px">Parametros Generales de Cabida</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
        <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">% terraza util municipal</label><input id="cabida-terraza-util-pct" class="inp" type="number" step="0.01" value="${toNumber(proyecto.terraza_util_pct)}" onchange="onCabidaInputChange()"/></div>
        <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Comunes modo</label><select id="cabida-comunes-tipo" class="inp" onchange="onCabidaInputChange()"><option value="porcentaje" ${proyecto.comunes_tipo === 'porcentaje' ? 'selected' : ''}>% m2 utiles</option><option value="total" ${proyecto.comunes_tipo === 'total' ? 'selected' : ''}>Total m2</option></select></div>
        <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Comunes valor</label><input id="cabida-comunes-valor" class="inp" type="number" step="0.01" value="${toNumber(proyecto.comunes_valor)}" onchange="onCabidaInputChange()"/></div>
        <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Estacionamientos</label><input id="cabida-estacionamientos-cantidad" class="inp" type="number" value="${toNumber(proyecto.estacionamientos_cantidad)}" onchange="onCabidaInputChange()"/></div>
        <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Interior estac./un</label><input id="cabida-estacionamientos-sup-interior" class="inp" type="number" step="0.01" value="${toNumber(proyecto.estacionamientos_sup_interior)}" onchange="onCabidaInputChange()"/></div>
        <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Terraza estac./un</label><input id="cabida-estacionamientos-sup-terrazas" class="inp" type="number" step="0.01" value="${toNumber(proyecto.estacionamientos_sup_terrazas)}" onchange="onCabidaInputChange()"/></div>
        <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Bodegas</label><input id="cabida-bodegas-cantidad" class="inp" type="number" value="${toNumber(proyecto.bodegas_cantidad)}" onchange="onCabidaInputChange()"/></div>
        <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Interior bodega/un</label><input id="cabida-bodegas-sup-interior" class="inp" type="number" step="0.01" value="${toNumber(proyecto.bodegas_sup_interior)}" onchange="onCabidaInputChange()"/></div>
        <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Terraza bodega/un</label><input id="cabida-bodegas-sup-terrazas" class="inp" type="number" step="0.01" value="${toNumber(proyecto.bodegas_sup_terrazas)}" onchange="onCabidaInputChange()"/></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px">
      ${rows.map((row) => `
        <div class="card" data-cabida-row>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="grid-column:1 / -1">
              <label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Uso</label>
              <input class="inp" data-field="uso" value="${escapeHtml(row.uso)}" onchange="onCabidaInputChange()"/>
            </div>
            <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Cantidad</label><input class="inp" type="number" data-field="cantidad" value="${toNumber(row.cantidad)}" onchange="onCabidaInputChange()"/></div>
            <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Sup. interior</label><input class="inp" type="number" step="0.01" data-field="sup_interior" value="${toNumber(row.sup_interior)}" onchange="onCabidaInputChange()"/></div>
            <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Terrazas</label><input class="inp" type="number" step="0.01" data-field="sup_terrazas" value="${toNumber(row.sup_terrazas)}" onchange="onCabidaInputChange()"/></div>
            <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Util mun.</label><input class="inp" type="number" step="0.01" value="${fmtNumber(getMunicipalUsefulPerUnit(row.sup_interior, row.sup_terrazas), 2)}" disabled/></div>
            <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Comunes edificio</label><input class="inp" type="text" value="${proyecto.comunes_tipo === 'total' ? `${fmtNumber(getCommonAreaTotal(), 1)} m2 total` : `${fmtNumber(toNumber(proyecto.comunes_valor), 1)}% de utiles`}" disabled/></div>
          </div>
        </div>
      `).join('')}
    </div>
  `);
}

function getGanttDependencyOptions(currentName) {
  return ['<option value="">Sin dependencia</option>']
    .concat(
      state.gantt
        .filter((item) => item.nombre !== currentName)
        .map((item) => `<option value="${escapeHtml(item.nombre)}">${escapeHtml(item.nombre)}</option>`)
    )
    .join('');
}

function normalizeGanttRows(rows) {
  const byName = new Map(rows.map((row) => [row.nombre, row]));
  return rows.map((row) => {
    const dependencia = row.dependencia || '';
    const dependenciaTipo = row.dependencia_tipo || 'fin';
    const dependenciaRow = dependencia ? byName.get(dependencia) : null;
    const inicioBase = dependenciaRow
      ? toNumber(dependenciaTipo === 'inicio' ? dependenciaRow.inicio : dependenciaRow.fin)
      : toNumber(row.inicio);
    const inicio = dependenciaRow ? inicioBase + toNumber(row.desfase) : toNumber(row.inicio);
    const duracion = Math.max(0, toNumber(row.duracion));
    const fin = inicio + duracion;
    return {
      ...row,
      dependencia,
      dependencia_tipo: dependenciaTipo,
      desfase: toNumber(row.desfase),
      inicio,
      duracion,
      fin,
    };
  });
}

function readGanttEditor() {
  const rows = Array.from(document.querySelectorAll('[data-gantt-row]')).map((row) => ({
    id: row.dataset.id || '',
    nombre: row.querySelector('[data-field="nombre"]')?.value?.trim() || 'Nuevo hito',
    color: row.querySelector('[data-field="color"]')?.value || '#3b82f6',
    dependencia: row.querySelector('[data-field="dependencia"]')?.value || null,
    dependencia_tipo: row.querySelector('[data-field="dependencia_tipo"]')?.value || 'fin',
    desfase: toNumber(row.querySelector('[data-field="desfase"]')?.value),
    inicio: toNumber(row.querySelector('[data-field="inicio"]')?.value),
    duracion: toNumber(row.querySelector('[data-field="duracion"]')?.value),
    fin: toNumber(row.querySelector('[data-field="fin"]')?.value),
  }));
  return normalizeGanttRows(rows);
}

function renderGanttEditor(rows = state.gantt) {
  const normalized = normalizeGanttRows(rows);
  state.gantt = normalized;
  const maxFin = Math.max(1, ...normalized.map((row) => toNumber(row.fin)));

  setHtml('gantt-tbody', normalized.map((row, index) => {
    const left = (toNumber(row.inicio) / maxFin) * 100;
    const width = (Math.max(1, toNumber(row.duracion)) / maxFin) * 100;
    return `
      <tr data-gantt-row data-id="${escapeHtml(row.id || '')}">
        <td>
          <div style="display:flex;flex-direction:column;gap:4px">
            <button class="btn-outline" type="button" style="padding:2px 6px;font-size:10px" onclick="moveGanttRow(${index}, -1)">↑</button>
            <button class="btn-outline" type="button" style="padding:2px 6px;font-size:10px" onclick="moveGanttRow(${index}, 1)">↓</button>
            <button class="btn-outline" type="button" style="padding:2px 6px;font-size:10px;color:#b91c1c" onclick="removeGanttRow(${index})">×</button>
          </div>
        </td>
        <td>
          <div style="display:grid;grid-template-columns:18px 1fr;gap:8px;align-items:center">
            <input data-field="color" type="color" value="${escapeHtml(row.color || '#3b82f6')}" onchange="onGanttInputChange()"/>
            <input class="inp" data-field="nombre" value="${escapeHtml(row.nombre)}" onchange="onGanttInputChange()"/>
          </div>
        </td>
        <td>
          <div style="display:grid;grid-template-columns:1fr 70px;gap:6px">
            <select class="inp" data-field="dependencia" onchange="onGanttInputChange()">
              ${getGanttDependencyOptions(row.nombre).replace(`value="${escapeHtml(row.dependencia || '')}"`, `value="${escapeHtml(row.dependencia || '')}" selected`)}
            </select>
            <select class="inp" data-field="dependencia_tipo" onchange="onGanttInputChange()">
              <option value="inicio" ${row.dependencia_tipo === 'inicio' ? 'selected' : ''}>Inicio</option>
              <option value="fin" ${row.dependencia_tipo === 'fin' ? 'selected' : ''}>Fin</option>
            </select>
          </div>
        </td>
        <td><input class="inp" data-field="desfase" type="number" value="${toNumber(row.desfase)}" onchange="onGanttInputChange()"/></td>
        <td><input class="inp" data-field="inicio" type="number" value="${toNumber(row.inicio)}" ${row.dependencia ? 'disabled' : ''} onchange="onGanttInputChange()"/></td>
        <td><input class="inp" data-field="duracion" type="number" value="${toNumber(row.duracion)}" onchange="onGanttInputChange()"/></td>
        <td style="color:#16a34a;font-weight:800;text-align:center"><input class="inp" data-field="fin" type="number" value="${toNumber(row.fin)}" disabled/></td>
        <td>
          <div style="position:relative;height:22px;background:#f8fafc;border-radius:6px;overflow:hidden">
            <div style="position:absolute;left:${left}%;width:${width}%;top:0;height:100%;background:${escapeHtml(row.color || '#3b82f6')};border-radius:6px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700">
              ${fmtNumber(row.inicio)}-${fmtNumber(row.fin)}
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join(''));

  const totalFin = Math.max(0, ...normalized.map((row) => toNumber(row.fin)));
  setText('gantt-total-fin', `Mes ${fmtNumber(totalFin)}`);
  setText('gantt-total-bar', `${fmtNumber(totalFin)} meses`);
  renderGanttPreview();
}

function renderGanttPreview() {
  const normalized = normalizeGanttRows(state.gantt);
  const maxFin = Math.max(1, ...normalized.map((hito) => toNumber(hito.fin)));
  setHtml('gantt-preview', normalized.map((hito) => {
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

function isAccessoryUso(uso) {
  return /ESTAC|BODEG/i.test(String(uso || ''));
}

function getCommercialRows() {
  return state.cabida.filter((row) => toNumber(row.cantidad) > 0 && !isAccessoryUso(row.uso));
}

function getVentasConfigMap() {
  return new Map(state.ventasConfig.map((row) => [row.uso, row]));
}

function getCronogramaByType(type) {
  return state.ventasCronograma.filter((row) => row.tipo === type);
}

function getCronogramaForUso(type, uso) {
  return state.ventasCronograma.find((row) => row.tipo === type && row.uso === uso) || null;
}

function ensureVentasState() {
  const rows = getCommercialRows();
  const configMap = getVentasConfigMap();

  state.ventasConfig = rows.map((row) => {
    const existing = configMap.get(row.uso) || {};
    return {
      id: existing.id,
      uso: row.uso,
      precio_uf_m2: toNumber(existing.precio_uf_m2),
      precio_estacionamiento: toNumber(existing.precio_estacionamiento),
      precio_bodega: toNumber(existing.precio_bodega),
      reserva_uf: toNumber(existing.reserva_uf),
      pie_promesa_pct: toNumber(existing.pie_promesa_pct),
      pie_cuotas_pct: toNumber(existing.pie_cuotas_pct),
      hipotecario_pct: toNumber(existing.hipotecario_pct),
      pie_cuoton_pct: toNumber(existing.pie_cuoton_pct),
    };
  });

  const ganttNames = state.gantt.map((row) => row.nombre);
  const defaults = [
    { type: 'PREVENTA', label: 'Preventas', percentage: 20 },
    { type: 'VENTA', label: 'Ventas', percentage: 80 },
  ];

  const nextCronograma = [];
  for (const row of rows) {
    for (const item of defaults) {
      const existing = getCronogramaForUso(item.type, row.uso) || {};
      nextCronograma.push({
        id: existing.id,
        tipo: item.type,
        uso: row.uso,
        vinculo_gantt: existing.vinculo_gantt || ganttNames[0] || null,
        mes_inicio: toNumber(existing.mes_inicio),
        duracion: toNumber(existing.duracion),
        porcentaje: toNumber(existing.porcentaje || item.percentage),
      });
    }
  }

  const escrituracion = state.ventasCronograma.find((row) => row.tipo === 'ESCRITURACION') || {};
  nextCronograma.push({
    id: escrituracion.id,
    tipo: 'ESCRITURACION',
    uso: 'GLOBAL',
    vinculo_gantt: escrituracion.vinculo_gantt || ganttNames[0] || null,
    mes_inicio: toNumber(escrituracion.mes_inicio),
    duracion: toNumber(escrituracion.duracion),
    porcentaje: 0,
  });

  state.ventasCronograma = nextCronograma;
}

function getUsoSaleMetrics(uso) {
  const cabidaRow = state.cabida.find((row) => row.uso === uso) || {};
  const config = state.ventasConfig.find((row) => row.uso === uso) || {};
  const unidades = toNumber(cabidaRow.cantidad);
  const supVendible = (toNumber(cabidaRow.sup_interior) + toNumber(cabidaRow.sup_terrazas)) * unidades;
  const m2PorUnidad = unidades ? supVendible / unidades : 0;
  const precioBase = m2PorUnidad * toNumber(config.precio_uf_m2);
  const subtotalPrincipal = precioBase * unidades;
  const total = subtotalPrincipal;
  const ticket = unidades ? subtotalPrincipal / unidades : 0;

  return {
    cabidaRow,
    config,
    unidades,
    supVendible,
    m2PorUnidad,
    precioBase,
    subtotalPrincipal,
    total,
    ticket,
    estacionamientos: toNumber(cabidaRow.estacionamientos),
    bodegas: toNumber(cabidaRow.bodegas),
  };
}

function getAddonSalesMetrics() {
  const proyecto = normalizeProject(state.proyecto);
  const accessorySales = getAccessorySalesConfig();

  return {
    estacionamientos: {
      unidades: toNumber(proyecto.estacionamientos_cantidad),
      precio: accessorySales.precio_estacionamiento,
      total: toNumber(proyecto.estacionamientos_cantidad) * accessorySales.precio_estacionamiento,
    },
    bodegas: {
      unidades: toNumber(proyecto.bodegas_cantidad),
      precio: accessorySales.precio_bodega,
      total: toNumber(proyecto.bodegas_cantidad) * accessorySales.precio_bodega,
    },
  };
}

function findGanttByName(name) {
  return state.gantt.find((row) => row.nombre === name) || null;
}

function getCronogramaComputed(item) {
  const ganttRef = findGanttByName(item.vinculo_gantt);
  const inicio = ganttRef ? toNumber(ganttRef.fin) + toNumber(item.mes_inicio) : toNumber(item.mes_inicio);
  const duracion = Math.max(1, toNumber(item.duracion));
  const fin = inicio + duracion;
  return { inicio, duracion, fin };
}

function renderVentasModule() {
  ensureVentasState();
  renderVentasPricing();
  renderVentasPaymentForms();
  renderVentasSchedules();
  renderVentasSummaryCards();
  renderVentasCashflow();
}

function renderVentasPricing() {
  const accessorySales = getAccessorySalesConfig();
  const rows = state.ventasConfig.map((config) => {
    const metrics = getUsoSaleMetrics(config.uso);
    return `
      <tr data-ventas-config-row data-uso="${escapeHtml(config.uso)}">
        <td>${escapeHtml(config.uso)}</td>
        <td style="text-align:center">${fmtNumber(metrics.unidades)}</td>
        <td style="text-align:center">${fmtNumber(metrics.supVendible, 1)}</td>
        <td style="text-align:center">${fmtNumber(metrics.m2PorUnidad, 1)}</td>
        <td><input class="inp" type="number" step="0.01" data-field="precio_uf_m2" value="${toNumber(config.precio_uf_m2)}" onchange="onVentasInputChange()"/></td>
        <td style="text-align:center">${fmtUf(metrics.precioBase)}</td>
        <td style="text-align:center;color:#16a34a">${fmtUf(metrics.subtotalPrincipal)}</td>
        <td style="text-align:center">-</td>
        <td style="text-align:center">-</td>
        <td style="text-align:center">-</td>
        <td style="text-align:center">-</td>
        <td style="text-align:center;color:#ea580c;font-weight:800">${fmtUf(metrics.total)}</td>
        <td style="text-align:center">${fmtUf(metrics.ticket)}</td>
      </tr>
    `;
  }).join('');

  const addons = getAddonSalesMetrics();
  const totalVentaDeptos = state.ventasConfig.reduce((sum, row) => sum + getUsoSaleMetrics(row.uso).total, 0);
  const totalVenta = totalVentaDeptos + addons.estacionamientos.total + addons.bodegas.total;
  const totalUnidades = state.ventasConfig.reduce((sum, row) => sum + getUsoSaleMetrics(row.uso).unidades, 0);
  const totalSup = state.ventasConfig.reduce((sum, row) => sum + getUsoSaleMetrics(row.uso).supVendible, 0);

  setHtml('ventas-tbody', `
    ${rows}
    <tr style="background:#f8fafc">
      <td style="font-weight:800">ESTACIONAMIENTOS</td>
      <td style="text-align:center">${fmtNumber(addons.estacionamientos.unidades)}</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center;color:#16a34a">${fmtUf(addons.estacionamientos.total)}</td>
      <td style="text-align:center">${fmtNumber(addons.estacionamientos.unidades)}</td>
      <td><input id="ventas-precio-estacionamiento-global" class="inp" type="number" step="0.01" value="${toNumber(accessorySales.precio_estacionamiento)}" onchange="onVentasInputChange()"/></td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center;color:#ea580c;font-weight:800">${fmtUf(addons.estacionamientos.total)}</td>
      <td style="text-align:center">${fmtUf(addons.estacionamientos.precio)}</td>
    </tr>
    <tr style="background:#f8fafc">
      <td style="font-weight:800">BODEGAS</td>
      <td style="text-align:center">${fmtNumber(addons.bodegas.unidades)}</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center;color:#16a34a">${fmtUf(addons.bodegas.total)}</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">${fmtNumber(addons.bodegas.unidades)}</td>
      <td><input id="ventas-precio-bodega-global" class="inp" type="number" step="0.01" value="${toNumber(accessorySales.precio_bodega)}" onchange="onVentasInputChange()"/></td>
      <td style="text-align:center;color:#ea580c;font-weight:800">${fmtUf(addons.bodegas.total)}</td>
      <td style="text-align:center">${fmtUf(addons.bodegas.precio)}</td>
    </tr>
  `);
  setHtml('ventas-tfoot', `
    <td>Total</td>
    <td>${fmtNumber(totalUnidades)}</td>
    <td>${fmtNumber(totalSup, 1)}</td>
    <td>${fmtNumber(totalUnidades ? totalSup / totalUnidades : 0, 1)}</td>
    <td colspan="7"></td>
    <td style="font-weight:800;color:#22c55e">${fmtUf(totalVenta)}</td>
    <td>${fmtUf(totalUnidades ? totalVentaDeptos / totalUnidades : 0)}</td>
  `);
}

function renderVentasPaymentForms() {
  setHtml('formas-pago-tbody', state.ventasConfig.map((row) => {
    const metrics = getUsoSaleMetrics(row.uso);
    const totalUnidad = metrics.ticket;
    const montoPromesa = Math.max(0, (totalUnidad * toNumber(row.pie_promesa_pct) / 100) - toNumber(row.reserva_uf));
    const montoCuotas = totalUnidad * toNumber(row.pie_cuotas_pct) / 100;
    const montoCuoton = totalUnidad * toNumber(row.pie_cuoton_pct) / 100;

    return `
      <tr data-ventas-config-row data-uso="${escapeHtml(row.uso)}">
        <td>${escapeHtml(row.uso)}</td>
        <td><input class="inp" type="number" step="0.01" data-field="reserva_uf" value="${toNumber(row.reserva_uf)}" onchange="onVentasInputChange()"/></td>
        <td><input class="inp" type="number" step="0.01" data-field="pie_promesa_pct" value="${toNumber(row.pie_promesa_pct)}" onchange="onVentasInputChange()"/></td>
        <td style="text-align:center">${fmtUf(montoPromesa)}</td>
        <td><input class="inp" type="number" step="0.01" data-field="pie_cuotas_pct" value="${toNumber(row.pie_cuotas_pct)}" onchange="onVentasInputChange()"/></td>
        <td style="text-align:center">${fmtUf(montoCuotas)}</td>
        <td><input class="inp" type="number" step="0.01" data-field="pie_cuoton_pct" value="${toNumber(row.pie_cuoton_pct)}" onchange="onVentasInputChange()"/></td>
        <td style="text-align:center">${fmtUf(montoCuoton)}</td>
        <td><input class="inp" type="number" step="0.01" data-field="hipotecario_pct" value="${toNumber(row.hipotecario_pct)}" onchange="onVentasInputChange()"/></td>
        <td style="text-align:center;color:#16a34a">${fmtUf(totalUnidad)}</td>
      </tr>
    `;
  }).join(''));
}

function ganttOptionsHtml(selected) {
  return ['<option value="">Sin vinculo</option>']
    .concat(state.gantt.map((item) => `<option value="${escapeHtml(item.nombre)}">${escapeHtml(item.nombre)}</option>`))
    .join('')
    .replace(`value="${escapeHtml(selected || '')}"`, `value="${escapeHtml(selected || '')}" selected`);
}

function renderVentasSchedules() {
  const renderScheduleRows = (type, targetId) => {
    const rows = state.ventasCronograma.filter((row) => row.tipo === type);
    setHtml(targetId, rows.map((row) => {
      const metrics = getUsoSaleMetrics(row.uso);
      const computed = getCronogramaComputed(row);
      const porcentaje = type === 'ESCRITURACION' ? 0 : toNumber(row.porcentaje);
      const unidades = type === 'ESCRITURACION'
        ? state.ventasConfig.reduce((sum, item) => sum + getUsoSaleMetrics(item.uso).unidades, 0)
        : Math.round(metrics.unidades * porcentaje / 100);
      const velUn = computed.duracion ? unidades / computed.duracion : 0;
      const velUf = computed.duracion ? (metrics.total * (porcentaje / 100)) / computed.duracion : 0;

      if (type === 'ESCRITURACION') {
        return `
          <tr data-ventas-cronograma-row data-tipo="${escapeHtml(row.tipo)}" data-uso="${escapeHtml(row.uso)}">
            <td>
              <select class="inp" data-field="vinculo_gantt" onchange="onVentasInputChange()">${ganttOptionsHtml(row.vinculo_gantt)}</select>
            </td>
            <td style="text-align:center">${fmtNumber(computed.inicio)}</td>
            <td><input class="inp" type="number" data-field="duracion" value="${toNumber(row.duracion)}" onchange="onVentasInputChange()"/></td>
            <td style="text-align:center;color:#16a34a">${fmtNumber(computed.fin)}</td>
            <td style="text-align:center">${fmtNumber(velUn, 1)} un/mes</td>
          </tr>
        `;
      }

      return `
        <tr data-ventas-cronograma-row data-tipo="${escapeHtml(row.tipo)}" data-uso="${escapeHtml(row.uso)}">
          <td>${escapeHtml(row.uso)}</td>
          <td><select class="inp" data-field="vinculo_gantt" onchange="onVentasInputChange()">${ganttOptionsHtml(row.vinculo_gantt)}</select></td>
          <td><input class="inp" type="number" data-field="mes_inicio" value="${toNumber(row.mes_inicio)}" onchange="onVentasInputChange()"/></td>
          <td><input class="inp" type="number" data-field="duracion" value="${toNumber(row.duracion)}" onchange="onVentasInputChange()"/></td>
          <td style="text-align:center;color:#16a34a">${fmtNumber(computed.fin)}</td>
          <td><input class="inp" type="number" step="0.01" data-field="porcentaje" value="${toNumber(row.porcentaje)}" onchange="onVentasInputChange()"/></td>
          <td style="text-align:center">${fmtNumber(unidades)}</td>
          <td style="text-align:center">${fmtNumber(velUn, 1)}</td>
          <td style="text-align:center;color:#16a34a">${fmtUf(velUf)}</td>
        </tr>
      `;
    }).join(''));
  };

  renderScheduleRows('PREVENTA', 'preventa-tbody');
  renderScheduleRows('VENTA', 'venta-tbody');
  renderScheduleRows('ESCRITURACION', 'escrituracion-tbody');
}

function drawSpeedometer(value, maxValue) {
  const canvas = $('speedometer');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height * 0.92;
  const radius = Math.min(width * 0.4, height * 0.72);
  const start = Math.PI;
  const end = 0;
  const ratio = Math.max(0, Math.min(1, maxValue ? value / maxValue : 0));
  const current = start + (end - start) * ratio;

  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.strokeStyle = '#e2e8f0';
  ctx.arc(centerX, centerY, radius, start, end);
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = '#16a34a';
  ctx.arc(centerX, centerY, radius, start, current);
  ctx.stroke();
}

function renderVentasSummaryCards() {
  const totalVenta = state.ventasConfig.reduce((sum, row) => sum + getUsoSaleMetrics(row.uso).total, 0);
  const preRows = getCronogramaByType('PREVENTA');
  const ventaRows = getCronogramaByType('VENTA');
  const escrRow = getCronogramaByType('ESCRITURACION')[0];

  const preventaPct = preRows.reduce((sum, row) => sum + toNumber(row.porcentaje), 0);
  const ventaPct = ventaRows.reduce((sum, row) => sum + toNumber(row.porcentaje), 0);
  const escrituraInicio = escrRow ? getCronogramaComputed(escrRow).inicio : 0;
  const escrituraFin = escrRow ? getCronogramaComputed(escrRow).fin : 0;
  const escrituraDuracion = escrRow ? getCronogramaComputed(escrRow).duracion : 0;
  const totalUnidades = state.ventasConfig.reduce((sum, row) => sum + getUsoSaleMetrics(row.uso).unidades, 0);
  const velEntregas = escrituraDuracion ? totalUnidades / escrituraDuracion : 0;

  const analysisStart = Math.min(
    ...preRows.concat(ventaRows).map((row) => getCronogramaComputed(row).inicio),
    escrituraInicio || 999999
  );
  const analysisEnd = Math.max(
    ...preRows.concat(ventaRows).map((row) => getCronogramaComputed(row).fin),
    escrituraFin || 0
  );
  const duration = analysisEnd > analysisStart ? analysisEnd - analysisStart : 1;
  const velUf = totalVenta / duration;
  const velUn = totalUnidades / duration;

  drawSpeedometer(velUf, Math.max(velUf * 1.3, 1));
  setText('vel-global-uf', fmtNumber(velUf));
  setText('vel-global-un', `${fmtNumber(velUn, 1)} un/m`);
  setText('vel-duracion', `${fmtNumber(duration)} meses`);
  setText('vel-analisis', `Analisis desde Mes ${fmtNumber(analysisStart)} al ${fmtNumber(analysisEnd)}`);
  setText('vel-entregas', fmtNumber(velEntregas, 1));
  setText('escrit-inicio', `Mes ${fmtNumber(escrituraInicio)}`);
  setText('escrit-fin', `Mes ${fmtNumber(escrituraFin)}`);
  setText('escrit-dur', `Duracion: ${fmtNumber(escrituraDuracion)} meses`);

  setHtml('mix-ventas-list', `
    <div class="etapa-card" style="border-color:#3b82f6"><div style="font-weight:800">Preventa</div><div style="font-size:12px;color:#64748b">${fmtPct(preventaPct)} del stock · ${fmtUf(totalVenta * preventaPct / 100)}</div></div>
    <div class="etapa-card" style="border-color:#22c55e"><div style="font-weight:800">Venta</div><div style="font-size:12px;color:#64748b">${fmtPct(ventaPct)} del stock · ${fmtUf(totalVenta * ventaPct / 100)}</div></div>
    <div class="etapa-card" style="border-color:#f97316"><div style="font-weight:800">Escrituracion</div><div style="font-size:12px;color:#64748b">Desde Mes ${fmtNumber(escrituraInicio)} hasta ${fmtNumber(escrituraFin)}</div></div>
  `);
}

function buildTimelineMonths() {
  const months = new Set([1]);
  state.ventasCronograma.forEach((row) => {
    const computed = getCronogramaComputed(row);
    months.add(Math.max(1, computed.inicio));
    months.add(Math.max(1, computed.fin));
  });
  return Array.from(months).sort((a, b) => a - b).slice(0, 8);
}

function renderVentasSummaryCards() {
  const addons = getAddonSalesMetrics();
  const totalVentaDeptos = state.ventasConfig.reduce((sum, row) => sum + getUsoSaleMetrics(row.uso).total, 0);
  const totalVentaAccesorios = addons.estacionamientos.total + addons.bodegas.total;
  const totalVenta = totalVentaDeptos + totalVentaAccesorios;
  const preRows = getCronogramaByType('PREVENTA');
  const ventaRows = getCronogramaByType('VENTA');
  const escrRow = getCronogramaByType('ESCRITURACION')[0];

  const preventaPct = preRows.reduce((sum, row) => sum + toNumber(row.porcentaje), 0);
  const ventaPct = ventaRows.reduce((sum, row) => sum + toNumber(row.porcentaje), 0);
  const escrituraInicio = escrRow ? getCronogramaComputed(escrRow).inicio : 0;
  const escrituraFin = escrRow ? getCronogramaComputed(escrRow).fin : 0;
  const escrituraDuracion = escrRow ? getCronogramaComputed(escrRow).duracion : 0;
  const totalUnidades = state.ventasConfig.reduce((sum, row) => sum + getUsoSaleMetrics(row.uso).unidades, 0);
  const velEntregas = escrituraDuracion ? totalUnidades / escrituraDuracion : 0;

  const analysisPoints = preRows.concat(ventaRows).map((row) => getCronogramaComputed(row));
  const analysisStart = Math.min(
    ...analysisPoints.map((row) => row.inicio),
    escrituraInicio || 999999
  );
  const analysisEnd = Math.max(
    ...analysisPoints.map((row) => row.fin),
    escrituraFin || 0
  );
  const duration = analysisEnd > analysisStart ? analysisEnd - analysisStart : 1;
  const velUf = totalVenta / duration;
  const velUn = totalUnidades / duration;

  drawSpeedometer(velUf, Math.max(velUf * 1.3, 1));
  setText('vel-global-uf', fmtNumber(velUf));
  setText('vel-global-un', `${fmtNumber(velUn, 1)} un/m`);
  setText('vel-duracion', `${fmtNumber(duration)} meses`);
  setText('vel-analisis', `Analisis desde Mes ${fmtNumber(analysisStart)} al ${fmtNumber(analysisEnd)}`);
  setText('vel-entregas', fmtNumber(velEntregas, 1));
  setText('escrit-inicio', `Mes ${fmtNumber(escrituraInicio)}`);
  setText('escrit-fin', `Mes ${fmtNumber(escrituraFin)}`);
  setText('escrit-dur', `Duracion: ${fmtNumber(escrituraDuracion)} meses`);

  setHtml('mix-ventas-list', `
    <div class="etapa-card" style="border-color:#3b82f6"><div style="font-weight:800">Preventa departamentos</div><div style="font-size:12px;color:#64748b">${fmtPct(preventaPct)} del stock deptos · ${fmtUf(totalVentaDeptos * preventaPct / 100)}</div></div>
    <div class="etapa-card" style="border-color:#22c55e"><div style="font-weight:800">Venta departamentos</div><div style="font-size:12px;color:#64748b">${fmtPct(ventaPct)} del stock deptos · ${fmtUf(totalVentaDeptos * ventaPct / 100)}</div></div>
    <div class="etapa-card" style="border-color:#8b5cf6"><div style="font-weight:800">Estac. y bodegas</div><div style="font-size:12px;color:#64748b">${fmtNumber(addons.estacionamientos.unidades)} estac. + ${fmtNumber(addons.bodegas.unidades)} bod. · ${fmtUf(totalVentaAccesorios)}</div></div>
    <div class="etapa-card" style="border-color:#f97316"><div style="font-weight:800">Escrituracion</div><div style="font-size:12px;color:#64748b">Desde Mes ${fmtNumber(escrituraInicio)} hasta ${fmtNumber(escrituraFin)}</div></div>
  `);
}

function renderVentasCashflow() {
  const months = buildTimelineMonths();
  setHtml('flujo-ventas-header', `<th>Concepto</th>${months.map((month) => `<th>M${fmtNumber(month)}</th>`).join('')}`);

  const reservations = [];
  const cuotas = [];
  const escrituras = [];

  months.forEach((month) => {
    let totalReserva = 0;
    let totalCuotas = 0;
    let totalEscritura = 0;

    state.ventasConfig.forEach((config) => {
      const metrics = getUsoSaleMetrics(config.uso);
      const preventa = getCronogramaForUso('PREVENTA', config.uso);
      const venta = getCronogramaForUso('VENTA', config.uso);
      const escritura = getCronogramaByType('ESCRITURACION')[0];

      if (preventa) {
        const computed = getCronogramaComputed(preventa);
        if (month >= computed.inicio && month < computed.fin) {
          totalReserva += toNumber(config.reserva_uf) * (metrics.unidades * toNumber(preventa.porcentaje) / 100) / computed.duracion;
          totalCuotas += (metrics.ticket * toNumber(config.pie_cuotas_pct) / 100) * (metrics.unidades * toNumber(preventa.porcentaje) / 100) / computed.duracion;
        }
      }

      if (venta) {
        const computed = getCronogramaComputed(venta);
        if (month >= computed.inicio && month < computed.fin) {
          totalCuotas += (metrics.ticket * toNumber(config.pie_promesa_pct) / 100) * (metrics.unidades * toNumber(venta.porcentaje) / 100) / computed.duracion;
        }
      }

      if (escritura) {
        const computed = getCronogramaComputed(escritura);
        if (month >= computed.inicio && month < computed.fin) {
          totalEscritura += (metrics.ticket * toNumber(config.hipotecario_pct) / 100) * metrics.unidades / computed.duracion;
        }
      }
    });

    reservations.push(totalReserva);
    cuotas.push(totalCuotas);
    escrituras.push(totalEscritura);
  });

  const rows = [
    { label: 'Reservas y promesas', values: reservations },
    { label: 'Cuotas pie', values: cuotas },
    { label: 'Escrituraciones', values: escrituras },
  ];

  setHtml('flujo-ventas-tbody', rows.map((row) => `
    <tr>
      <td>${row.label}</td>
      ${row.values.map((value) => `<td>${fmtNumber(value)}</td>`).join('')}
    </tr>
  `).join(''));

  const totals = months.map((_, index) => rows.reduce((sum, row) => sum + row.values[index], 0));
  setHtml('flujo-ventas-tfoot', `<td>Total</td>${totals.map((value) => `<td>${fmtNumber(value)}</td>`).join('')}`);
}

function renderVentasCashflow() {
  const months = buildTimelineMonths();
  setHtml('flujo-ventas-header', `<th>Concepto</th>${months.map((month) => `<th>M${fmtNumber(month)}</th>`).join('')}`);

  const addons = getAddonSalesMetrics();
  const reservations = [];
  const cuotas = [];
  const accesorios = [];
  const escrituras = [];
  const totalVentaAccesorios = addons.estacionamientos.total + addons.bodegas.total;

  months.forEach((month) => {
    let totalReserva = 0;
    let totalCuotas = 0;
    let totalEscritura = 0;

    state.ventasConfig.forEach((config) => {
      const metrics = getUsoSaleMetrics(config.uso);
      const preventa = getCronogramaForUso('PREVENTA', config.uso);
      const venta = getCronogramaForUso('VENTA', config.uso);
      const escritura = getCronogramaByType('ESCRITURACION')[0];

      if (preventa) {
        const computed = getCronogramaComputed(preventa);
        if (month >= computed.inicio && month < computed.fin) {
          totalReserva += toNumber(config.reserva_uf) * (metrics.unidades * toNumber(preventa.porcentaje) / 100) / computed.duracion;
          totalCuotas += (metrics.ticket * toNumber(config.pie_cuotas_pct) / 100) * (metrics.unidades * toNumber(preventa.porcentaje) / 100) / computed.duracion;
        }
      }

      if (venta) {
        const computed = getCronogramaComputed(venta);
        if (month >= computed.inicio && month < computed.fin) {
          totalCuotas += (metrics.ticket * toNumber(config.pie_promesa_pct) / 100) * (metrics.unidades * toNumber(venta.porcentaje) / 100) / computed.duracion;
        }
      }

      if (escritura) {
        const computed = getCronogramaComputed(escritura);
        if (month >= computed.inicio && month < computed.fin) {
          totalEscritura += (metrics.ticket * toNumber(config.hipotecario_pct) / 100) * metrics.unidades / computed.duracion;
        }
      }
    });

    reservations.push(totalReserva);
    cuotas.push(totalCuotas);
    accesorios.push(months.length ? totalVentaAccesorios / months.length : 0);
    escrituras.push(totalEscritura);
  });

  const rows = [
    { label: 'Reservas y promesas', values: reservations },
    { label: 'Cuotas pie', values: cuotas },
    { label: 'Ventas estac. y bodegas', values: accesorios },
    { label: 'Escrituraciones', values: escrituras },
  ];

  setHtml('flujo-ventas-tbody', rows.map((row) => `
    <tr>
      <td>${row.label}</td>
      ${row.values.map((value) => `<td>${fmtNumber(value)}</td>`).join('')}
    </tr>
  `).join(''));

  const totals = months.map((_, index) => rows.reduce((sum, row) => sum + row.values[index], 0));
  setHtml('flujo-ventas-tfoot', `<td>Total</td>${totals.map((value) => `<td>${fmtNumber(value)}</td>`).join('')}`);
}

function renderCostStructure() {
  const total = state.costos
    .flatMap((categoria) => categoria.partidas || [])
    .reduce((sum, partida) => sum + toNumber(partida.total_neto), 0);
  const totalBruto = state.costos
    .flatMap((categoria) => categoria.partidas || [])
    .reduce((sum, partida) => sum + (toNumber(partida.total_neto) * (partida.tiene_iva ? 1.19 : 1)), 0);

  const colors = ['#0f172a', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444'];
  const rowsHtml = state.costos.map((categoria, index) => {
    const subtotal = (categoria.partidas || []).reduce((sum, partida) => sum + toNumber(partida.total_neto), 0);
    const pct = total ? (subtotal / total) * 100 : 0;
    return `
      <div class="dist-row">
        <div class="dist-label">${escapeHtml(categoria.nombre)}</div>
        <div class="dist-bar-wrap"><div class="dist-bar" style="width:${pct}%;background:${colors[index % colors.length]}"></div></div>
        <div class="dist-pct">${fmtPct(pct)}</div>
      </div>
    `;
  }).join('');

  setHtml('estructura-costos-list', rowsHtml);
  setHtml('dist-costos-list', rowsHtml);
  setText('costos-total-neto', fmtUf(total));
  setText('costos-total-bruto', fmtUf(totalBruto));
}

function renderConstruccion() {
  const metrics = getConstructionMetrics();

  setText('constr-sup-st', `${fmtNumber(metrics.sup_sobre_tierra, 1)} m2`);
  setText('constr-sup-bt', `${fmtNumber(metrics.sup_bajo_tierra, 1)} m2`);
  setText('constr-total-st', fmtUf(metrics.total_st));
  setText('constr-total-bt', fmtUf(metrics.total_bt));
  setText('constr-sup-total', `${fmtNumber(metrics.sup_total, 1)} m2`);
  setText('constr-uf-prom', `${fmtNumber(metrics.uf_prom, 2)} UF/m2`);
  setText('constr-total-neto', fmtUf(metrics.total_neto));
  setText('constr-uf-bruto', `${fmtNumber(metrics.uf_bruto, 2)} UF/m2`);
  setText('constr-total-bruto', fmtUf(metrics.total_bruto));
  setText('plazo-label', `${fmtNumber(metrics.plazo_meses)} MESES`);
  setText('curva-label', fmtNumber(metrics.ancho_curva, 2));
  setText('peak-label', fmtNumber(metrics.peak_gasto, 2));
  setText('anticipo-label', `${fmtNumber(metrics.anticipo_pct)}%`);
  setText('retencion-label', `${fmtNumber(metrics.retencion_pct)}%`);

  if ($('constr-uf-st')) $('constr-uf-st').value = toNumber(metrics.costo_uf_m2_sobre_tierra);
  if ($('constr-uf-bt')) $('constr-uf-bt').value = toNumber(metrics.costo_uf_m2_bajo_tierra);
  if ($('constr-pct-bt')) $('constr-pct-bt').value = toNumber(metrics.pct_bajo_tierra_sobre_cota_0);
  if ($('anticipo-slider')) $('anticipo-slider').value = toNumber(metrics.anticipo_pct);
  if ($('retencion-slider')) $('retencion-slider').value = toNumber(metrics.retencion_pct);

  const meses = Math.max(1, metrics.plazo_meses);
  const normalizedCurve = Array.from({ length: meses }, (_, index) => {
    const start = (1 - Math.cos(Math.PI * (index / meses))) / 2;
    const end = (1 - Math.cos(Math.PI * ((index + 1) / meses))) / 2;
    return end - start;
  });
  const amortizacionAnticipo = (metrics.total_neto * toNumber(metrics.anticipo_pct) / 100) / meses;
  const retencionMensual = (metrics.total_neto * toNumber(metrics.retencion_pct) / 100) / meses;

  setHtml('constr-flujo-tbody', Array.from({ length: meses }, (_, index) => `
    <tr>
      <td>Mes ${fmtNumber(index + 1)}</td>
      <td style="text-align:center">${fmtUf(metrics.total_neto * normalizedCurve[index])}</td>
      <td style="text-align:center">${fmtUf(amortizacionAnticipo)}</td>
      <td style="text-align:center">${fmtUf(retencionMensual)}</td>
      <td style="text-align:center;color:#16a34a">${fmtUf((metrics.total_neto * normalizedCurve[index]) - amortizacionAnticipo - retencionMensual)}</td>
      <td style="text-align:center">${fmtPct(((index + 1) / meses) * 100)}</td>
    </tr>
  `).join(''));
}

const COST_CATEGORY_ORDER = [
  'CONSTRUCCION',
  'TERRENO',
  'PILOTO Y SALA DE VENTA',
  'HONORARIOS',
  'ADMINISTRACION',
  'VENTAS',
  'PUBLICIDAD Y MARKETING',
  'GASTOS FINANCIEROS',
  'OTROS EGRESOS',
];

function getConstructionStartMonth() {
  const hito = state.gantt.find((row) => /CONSTRUCCION/i.test(row.nombre || ''));
  return hito ? toNumber(hito.inicio) : 1;
}

function getPartidaFormulaText(partida) {
  if (partida.auto_origen) return partida.formula_display || 'extraido';
  if (partida.formula_tipo === 'expr') return partida.formula_referencia || '';
  if (partida.formula_tipo === 'manual') return partida.formula_valor ? String(partida.formula_valor) : '';
  return partida.formula_referencia || partida.formula_tipo || '';
}

function mapLegacyCategoryName(name, partidaName = '') {
  const source = `${name} ${partidaName}`.toUpperCase();
  if (source.includes('TERRENO')) return 'TERRENO';
  if (source.includes('CONSTRUCCION')) return 'CONSTRUCCION';
  if (source.includes('SALA DE VENTAS') || source.includes('PILOTO')) return 'PILOTO Y SALA DE VENTA';
  if (source.includes('PUBLICIDAD') || source.includes('MARKETING') || source.includes('MATERIAL IMPRESO')) return 'PUBLICIDAD Y MARKETING';
  if (source.includes('VENTA')) return 'VENTAS';
  if (source.includes('PROYECT') || source.includes('HONOR') || source.includes('PERMISO') || source.includes('ESTUDIO') || source.includes('ASESORIA') || source.includes('FEE')) return 'HONORARIOS';
  if (source.includes('ADMIN')) return 'ADMINISTRACION';
  if (source.includes('INTERES') || source.includes('FINAN')) return 'GASTOS FINANCIEROS';
  return 'OTROS EGRESOS';
}

function buildCostContext() {
  const terrainCategory = state.costos.find((category) => category.nombre === 'TERRENO');
  const terrenoBase = (terrainCategory?.partidas || []).reduce((sum, partida) => sum + (partida.es_terreno ? toNumber(partida.total_neto) : 0), 0);
  const construccionMetrics = getConstructionMetrics();
  return {
    meses_construccion: getConstructionDuration(),
    m2_utiles: getUsefulMunicipalAreaTotal(),
    m2_municipales: getUsefulMunicipalAreaTotal(),
    m2_sobre_cota_0: getAboveGradeAreaTotal(),
    m2_subterraneo: construccionMetrics.sup_bajo_tierra,
    m2_losa_total: construccionMetrics.sup_total,
    m2_vendible_deptos: state.cabida.reduce((sum, row) => sum + ((toNumber(row.sup_interior) + toNumber(row.sup_terrazas)) * toNumber(row.cantidad)), 0),
    total_construccion: construccionMetrics.total_neto,
    total_terreno: terrenoBase,
    ventas_brutas: toNumber(state.calculos.ventas_brutas),
  };
}

function evaluateExpressionFormula(expression, context) {
  if (!expression) return 0;
  const normalized = String(expression)
    .toLowerCase()
    .replace(/cantidad de meses de construcci[oó]n/g, 'meses_construccion')
    .replace(/meses de construcci[oó]n/g, 'meses_construccion')
    .replace(/m2 utiles/g, 'm2_utiles')
    .replace(/m2 municipales/g, 'm2_municipales')
    .replace(/m2 sobre cota 0/g, 'm2_sobre_cota_0')
    .replace(/m2 subterraneo/g, 'm2_subterraneo')
    .replace(/ventas brutas/g, 'ventas_brutas');

  let expr = normalized;
  Object.entries(context).forEach(([key, value]) => {
    expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(toNumber(value)));
  });
  expr = expr.replace(/[^0-9+\-*/(). ]/g, '');
  if (!expr.trim()) return 0;
  try {
    return Function(`"use strict"; return (${expr});`)();
  } catch {
    return 0;
  }
}

function evaluateCostPartida(partida, context) {
  if (partida.auto_origen) return toNumber(partida.total_neto);
  if (partida.formula_tipo === 'expr') return evaluateExpressionFormula(partida.formula_referencia, context);
  if (partida.formula_tipo === 'manual') return toNumber(partida.formula_valor || partida.total_neto);
  if (partida.formula_tipo === 'pct_ventas' || partida.formula_tipo === 'pct_ventas_mensual') return toNumber(context.ventas_brutas) * toNumber(partida.formula_valor);
  if (partida.formula_tipo === 'curva_s') return toNumber(context.total_construccion);
  return toNumber(partida.total_neto);
}

function normalizeDistribution(distribucion, total) {
  const months = Array.from({ length: 13 }, (_, index) => toNumber(distribucion?.[index]));
  const sum = months.reduce((acc, value) => acc + value, 0);
  if (!sum && total) {
    months[0] = total;
  }
  return months;
}

function buildFinancialCostRows(manualRows = []) {
  const terrainTermMonths = Math.max(1, getConstructionStartMonth());
  const constructionMonths = Math.max(1, getConstructionDuration());
  const terrenoBase = (state.costos.find((category) => category.nombre === 'TERRENO')?.partidas || [])
    .reduce((sum, partida) => sum + (partida.es_terreno ? toNumber(partida.total_neto) : 0), 0);
  const construccionMetrics = getConstructionMetrics();

  const terrenoAprobado = state.financiamiento.credito_terreno_activo
    ? terrenoBase * toNumber(state.financiamiento.credito_terreno_pct) / 100
    : 0;
  const terrenoInteres = terrenoAprobado * toNumber(state.financiamiento.credito_terreno_tasa) / 100 * (terrainTermMonths / 12);
  const construccionAprobada = state.financiamiento.linea_construccion_activo
    ? construccionMetrics.total_neto * toNumber(state.financiamiento.linea_construccion_pct) / 100
    : 0;
  const construccionInteres = construccionAprobada * toNumber(state.financiamiento.linea_construccion_tasa) / 100 * (constructionMonths / 12) * 0.5;
  const impuestoTimbre = construccionAprobada * 0.012;
  const alzamiento = construccionAprobada * 0.003;

  const autoRows = [
    { nombre: 'Terreno · Linea aprobada', formula_display: 'extraido financiamiento terreno', total_neto: terrenoAprobado, distribucion_mensual: [terrenoAprobado] },
    { nombre: 'Terreno · Interes', formula_display: 'extraido financiamiento terreno', total_neto: terrenoInteres, distribucion_mensual: [0, terrenoInteres] },
    { nombre: 'Terreno · Pago de linea', formula_display: 'extraido pago de linea terreno', total_neto: terrenoAprobado, distribucion_mensual: Array.from({ length: 13 }, (_, index) => index === Math.min(12, terrainTermMonths) ? terrenoAprobado : 0) },
    { nombre: 'Construccion · Linea aprobada', formula_display: 'extraido linea construccion', total_neto: construccionAprobada, distribucion_mensual: [0, ...Array.from({ length: 12 }, (_, index) => index < constructionMonths ? construccionAprobada / constructionMonths : 0)] },
    { nombre: 'Construccion · Interes', formula_display: 'extraido linea construccion', total_neto: construccionInteres, distribucion_mensual: [0, ...Array.from({ length: 12 }, (_, index) => index < constructionMonths ? construccionInteres / constructionMonths : 0)] },
    { nombre: 'Construccion · Impuesto de timbre', formula_display: 'extraido linea construccion', total_neto: impuestoTimbre, distribucion_mensual: [impuestoTimbre] },
    { nombre: 'Construccion · Alzamiento', formula_display: 'extraido linea construccion', total_neto: alzamiento, distribucion_mensual: Array.from({ length: 13 }, (_, index) => index === Math.min(12, constructionMonths) ? alzamiento : 0) },
    { nombre: 'Construccion · Pago de linea', formula_display: 'extraido linea construccion', total_neto: construccionAprobada, distribucion_mensual: Array.from({ length: 13 }, (_, index) => index === Math.min(12, constructionMonths) ? construccionAprobada : 0) },
  ].map((row, index) => ({
    id: `auto-fin-${index}`,
    formula_tipo: 'calculado',
    tiene_iva: false,
    es_terreno: false,
    auto_origen: true,
    ...row,
  }));

  return autoRows.concat(manualRows.map((row) => ({ ...row, auto_origen: false })));
}

function ensureCostosState() {
  const byCategory = new Map(COST_CATEGORY_ORDER.map((name) => [name, { id: '', nombre: name, partidas: [] }]));
  (state.costos || []).forEach((category) => {
    (category.partidas || []).forEach((partida) => {
      const target = mapLegacyCategoryName(category.nombre, partida.nombre);
      const current = byCategory.get(target);
      current.partidas.push({
        ...partida,
        distribucion_mensual: Array.isArray(partida.distribucion_mensual) ? partida.distribucion_mensual : [],
      });
    });
  });

  const normalized = COST_CATEGORY_ORDER.map((name) => {
    const category = byCategory.get(name);
    const manualRows = (category.partidas || []).filter((row) => !row.auto_origen && row.nombre);
    return {
      ...category,
      nombre: name,
      partidas: name === 'GASTOS FINANCIEROS' ? buildFinancialCostRows(manualRows.filter((row) => !/^Terreno ·|^Construccion ·/.test(row.nombre || ''))) : manualRows,
    };
  });

  state.costos = normalized;
  return normalized;
}

function renderCostPlanilla() {
  const categorias = ensureCostosState();
  const context = buildCostContext();
  const monthlyTotals = Array.from({ length: 13 }, () => 0);
  let totalNeto = 0;
  let totalIva = 0;

  setHtml('planilla-tbody', categorias.map((categoria) => {
    const categoryRows = (categoria.partidas || []).map((partida, index) => {
      const total = evaluateCostPartida(partida, context);
      const distribucion = normalizeDistribution(partida.distribucion_mensual, total);
      totalNeto += total;
      totalIva += partida.tiene_iva ? total * 0.19 : 0;
      distribucion.forEach((value, monthIndex) => { monthlyTotals[monthIndex] += value; });

      return `
        <tr data-cost-row data-category="${escapeHtml(categoria.nombre)}" data-index="${index}" ${partida.auto_origen ? 'data-auto="1"' : ''}>
          <td><input class="inp" data-field="nombre" value="${escapeHtml(partida.nombre || '')}" ${partida.auto_origen ? 'disabled' : ''}/></td>
          <td><input class="inp" data-field="formula" value="${escapeHtml(getPartidaFormulaText(partida))}" placeholder="Ej: 2500*meses_construccion" ${partida.auto_origen ? 'disabled' : ''}/></td>
          <td style="text-align:center;color:#22c55e;font-weight:800">${fmtUf(total)}</td>
          <td style="text-align:center"><input type="checkbox" data-field="tiene_iva" ${partida.tiene_iva ? 'checked' : ''} ${partida.auto_origen ? 'disabled' : ''}/></td>
          <td style="text-align:center"><input type="checkbox" data-field="es_terreno" ${partida.es_terreno ? 'checked' : ''} ${partida.auto_origen ? 'disabled' : ''}/></td>
          <td style="text-align:center">${partida.auto_origen ? 'AUTO' : '<button class="btn-outline" type="button" onclick="redistribuirPartida(this)">Plan</button>'}</td>
          ${distribucion.map((value, monthIndex) => `<td><input class="inp" data-month="${monthIndex}" type="number" step="0.01" value="${toNumber(value)}" ${partida.auto_origen ? 'disabled' : ''}/></td>`).join('')}
        </tr>
      `;
    }).join('');

    return `
      <tr style="background:#e2e8f0">
        <td colspan="19" style="font-weight:800;color:#0f172a;padding:10px;display:flex;justify-content:space-between;align-items:center">
          <span>${escapeHtml(categoria.nombre)}</span>
          <button class="btn-outline" type="button" onclick="agregarPartidaLinea('${escapeHtml(categoria.nombre)}')">+ Subpartida</button>
        </td>
      </tr>
      ${categoryRows}
    `;
  }).join(''));

  setText('plan-total-neto', fmtUf(totalNeto));
  setText('plan-total-iva', fmtUf(totalIva));
  setText('plan-iva-credito', fmtUf(totalIva));
  setText('plan-total-bruto', fmtUf(totalNeto + totalIva));
  monthlyTotals.forEach((value, index) => setText(`plan-m${index}`, fmtUf(value)));
}

function renderCostosModule() {
  ensureCostosState();
  renderCostStructure();
  renderCostPlanilla();
}

function renderProjectHeader() {
  setText('proj-title', state.proyecto?.nombre || 'Proyecto');
  setText('proj-dir', state.proyecto?.direccion || 'Sin direccion');
  setText('nav-user', 'modo dinamico local');
  if (state.proyecto?.updated_at && state.sync.status === 'ok') {
    $('sync-detail').textContent = `Ult. actualizacion ${fmtDateTime(state.proyecto.updated_at)}`;
  }
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
  renderGanttEditor(state.gantt);
  renderVentasModule();
  renderConstruccion();
  renderCostosModule();
  renderKpis();
}

function getCabidaRowsFromEditor() {
  return Array.from(document.querySelectorAll('[data-cabida-row]')).map((row) => ({
    uso: row.querySelector('[data-field="uso"]')?.value?.trim() || 'Nuevo uso',
    cantidad: toNumber(row.querySelector('[data-field="cantidad"]')?.value),
    estacionamientos: 0,
    bodegas: 0,
    sup_interior: toNumber(row.querySelector('[data-field="sup_interior"]')?.value),
    sup_terrazas: toNumber(row.querySelector('[data-field="sup_terrazas"]')?.value),
    sup_comunes: 0,
    sup_util_mun: getMunicipalUsefulPerUnit(
      row.querySelector('[data-field="sup_interior"]')?.value,
      row.querySelector('[data-field="sup_terrazas"]')?.value
    ),
  }));
}

function getCabidaProjectSettingsFromEditor() {
  return {
    ...state.proyecto,
    terraza_util_pct: toNumber($('cabida-terraza-util-pct')?.value),
    comunes_tipo: $('cabida-comunes-tipo')?.value || 'porcentaje',
    comunes_valor: toNumber($('cabida-comunes-valor')?.value),
    estacionamientos_cantidad: toNumber($('cabida-estacionamientos-cantidad')?.value),
    estacionamientos_sup_interior: toNumber($('cabida-estacionamientos-sup-interior')?.value),
    estacionamientos_sup_terrazas: toNumber($('cabida-estacionamientos-sup-terrazas')?.value),
    bodegas_cantidad: toNumber($('cabida-bodegas-cantidad')?.value),
    bodegas_sup_interior: toNumber($('cabida-bodegas-sup-interior')?.value),
    bodegas_sup_terrazas: toNumber($('cabida-bodegas-sup-terrazas')?.value),
  };
}

function onCabidaInputChange() {
  state.proyecto = normalizeProject(getCabidaProjectSettingsFromEditor());
  state.cabida = getCabidaRowsFromEditor();
  renderCabidaTables(state.cabida);
  renderCabidaEditor(state.cabida);
  renderConstruccion();
  ensureVentasState();
  renderVentasModule();
  renderCostosModule();
}

function readConstruccionFromEditor() {
  return normalizeConstruccion({
    ...state.construccion,
    costo_uf_m2_sobre_tierra: toNumber($('constr-uf-st')?.value),
    pct_bajo_tierra_sobre_cota_0: toNumber($('constr-pct-bt')?.value),
    costo_uf_m2_bajo_tierra: toNumber($('constr-uf-bt')?.value),
    plazo_meses: getConstructionDuration(),
    anticipo_pct: toNumber($('anticipo-slider')?.value),
    retencion_pct: toNumber($('retencion-slider')?.value),
    ancho_curva: state.construccion?.ancho_curva ?? 0.5,
    peak_gasto: state.construccion?.peak_gasto ?? 0.5,
  });
}

function updateConstrParams() {
  state.construccion = readConstruccionFromEditor();
  renderConstruccion();
  renderCostosModule();
}

function onGanttInputChange() {
  state.gantt = readGanttEditor();
  renderGanttEditor(state.gantt);
  renderConstruccion();
  ensureVentasState();
  renderVentasSchedules();
  renderVentasSummaryCards();
  renderVentasCashflow();
  renderCostosModule();
}

function agregarHito() {
  const next = readGanttEditor();
  next.push({
    id: '',
    nombre: `Nuevo hito ${next.length + 1}`,
    color: '#3b82f6',
    dependencia: null,
    dependencia_tipo: 'fin',
    desfase: 0,
    inicio: 0,
    duracion: 1,
    fin: 1,
  });
  renderGanttEditor(next);
}

function moveGanttRow(index, direction) {
  const rows = readGanttEditor();
  const target = index + direction;
  if (target < 0 || target >= rows.length) return;
  const copy = [...rows];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  renderGanttEditor(copy);
}

function removeGanttRow(index) {
  const rows = readGanttEditor();
  rows.splice(index, 1);
  renderGanttEditor(rows);
}

function readVentasConfigEditor() {
  const map = new Map(state.ventasConfig.map((row) => [row.uso, { ...row }]));
  const accessorySales = {
    precio_estacionamiento: toNumber($('ventas-precio-estacionamiento-global')?.value),
    precio_bodega: toNumber($('ventas-precio-bodega-global')?.value),
  };
  document.querySelectorAll('[data-ventas-config-row]').forEach((row) => {
    const uso = row.dataset.uso;
    if (!uso || !map.has(uso)) return;
    const target = map.get(uso);
    row.querySelectorAll('[data-field]').forEach((input) => {
      target[input.dataset.field] = toNumber(input.value);
    });
    target.precio_estacionamiento = accessorySales.precio_estacionamiento;
    target.precio_bodega = accessorySales.precio_bodega;
  });
  return Array.from(map.values());
}

function readVentasCronogramaEditor() {
  return Array.from(document.querySelectorAll('[data-ventas-cronograma-row]')).map((row) => ({
    id: row.dataset.id || '',
    tipo: row.dataset.tipo,
    uso: row.dataset.uso,
    vinculo_gantt: row.querySelector('[data-field="vinculo_gantt"]')?.value || null,
    mes_inicio: toNumber(row.querySelector('[data-field="mes_inicio"]')?.value),
    duracion: toNumber(row.querySelector('[data-field="duracion"]')?.value),
    porcentaje: toNumber(row.querySelector('[data-field="porcentaje"]')?.value),
  }));
}

function onVentasInputChange() {
  state.ventasConfig = readVentasConfigEditor();
  state.ventasCronograma = readVentasCronogramaEditor();
  renderVentasModule();
  renderCostosModule();
}

function parseFormulaInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return { formula_tipo: 'manual', formula_valor: 0, formula_referencia: '' };
  if (/^[0-9.,]+$/.test(raw)) return { formula_tipo: 'manual', formula_valor: toNumber(raw.replace(',', '.')), formula_referencia: '' };
  return { formula_tipo: 'expr', formula_valor: 0, formula_referencia: raw };
}

function readCostosEditor() {
  const categories = ensureCostosState().map((category) => ({
    ...category,
    partidas: (category.partidas || []).map((partida) => ({ ...partida })),
  }));
  const categoryMap = new Map(categories.map((category) => [category.nombre, category]));

  document.querySelectorAll('[data-cost-row]').forEach((row) => {
    if (row.dataset.auto === '1') return;
    const category = categoryMap.get(row.dataset.category);
    const index = toNumber(row.dataset.index);
    const target = category?.partidas?.[index];
    if (!target) return;

    const formula = parseFormulaInput(row.querySelector('[data-field="formula"]')?.value);
    target.nombre = row.querySelector('[data-field="nombre"]')?.value?.trim() || 'Nueva subpartida';
    target.formula_tipo = formula.formula_tipo;
    target.formula_valor = formula.formula_valor;
    target.formula_referencia = formula.formula_referencia;
    target.tiene_iva = !!row.querySelector('[data-field="tiene_iva"]')?.checked;
    target.es_terreno = !!row.querySelector('[data-field="es_terreno"]')?.checked;
    target.distribucion_mensual = Array.from(row.querySelectorAll('[data-month]')).map((input) => toNumber(input.value));
  });

  state.costos = categories;
  return categories;
}

function agregarPartidaLinea(categoryName) {
  ensureCostosState();
  const category = state.costos.find((item) => item.nombre === categoryName);
  if (!category) return;
  category.partidas.push({
    id: '',
    nombre: 'Nueva subpartida',
    formula_tipo: 'expr',
    formula_valor: 0,
    formula_referencia: '',
    tiene_iva: true,
    es_terreno: categoryName === 'TERRENO',
    total_neto: 0,
    distribucion_mensual: Array.from({ length: 13 }, () => 0),
  });
  renderCostosModule();
}

function redistribuirPartida(button) {
  const row = button.closest('[data-cost-row]');
  if (!row) return;
  const formula = row.querySelector('[data-field="formula"]')?.value || '';
  const total = evaluateExpressionFormula(parseFormulaInput(formula).formula_referencia || formula, buildCostContext()) || 0;
  const months = Math.max(1, getConstructionDuration());
  const normalized = Array.from({ length: 13 }, (_, index) => {
    if (index === 0) return 0;
    return index <= months ? total / months : 0;
  });
  row.querySelectorAll('[data-month]').forEach((input, index) => {
    input.value = toNumber(normalized[index]);
  });
}

async function loadProjects() {
  state.proyectos = await api('/api/proyectos');
  if (!state.proyectos.length) return;
  const params = new URLSearchParams(window.location.search);
  const requestedProjectId = params.get('projectId');
  const targetProjectId = state.proyectos.some((project) => project.id === requestedProjectId)
    ? requestedProjectId
    : state.proyectos[0].id;
  await loadProject(targetProjectId);
}

async function loadProject(projectId) {
  state.proyectoId = projectId;
  const url = new URL(window.location.href);
  url.searchParams.set('projectId', projectId);
  window.history.replaceState({}, '', url);

  const [proyecto, cabida, gantt, ventasData, construccion, costos, financiamiento, capital, calculos] = await Promise.all([
    api(`/api/proyectos/${projectId}`),
    api(`/api/proyectos/${projectId}/cabida`),
    api(`/api/proyectos/${projectId}/gantt`),
    api(`/api/proyectos/${projectId}/ventas`),
    api(`/api/proyectos/${projectId}/construccion`).catch(() => ({})),
    api(`/api/proyectos/${projectId}/costos`),
    api(`/api/proyectos/${projectId}/financiamiento`).catch(() => ({})),
    api(`/api/proyectos/${projectId}/capital`).catch(() => ({})),
    api(`/api/proyectos/${projectId}/calculos`).catch(() => ({})),
  ]);

  state.proyecto = normalizeProject(proyecto);
  state.cabida = cabida;
  state.gantt = normalizeGanttRows(gantt);
  state.ventasConfig = ventasData.config || [];
  state.ventasCronograma = ventasData.cronograma || [];
  state.construccion = normalizeConstruccion(construccion);
  state.costos = costos;
  state.financiamiento = financiamiento;
  state.capital = capital;
  state.calculos = calculos;

  renderAll();
}

async function guardarCabida() {
  if (!state.proyectoId) return;
  const rows = getCabidaRowsFromEditor().filter((row) => row.uso);
  const proyecto = getCabidaProjectSettingsFromEditor();
  setSyncStatus('saving', 'GUARDANDO', 'Persistiendo cambios en la base');
  await Promise.all([
    api(`/api/proyectos/${state.proyectoId}`, {
      method: 'PUT',
      body: JSON.stringify(proyecto),
    }),
    api(`/api/proyectos/${state.proyectoId}/cabida`, {
      method: 'POST',
      body: JSON.stringify(rows),
    }),
  ]);
  state.sync.lastSavedAt = new Date().toISOString();
  await loadProject(state.proyectoId);
  await refreshHealthStatus();
}

async function guardarConstruccion() {
  if (!state.proyectoId) return;
  const payload = {
    ...readConstruccionFromEditor(),
    sup_sobre_tierra: getConstructionMetrics().sup_sobre_tierra,
    sup_bajo_tierra: getConstructionMetrics().sup_bajo_tierra,
  };
  setSyncStatus('saving', 'GUARDANDO', 'Actualizando parametros de construccion');
  await api(`/api/proyectos/${state.proyectoId}/construccion`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  state.sync.lastSavedAt = new Date().toISOString();
  await loadProject(state.proyectoId);
  await refreshHealthStatus();
}

async function guardarGantt() {
  if (!state.proyectoId) return;
  const rows = readGanttEditor();
  setSyncStatus('saving', 'GUARDANDO', 'Actualizando cronograma del proyecto');
  await api(`/api/proyectos/${state.proyectoId}/gantt`, {
    method: 'POST',
    body: JSON.stringify(rows),
  });
  state.sync.lastSavedAt = new Date().toISOString();
  await loadProject(state.proyectoId);
  await refreshHealthStatus();
}

async function guardarVentas() {
  if (!state.proyectoId) return;
  const config = readVentasConfigEditor();
  const cronograma = readVentasCronogramaEditor();
  setSyncStatus('saving', 'GUARDANDO', 'Actualizando estrategia comercial y cronogramas');
  await Promise.all([
    api(`/api/proyectos/${state.proyectoId}/ventas/config`, {
      method: 'POST',
      body: JSON.stringify(config),
    }),
    api(`/api/proyectos/${state.proyectoId}/ventas/cronograma`, {
      method: 'POST',
      body: JSON.stringify(cronograma),
    }),
  ]);
  state.sync.lastSavedAt = new Date().toISOString();
  await loadProject(state.proyectoId);
  await refreshHealthStatus();
}

async function guardarCostos() {
  if (!state.proyectoId) return;
  const payload = readCostosEditor();
  setSyncStatus('saving', 'GUARDANDO', 'Persistiendo planilla de costos');
  await api(`/api/proyectos/${state.proyectoId}/costos`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  state.sync.lastSavedAt = new Date().toISOString();
  await loadProject(state.proyectoId);
  await refreshHealthStatus();
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
    sup_util_mun: getMunicipalUsefulPerUnit(0, 0),
  });
  renderCabidaEditor(rows);
}

[
  'guardarFinanciamiento',
  'guardarCapital',
  'toggleEstructura',
  'setCostosView',
  'setDeudaView',
  'setInteresView',
  'setCapTab',
  'exportarExcel',
  'handleFileUpload',
  'calcularFinanciamiento',
  'calcularCapital',
].forEach((fnName) => {
  window[fnName] = createPendingAction(fnName);
});

window.showTab = showTab;
window.onCabidaInputChange = onCabidaInputChange;
window.guardarCabida = guardarCabida;
window.guardarConstruccion = guardarConstruccion;
window.guardarGantt = guardarGantt;
window.guardarVentas = guardarVentas;
window.updateConstrParams = updateConstrParams;
window.guardarCostos = guardarCostos;
window.agregarPartidaLinea = agregarPartidaLinea;
window.redistribuirPartida = redistribuirPartida;
window.agregarUso = agregarUso;
window.agregarHito = agregarHito;
window.onGanttInputChange = onGanttInputChange;
window.moveGanttRow = moveGanttRow;
window.removeGanttRow = removeGanttRow;
window.onVentasInputChange = onVentasInputChange;

document.addEventListener('DOMContentLoaded', async () => {
  ensureProjectControls();
  ensureActionButtons();
  renderSyncStatus();

  const activeTab = document.querySelector('.tab-btn.active');
  if (activeTab) {
    const match = activeTab.getAttribute('onclick')?.match(/showTab\('([^']+)'/);
    if (match) showTab(match[1], activeTab);
  }

  try {
    await refreshHealthStatus();
    await loadProjects();
  } catch (error) {
    console.error(error);
    setSyncStatus('error', 'SIN CONEXION', error.message);
    setText('proj-title', 'No se pudo cargar la version dinamica');
    setText('proj-dir', error.message);
  }
});
