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
  costDrag: null,
  ganttDrag: null,
  costosUi: {
    collapsed: {},
    activePaymentCategory: null,
    activePaymentIndex: null,
    activeFormulaCategory: null,
    activeFormulaIndex: null,
    formulaInputId: null,
    costFlowMode: 'monthly',
  },
  sync: {
    status: 'loading',
    message: 'Verificando conexion',
    detail: 'Conectando con backend',
    lastSavedAt: null,
  },
  autosave: {
    timers: {},
    inFlight: {},
    queued: {},
  },
};

const USER_STORAGE_KEYS = [
  'evproyectos.userName',
  'evproyectos_user_name',
  'userName',
  'user_name',
];

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

const AUTOSAVE_SCOPE_LABELS = {
  cabida: 'cabida',
  terreno: 'terreno',
  construccion: 'construccion',
  gantt: 'carta gantt',
  ventas: 'ventas',
  costos: 'costos del proyecto',
};

function getStoredUserName() {
  for (const key of USER_STORAGE_KEYS) {
    try {
      const value = window.localStorage.getItem(key);
      if (value && String(value).trim()) return String(value).trim();
    } catch {
      // Ignore storage access issues and keep fallback behavior.
    }
  }
  return '';
}

function getCurrentUserName() {
  const explicitUser = window.__EV_USER__?.name || window.__BRICSA_USER__?.name || getStoredUserName();
  return String(explicitUser || state.proyecto?.updated_by || 'Usuario local').trim();
}

function toMonthInputValue(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function fromMonthInputValue(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-01` : '';
}

function formatMonthYear(value) {
  if (!value) return 'sin definir';
  const date = new Date(`${String(value).slice(0, 7)}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'sin definir';
  return new Intl.DateTimeFormat('es-CL', { month: 'short', year: '2-digit' }).format(date);
}

function getLastModifierName() {
  return String(state.proyecto?.updated_by || '').trim() || 'sin registro';
}

function toNumber(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    let normalized = trimmed.replace(/\s+/g, '');
    const commaIndex = normalized.lastIndexOf(',');
    const dotIndex = normalized.lastIndexOf('.');
    if (commaIndex >= 0 && dotIndex >= 0) {
      normalized = commaIndex > dotIndex
        ? normalized.replace(/\./g, '').replace(',', '.')
        : normalized.replace(/,/g, '');
    } else if (commaIndex >= 0) {
      normalized = normalized.replace(',', '.');
    }
    const localized = Number(normalized);
    return Number.isFinite(localized) ? localized : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeProject(project = {}) {
  const terrenoM2Bruto = project.terreno_m2_bruto ?? project.terreno_m2_bruto_afecto ?? 0;
  const terrenoM2Afectacion = project.terreno_m2_afectacion ?? 0;
  const terrenoM2Neto = project.terreno_m2_neto ?? Math.max(0, toNumber(terrenoM2Bruto) - toNumber(terrenoM2Afectacion));
  const terrenoPrecioTotal = project.terreno_precio_total ?? 0;
  const terrenoPrecioUfM2 = project.terreno_precio_uf_m2
    ?? (terrenoM2Neto > 0 ? terrenoPrecioTotal / terrenoM2Neto : 0);
  return {
    ...project,
    compra_terreno_fecha: project.compra_terreno_fecha || '',
    terreno_m2_bruto: terrenoM2Bruto,
    terreno_m2_bruto_afecto: terrenoM2Bruto,
    terreno_m2_afectacion: terrenoM2Afectacion,
    terreno_m2_neto: terrenoM2Neto,
    terreno_precio_uf_m2: terrenoPrecioUfM2,
    terreno_precio_total: terrenoPrecioTotal || (terrenoM2Neto * terrenoPrecioUfM2),
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

function normalizeFinanciamiento(data = {}) {
  return {
    credito_terreno_activo: data.credito_terreno_activo ?? true,
    credito_terreno_pct: data.credito_terreno_pct ?? 70,
    credito_terreno_tasa: data.credito_terreno_tasa ?? 3.5,
    credito_terreno_pago_intereses: data.credito_terreno_pago_intereses || 'Semestral',
    credito_terreno_pago_capital: data.credito_terreno_pago_capital || 'Inicio Construccion',
    linea_construccion_activo: data.linea_construccion_activo ?? true,
    linea_construccion_pct: data.linea_construccion_pct ?? 100,
    linea_construccion_tasa: data.linea_construccion_tasa ?? 3.5,
    linea_construccion_pago_intereses: data.linea_construccion_pago_intereses || 'Anual',
    linea_construccion_pago_capital: data.linea_construccion_pago_capital || 'Contra Escrituraciones',
    ...data,
  };
}

function getConstructionDuration() {
  const hito = getConstructionMilestone();
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

function getSignedAmount(value, kind = 'neutral') {
  const amount = Math.abs(toNumber(value));
  if (kind === 'cost') return -amount;
  if (kind === 'income') return amount;
  return toNumber(value);
}

function fmtTableAmount(value, options = {}) {
  const {
    kind = 'neutral',
    total = false,
    decimals = 0,
  } = options;
  const signed = getSignedAmount(value, kind);
  return total ? `${fmtNumber(signed, decimals)} UF` : fmtNumber(signed, decimals);
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

function getSyncDetailText() {
  const reference = state.proyecto?.updated_at || state.sync.lastSavedAt || state.health?.timestamp;
  return reference
    ? `Ultima sincronizacion: ${fmtDateTime(reference)}`
    : 'Ultima sincronizacion: sin registro';
}

function renderSyncStatus() {
  const badge = $('sync-badge');
  const label = $('sync-label');
  const detail = $('sync-detail');
  const modifier = $('sync-last-modifier');
  if (!badge || !label || !detail || !modifier) return;

  const variantsOld = {
    loading: { color: '#475569', bg: '#f8fafc', border: '#cbd5e1', icon: '☁' },
    ok: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: '☁ ✓' },
    saving: { color: '#b45309', bg: '#fffbeb', border: '#fde68a', icon: '↻' },
    error: { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', icon: '⚠' },
  };

  const variants = {
    loading: { color: '#475569', bg: '#f8fafc', border: '#cbd5e1', label: 'Sincronizando' },
    ok: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'Sincronizado' },
    saving: { color: '#b45309', bg: '#fffbeb', border: '#fde68a', label: 'Guardando' },
    error: { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', label: 'Sin conexion' },
  };

  const variant = variants[state.sync.status] || variants.loading;
  badge.style.color = variant.color;
  badge.style.background = variant.bg;
  badge.style.borderColor = variant.border;
  label.textContent = variant.label;
  detail.textContent = getSyncDetailText();
  modifier.textContent = `Ultima modificacion por: ${getLastModifierName()}`;
}

function scheduleAutosave(scope, delay = 900) {
  if (!state.proyectoId || !scope) return;
  window.clearTimeout(state.autosave.timers[scope]);
  state.autosave.queued[scope] = true;
  setSyncStatus('saving', 'GUARDANDO', `Cambios pendientes en ${AUTOSAVE_SCOPE_LABELS[scope] || scope}`);
  state.autosave.timers[scope] = window.setTimeout(() => {
    runAutosave(scope);
  }, delay);
}

async function runAutosave(scope) {
  if (!state.proyectoId || !scope) return;
  window.clearTimeout(state.autosave.timers[scope]);

  if (state.autosave.inFlight[scope]) {
    state.autosave.queued[scope] = true;
    return;
  }

  const handlers = {
    cabida: guardarCabida,
    terreno: guardarTerreno,
    construccion: guardarConstruccion,
    gantt: guardarGantt,
    ventas: guardarVentas,
    costos: guardarCostos,
  };
  const handler = handlers[scope];
  if (!handler) return;

  state.autosave.inFlight[scope] = true;
  state.autosave.queued[scope] = false;
  try {
    await handler();
  } catch (error) {
    console.error(error);
    setSyncStatus('error', 'SIN CONEXION', error.message);
  } finally {
    state.autosave.inFlight[scope] = false;
    if (state.autosave.queued[scope]) {
      runAutosave(scope);
    }
  }
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-user-name': getCurrentUserName(),
    ...(options.headers || {}),
  };
  const response = await fetch(path, {
    headers,
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
}

function setupAutosaveListeners() {
  const formulaInput = $('cost-formula-modal-input');
  if (formulaInput && !formulaInput.dataset.autosaveBound) {
    const onFormulaDraftChange = () => autosaveCostFormulaModal();
    formulaInput.addEventListener('input', onFormulaDraftChange);
    formulaInput.addEventListener('change', onFormulaDraftChange);
    formulaInput.dataset.autosaveBound = '1';
  }

  const paymentModal = $('payment-plan-modal');
  if (paymentModal && !paymentModal.dataset.autosaveBound) {
    const onPaymentDraftChange = (event) => {
      if (!event.target.closest('.payment-line')) return;
      autosavePaymentPlanModal();
    };
    paymentModal.addEventListener('input', onPaymentDraftChange);
    paymentModal.addEventListener('change', onPaymentDraftChange);
    paymentModal.dataset.autosaveBound = '1';
  }

  if (!document.body.dataset.costAutosaveBound) {
    const onCostDraftChange = (event) => {
      if (!event.target.closest('#planilla-table [data-cost-row]')) return;
      readCostosEditor();
      scheduleAutosave('costos');
    };
    document.addEventListener('input', onCostDraftChange);
    document.addEventListener('change', onCostDraftChange);
    document.body.dataset.costAutosaveBound = '1';
  }
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

const GANTT_MONTH_WIDTH = 54;

function addMonths(date, months) {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
}

function getGanttBaseDate() {
  const raw = String(state.proyecto?.compra_terreno_fecha || '').slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}-01T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1);
}

function formatTimelineQuarterLabel(date) {
  return new Intl.DateTimeFormat('es-CL', { month: 'short', year: '2-digit' }).format(date);
}

function getGanttTimelineMeta(rows = state.gantt) {
  const normalized = normalizeGanttRows(rows);
  const totalMonths = Math.max(12, ...normalized.map((row) => toNumber(row.fin)));
  const timelineWidth = (totalMonths + 1) * GANTT_MONTH_WIDTH;
  const baseDate = getGanttBaseDate();
  const quarterMarks = [];
  for (let month = 0; month <= totalMonths; month += 3) {
    quarterMarks.push({
      month,
      left: month * GANTT_MONTH_WIDTH,
      label: formatTimelineQuarterLabel(addMonths(baseDate, month)),
    });
  }
  return { totalMonths, timelineWidth, quarterMarks };
}

function renderGanttTimelineScale(containerId, meta) {
  if (!$(containerId)) return;
  setHtml(containerId, `
    <div class="gantt-timeline-scale has-grid" style="width:${meta.timelineWidth}px;--month-width:${GANTT_MONTH_WIDTH}px">
      ${meta.quarterMarks.map((mark) => `
        <div class="gantt-quarter-mark" style="left:${mark.left}px">
          <span><strong>M${fmtNumber(mark.month)}</strong>${escapeHtml(mark.label)}</span>
        </div>
      `).join('')}
    </div>
  `);
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
    fin: 0,
  }));
  return normalizeGanttRows(rows);
}

function renderGanttEditor(rows = state.gantt) {
  const normalized = normalizeGanttRows(rows);
  state.gantt = normalized;
  const meta = getGanttTimelineMeta(normalized);
  renderGanttTimelineScale('gantt-timeline-head', meta);

  setHtml('gantt-tbody', normalized.map((row, index) => {
    const left = toNumber(row.inicio) * GANTT_MONTH_WIDTH;
    const width = Math.max(1, toNumber(row.duracion)) * GANTT_MONTH_WIDTH;
    return `
      <tr data-gantt-row data-id="${escapeHtml(row.id || '')}" data-index="${index}" ondragover="allowGanttDrop(event)" ondrop="dropGanttRow(event)">
        <td class="gantt-sticky-left gantt-actions" style="left:0;width:40px">
          <span class="drag-handle" data-gantt-drag="1" draggable="true" ondragstart="startGanttDrag(event)" ondragend="endGanttDrag(event)" title="Orden manual">&#8226;&#8226;&#8226;</span>
        </td>
        <td class="gantt-sticky-left" style="left:40px;width:220px">
          <div style="display:grid;grid-template-columns:18px 1fr;gap:8px;align-items:center">
            <input data-field="color" type="color" value="${escapeHtml(row.color || '#3b82f6')}" onchange="onGanttInputChange()"/>
            <input class="inp" data-field="nombre" value="${escapeHtml(row.nombre)}" onchange="onGanttInputChange()"/>
          </div>
        </td>
        <td class="gantt-sticky-left" style="left:260px;width:150px">
          <div style="display:grid;grid-template-columns:1fr 56px;gap:4px">
            <select class="inp" data-field="dependencia" onchange="onGanttInputChange()">
              ${getGanttDependencyOptions(row.nombre).replace(`value="${escapeHtml(row.dependencia || '')}"`, `value="${escapeHtml(row.dependencia || '')}" selected`)}
            </select>
            <select class="inp" data-field="dependencia_tipo" onchange="onGanttInputChange()">
              <option value="inicio" ${row.dependencia_tipo === 'inicio' ? 'selected' : ''}>Inicio</option>
              <option value="fin" ${row.dependencia_tipo === 'fin' ? 'selected' : ''}>Fin</option>
            </select>
          </div>
        </td>
        <td class="gantt-sticky-left gantt-cell-tight" style="left:410px;width:62px"><input class="inp" data-field="desfase" type="number" value="${toNumber(row.desfase)}" onchange="onGanttInputChange()"/></td>
        <td class="gantt-sticky-left gantt-cell-tight" style="left:472px;width:62px"><input class="inp" data-field="inicio" type="number" value="${toNumber(row.inicio)}" ${row.dependencia ? 'disabled' : ''} onchange="onGanttInputChange()"/></td>
        <td class="gantt-sticky-left gantt-cell-tight" style="left:534px;width:70px"><input class="inp" data-field="duracion" type="number" value="${toNumber(row.duracion)}" onchange="onGanttInputChange()"/></td>
        <td>
          <div class="gantt-editor-track" style="width:${meta.timelineWidth}px;--month-width:${GANTT_MONTH_WIDTH}px">
            <div class="gantt-editor-bar" title="Inicio ${fmtNumber(row.inicio)} · Fin ${fmtNumber(row.fin)}" style="left:${left}px;width:${width}px;background:${escapeHtml(row.color || '#3b82f6')}"></div>
          </div>
        </td>
        <td class="gantt-sticky-right" style="width:42px">
          <div class="gantt-actions">
            <button class="btn-outline gantt-delete-btn" type="button" title="Eliminar fila" onclick="removeGanttRow(${index})">&times;</button>
          </div>
        </td>
      </tr>
    `;
  }).join(''));
  renderGanttPreview();
}

function renderGanttPreview() {
  const normalized = normalizeGanttRows(state.gantt);
  const meta = getGanttTimelineMeta(normalized);
  setHtml('gantt-preview', `
    <div class="gantt-timeline-scale has-grid" style="width:${meta.timelineWidth}px;--month-width:${GANTT_MONTH_WIDTH}px;margin-bottom:8px">
      ${meta.quarterMarks.map((mark) => `
        <div class="gantt-quarter-mark" style="left:${mark.left}px">
          <span><strong>M${fmtNumber(mark.month)}</strong>${escapeHtml(mark.label)}</span>
        </div>
      `).join('')}
    </div>
    ${normalized.map((hito) => {
      const left = toNumber(hito.inicio) * GANTT_MONTH_WIDTH;
      const width = Math.max(1, toNumber(hito.duracion)) * GANTT_MONTH_WIDTH;
      return `
      <div class="gantt-row">
        <div class="gantt-label">${escapeHtml(hito.nombre)}</div>
        <div class="gantt-track" style="width:${meta.timelineWidth}px;--month-width:${GANTT_MONTH_WIDTH}px">
          <div class="gantt-bar" title="Inicio ${fmtNumber(hito.inicio)} · Fin ${fmtNumber(hito.fin)}" style="left:${left}px;width:${width}px;background:${escapeHtml(hito.color || '#3b82f6')}"></div>
        </div>
      </div>
    `;
    }).join('')}
  `);
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
        <td style="text-align:center">${fmtTableAmount(metrics.precioBase, { kind: 'income' })}</td>
        <td style="text-align:center;color:#16a34a">${fmtTableAmount(metrics.subtotalPrincipal, { kind: 'income' })}</td>
        <td style="text-align:center">-</td>
        <td style="text-align:center">-</td>
        <td style="text-align:center">-</td>
        <td style="text-align:center">-</td>
        <td style="text-align:center;color:#ea580c;font-weight:800">${fmtTableAmount(metrics.total, { kind: 'income' })}</td>
        <td style="text-align:center">${fmtTableAmount(metrics.ticket, { kind: 'income' })}</td>
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
      <td style="text-align:center;color:#16a34a">${fmtTableAmount(addons.estacionamientos.total, { kind: 'income' })}</td>
      <td style="text-align:center">${fmtNumber(addons.estacionamientos.unidades)}</td>
      <td><input id="ventas-precio-estacionamiento-global" class="inp" type="number" step="0.01" value="${toNumber(accessorySales.precio_estacionamiento)}" onchange="onVentasInputChange()"/></td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center;color:#ea580c;font-weight:800">${fmtTableAmount(addons.estacionamientos.total, { kind: 'income' })}</td>
      <td style="text-align:center">${fmtTableAmount(addons.estacionamientos.precio, { kind: 'income' })}</td>
    </tr>
    <tr style="background:#f8fafc">
      <td style="font-weight:800">BODEGAS</td>
      <td style="text-align:center">${fmtNumber(addons.bodegas.unidades)}</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center;color:#16a34a">${fmtTableAmount(addons.bodegas.total, { kind: 'income' })}</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">${fmtNumber(addons.bodegas.unidades)}</td>
      <td><input id="ventas-precio-bodega-global" class="inp" type="number" step="0.01" value="${toNumber(accessorySales.precio_bodega)}" onchange="onVentasInputChange()"/></td>
      <td style="text-align:center;color:#ea580c;font-weight:800">${fmtTableAmount(addons.bodegas.total, { kind: 'income' })}</td>
      <td style="text-align:center">${fmtTableAmount(addons.bodegas.precio, { kind: 'income' })}</td>
    </tr>
  `);
  setHtml('ventas-tfoot', `
    <td>Total</td>
    <td>${fmtNumber(totalUnidades)}</td>
    <td>${fmtNumber(totalSup, 1)}</td>
    <td>${fmtNumber(totalUnidades ? totalSup / totalUnidades : 0, 1)}</td>
    <td colspan="7"></td>
    <td style="font-weight:800;color:#22c55e">${fmtTableAmount(totalVenta, { kind: 'income', total: true })}</td>
    <td>${fmtTableAmount(totalUnidades ? totalVentaDeptos / totalUnidades : 0, { kind: 'income', total: true })}</td>
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
        <td style="text-align:center">${fmtTableAmount(montoPromesa, { kind: 'income' })}</td>
        <td><input class="inp" type="number" step="0.01" data-field="pie_cuotas_pct" value="${toNumber(row.pie_cuotas_pct)}" onchange="onVentasInputChange()"/></td>
        <td style="text-align:center">${fmtTableAmount(montoCuotas, { kind: 'income' })}</td>
        <td><input class="inp" type="number" step="0.01" data-field="pie_cuoton_pct" value="${toNumber(row.pie_cuoton_pct)}" onchange="onVentasInputChange()"/></td>
        <td style="text-align:center">${fmtTableAmount(montoCuoton, { kind: 'income' })}</td>
        <td><input class="inp" type="number" step="0.01" data-field="hipotecario_pct" value="${toNumber(row.hipotecario_pct)}" onchange="onVentasInputChange()"/></td>
        <td style="text-align:center;color:#16a34a">${fmtTableAmount(totalUnidad, { kind: 'income' })}</td>
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
          <td style="text-align:center;color:#16a34a">${fmtTableAmount(velUf, { kind: 'income' })}</td>
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
      ${row.values.map((value) => `<td>${fmtTableAmount(value, { kind: 'income' })}</td>`).join('')}
    </tr>
  `).join(''));

  const totals = months.map((_, index) => rows.reduce((sum, row) => sum + row.values[index], 0));
  setHtml('flujo-ventas-tfoot', `<td>Total</td>${totals.map((value) => `<td>${fmtTableAmount(value, { kind: 'income', total: true })}</td>`).join('')}`);
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
      ${row.values.map((value) => `<td>${fmtTableAmount(value, { kind: 'income' })}</td>`).join('')}
    </tr>
  `).join(''));

  const totals = months.map((_, index) => rows.reduce((sum, row) => sum + row.values[index], 0));
  setHtml('flujo-ventas-tfoot', `<td>Total</td>${totals.map((value) => `<td>${fmtTableAmount(value, { kind: 'income', total: true })}</td>`).join('')}`);
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

  if ($('estructura-costos-list')) setHtml('estructura-costos-list', rowsHtml);
  setHtml('dist-costos-list', rowsHtml);
  setText('costos-total-neto', fmtUf(total));
  setText('costos-total-bruto', fmtUf(totalBruto));
}

function renderConstruccion() {
  const metrics = getConstructionMetrics();

  setText('constr-sup-st', `${fmtNumber(metrics.sup_sobre_tierra, 1)} m2`);
  setText('constr-sup-bt', `${fmtNumber(metrics.sup_bajo_tierra, 1)} m2`);
  setText('constr-total-st', fmtTableAmount(metrics.total_st, { kind: 'cost' }));
  setText('constr-total-bt', fmtTableAmount(metrics.total_bt, { kind: 'cost' }));
  setText('constr-sup-total', `${fmtNumber(metrics.sup_total, 1)} m2`);
  setText('constr-uf-prom', `${fmtNumber(metrics.uf_prom, 2)} /m2`);
  setText('constr-ratio-bt', fmtPct(metrics.pct_bajo_tierra_sobre_cota_0));
  setText('constr-ratio-bt-m2', `${fmtNumber(metrics.sup_bajo_tierra, 1)} m2 bajo tierra`);
  setText('constr-total-neto', fmtTableAmount(metrics.total_neto, { kind: 'cost', total: true }));
  setText('constr-uf-bruto', `${fmtNumber(metrics.uf_bruto, 2)} /m2`);
  setText('constr-total-bruto', fmtTableAmount(metrics.total_bruto, { kind: 'cost', total: true }));
  setText('plazo-label', `${fmtNumber(metrics.plazo_meses)} MESES`);
  setText('anticipo-label', `${fmtNumber(metrics.anticipo_pct)}%`);
  setText('retencion-label', `${fmtNumber(metrics.retencion_pct)}%`);

  if ($('constr-uf-st')) $('constr-uf-st').value = toNumber(metrics.costo_uf_m2_sobre_tierra);
  if ($('constr-uf-bt')) $('constr-uf-bt').value = toNumber(metrics.costo_uf_m2_bajo_tierra);
  if ($('constr-pct-bt')) $('constr-pct-bt').value = toNumber(metrics.pct_bajo_tierra_sobre_cota_0);
  if ($('constr-plazo-meses')) $('constr-plazo-meses').value = toNumber(metrics.plazo_meses);
  if ($('anticipo-slider')) $('anticipo-slider').value = toNumber(metrics.anticipo_pct);
  if ($('retencion-slider')) $('retencion-slider').value = toNumber(metrics.retencion_pct);

  const meses = Math.max(1, metrics.plazo_meses);
  const distribution = buildConstructionSCurve(metrics, meses);
  setText('anticipo-meta', `${fmtNumber(metrics.anticipo_pct)}% del contrato | descuento proporcional en EDPP`);
  setText('anticipo-monto', fmtUf(distribution.anticipoAmount));
  setText('retencion-meta', `${fmtNumber(metrics.retencion_pct)}% retenido sobre cada EDPP | total estimado ${fmtUf(distribution.retentionAmount)}`);
  setText('retencion-monto', fmtUf(distribution.retentionAmount));
  renderConstructionSCurveChart(metrics, distribution);

  renderConstructionFinancing();
}

function renderTerrainModule() {
  syncTerrainPurchaseMilestone();
  const purchaseMetrics = getTerrainPurchaseMetrics();
  const terrainBase = purchaseMetrics.precioTotal > 0 ? purchaseMetrics.precioTotal : getTerrainBaseCost();
  const milestone = getTerrainMilestone();
  const purchaseDate = state.proyecto?.compra_terreno_fecha || '';
  const terrainTermMonths = Math.max(1, getConstructionStartMonth());
  const approved = state.financiamiento.credito_terreno_activo
    ? terrainBase * toNumber(state.financiamiento.credito_terreno_pct) / 100
    : 0;

  if ($('terreno-fecha-compra')) $('terreno-fecha-compra').value = toMonthInputValue(purchaseDate);
  if ($('terreno-m2-bruto')) $('terreno-m2-bruto').value = purchaseMetrics.bruto;
  if ($('terreno-m2-afectacion')) $('terreno-m2-afectacion').value = purchaseMetrics.afectacion;
  if ($('terreno-m2-neto')) $('terreno-m2-neto').value = purchaseMetrics.neto;
  if ($('terreno-precio-uf-m2')) $('terreno-precio-uf-m2').value = purchaseMetrics.precioUfM2;
  if ($('terreno-precio-total')) $('terreno-precio-total').value = purchaseMetrics.precioTotal;
  setText('terreno-monto-financiado', fmtUf(approved));
  setText(
    'terreno-gantt-sync',
    milestone
      ? `El bloque "${milestone.nombre}" quedó sincronizado con ${formatMonthYear(purchaseDate)}.`
      : 'Sin bloque Compra terreno en la carta gantt.'
  );

  if ($('fin-terreno-pct')) $('fin-terreno-pct').value = toNumber(state.financiamiento.credito_terreno_pct);
  if ($('fin-terreno-tasa')) $('fin-terreno-tasa').value = toNumber(state.financiamiento.credito_terreno_tasa);
  if ($('fin-terreno-pago-int')) $('fin-terreno-pago-int').value = state.financiamiento.credito_terreno_pago_intereses || 'Semestral';
  setText('fin-terreno-costo', fmtUf(terrainBase));
  setText('fin-terreno-monto', fmtUf(approved));
  setText('fin-terreno-plazos', `Bloque Compra terreno en gantt | horizonte base ${fmtNumber(terrainTermMonths)} mes(es) hasta construcción`);
  setHtml('fin-terreno-partidas', (state.costos.find((category) => category.nombre === 'TERRENO')?.partidas || [])
    .filter((partida) => partida.es_terreno)
    .map((partida) => `<div>${escapeHtml(partida.nombre)} <strong>${fmtUf(partida.total_neto)}</strong></div>`)
    .join('') || '<div>Sin partidas de terreno marcadas.</div>');
  renderFinancingSourcePlanilla('terreno');
}

function renderConstructionFinancing() {
  const metrics = getConstructionMetrics();
  const approved = metrics.total_neto * toNumber(state.financiamiento.linea_construccion_pct) / 100;
  const start = getConstructionStartMonth();
  const duration = getConstructionDuration();

  if ($('fin-constr-pct')) $('fin-constr-pct').value = toNumber(state.financiamiento.linea_construccion_pct);
  if ($('fin-constr-tasa')) $('fin-constr-tasa').value = toNumber(state.financiamiento.linea_construccion_tasa);
  if ($('fin-constr-pago-int')) $('fin-constr-pago-int').value = state.financiamiento.linea_construccion_pago_intereses || 'Anual';
  setText('fin-constr-costo', fmtUf(metrics.total_neto));
  setText('fin-constr-monto', fmtUf(approved));
  setText('fin-constr-plazos', `Plazo estimado: mes ${fmtNumber(start)} a mes ${fmtNumber(start + duration)}`);
  setHtml('fin-constr-partidas', `<div>Base financiera tomada desde el total neto de construcción.</div>`);
  renderFinancingSourcePlanilla('construccion');
}

function buildConstructionSCurve(metrics, meses) {
  const width = Math.max(0.08, toNumber(metrics.ancho_curva || 0.5));
  const peak = Math.min(0.92, Math.max(0.08, toNumber(metrics.peak_gasto || 0.5)));
  const anticipoPct = Math.max(0, toNumber(metrics.anticipo_pct)) / 100;
  const retencionPct = Math.max(0, toNumber(metrics.retencion_pct)) / 100;
  const weights = Array.from({ length: meses }, (_, index) => {
    const x = meses === 1 ? 1 : index / (meses - 1);
    const gaussian = Math.exp(-((x - peak) ** 2) / (2 * (width ** 2)));
    const rampIn = Math.min(1, (index + 1) / Math.max(1, Math.round(meses * 0.28)));
    const rampOut = Math.min(1, (meses - index) / Math.max(1, Math.round(meses * 0.22)));
    return Math.max(0.001, gaussian * rampIn * rampOut);
  });
  const weightTotal = weights.reduce((sum, value) => sum + value, 0) || 1;
  const monthlyCosts = weights.map((weight) => (metrics.total_neto * weight) / weightTotal);
  const monthlyAnticipoRecovery = monthlyCosts.map((value) => value * anticipoPct);
  const monthlyRetention = monthlyCosts.map((value, index) => Math.max(0, value - monthlyAnticipoRecovery[index]) * retencionPct);
  const monthlyEdppNet = monthlyCosts.map((value, index) => Math.max(0, value - monthlyAnticipoRecovery[index] - monthlyRetention[index]));
  const cumulativeCosts = monthlyCosts.reduce((acc, value, index) => {
    acc.push((acc[index - 1] || 0) + value);
    return acc;
  }, []);
  const cumulativePct = cumulativeCosts.map((value) => value / Math.max(1, metrics.total_neto) * 100);
  return {
    monthlyCosts,
    monthlyAnticipoRecovery,
    monthlyRetention,
    monthlyEdppNet,
    cumulativeCosts,
    cumulativePct,
    anticipoAmount: monthlyAnticipoRecovery.reduce((sum, value) => sum + value, 0),
    retentionAmount: monthlyRetention.reduce((sum, value) => sum + value, 0),
  };
}

function renderConstructionSCurveChart(metrics, distribution) {
  if (typeof Chart === 'undefined') return;
  const canvas = $('curvaS-chart');
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (state.curvaSChart) state.curvaSChart.destroy();

  const labels = Array.from({ length: distribution.monthlyCosts.length }, (_, index) => `Mes ${index + 1}`);
  state.curvaSChart = new Chart(context, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'EDPP neto',
          data: distribution.monthlyEdppNet,
          backgroundColor: '#93c5fd',
          borderColor: '#2563eb',
          borderWidth: 1,
          borderRadius: 5,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'EDPP bruto',
          data: distribution.monthlyCosts,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,.12)',
          tension: 0.28,
          pointRadius: 2,
          pointHoverRadius: 4,
          borderDash: [6, 4],
          fill: false,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'Avance acumulado',
          data: distribution.cumulativePct,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,.16)',
          fill: true,
          tension: 0.32,
          pointRadius: 2,
          pointHoverRadius: 4,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#334155',
            usePointStyle: true,
            boxWidth: 10,
            padding: 16,
            font: {
              size: 11,
              weight: '600',
            },
          },
        },
        tooltip: {
          callbacks: {
            label(context) {
              return context.dataset.yAxisID === 'y1'
                ? `${context.dataset.label}: ${fmtPct(context.parsed.y)}`
                : `${context.dataset.label}: ${fmtUf(context.parsed.y)}`;
            },
            afterBody(items) {
              if (!items?.length || items[0].dataset?.yAxisID === 'y1') return [];
              const index = items[0].dataIndex;
              return [
                `Descuento anticipo: ${fmtUf(distribution.monthlyAnticipoRecovery[index])}`,
                `Retención: ${fmtUf(distribution.monthlyRetention[index])}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#64748b', maxRotation: 0, autoSkip: true },
          grid: { color: 'rgba(148,163,184,.12)' },
        },
        y: {
          position: 'left',
          ticks: {
            color: '#64748b',
            callback(value) { return fmtNumber(value); },
          },
          grid: { color: 'rgba(148,163,184,.14)' },
        },
        y1: {
          position: 'right',
          min: 0,
          max: 100,
          ticks: {
            color: '#16a34a',
            callback(value) { return `${fmtNumber(value)}%`; },
          },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

function getFinancingSourceRows(sourceType) {
  const category = ensureCostosState().find((item) => item.nombre === 'GASTOS FINANCIEROS');
  const matcher = sourceType === 'terreno' ? /^Terreno/i : /^Construccion/i;
  return (category?.partidas || [])
    .map((partida, index) => ({ ...partida, _costIndex: index }))
    .filter((partida) => matcher.test(partida.nombre || ''));
}

function renderFinancingSourcePlanilla(sourceType) {
  const prefix = sourceType === 'terreno' ? 'terreno-fin-planilla' : 'constr-fin-planilla';
  if (!$(`${prefix}-head`) || !$(`${prefix}-tbody`) || !$(`${prefix}-tfoot`)) return;

  const monthLabels = getCostMonthLabels();
  const monthCount = getCostMonthCount();
  const rows = getFinancingSourceRows(sourceType);
  const monthlyTotals = createMonthlyArray(monthCount, 0);
  let totalNeto = 0;
  let totalIva = 0;

  setHtml(`${prefix}-head`, `
    <tr>
      <th style="min-width:220px;text-align:left">Subpartida</th>
      <th style="width:126px;text-align:center">Ver formula</th>
      <th style="min-width:120px;text-align:center">Plan de pago</th>
      <th style="min-width:110px">Total neto</th>
      <th style="width:64px">IVA</th>
      ${monthLabels.map((label) => `<th data-month-col>${escapeHtml(label)}</th>`).join('')}
    </tr>
  `);

  setHtml(`${prefix}-tbody`, rows.map((partida) => {
    const total = toNumber(partida.total_neto);
    const distribucion = normalizeDistribution(partida.distribucion_mensual, total, partida.plan_pago);
    totalNeto += total;
    totalIva += partida.tiene_iva ? total * 0.19 : 0;
    distribucion.forEach((value, index) => { monthlyTotals[index] += value; });

    return `
      <tr class="partida-row">
        <td>
          <input class="inp" data-field="nombre" value="${escapeHtml(partida.nombre || '')}" disabled>
          <input class="inp cost-hidden-formula" data-field="formula" value="${escapeHtml(getPartidaFormulaText(partida))}">
        </td>
        <td style="text-align:center">
          <button class="btn-outline btn-formula" type="button" onclick="openCostFormulaModal('GASTOS FINANCIEROS', ${partida._costIndex})">Ver fórmula</button>
        </td>
        <td><div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><button class="btn-outline" type="button" onclick="openPaymentPlanModal('GASTOS FINANCIEROS', ${partida._costIndex})">${escapeHtml(summarizePaymentPlan(partida.plan_pago))}</button><div style="font-size:10px;color:${Math.abs(getPaymentPlanAssignedPct(partida.plan_pago) - 100) < 0.01 ? '#16a34a' : '#b45309'};white-space:nowrap">${fmtPct(getPaymentPlanAssignedPct(partida.plan_pago))}</div></div></td>
        <td data-month-cell style="text-align:center;color:#22c55e;font-weight:800">${fmtTableAmount(total, { kind: 'cost' })}</td>
        <td style="text-align:center">${partida.tiene_iva ? '<span class="badge badge-blue">SI</span>' : '<span class="badge">NO</span>'}</td>
        ${distribucion.map((value) => `<td data-month-cell style="text-align:center">${fmtTableAmount(value, { kind: 'cost' })}</td>`).join('')}
      </tr>
    `;
  }).join('') || `
    <tr>
      <td colspan="${5 + monthCount}" style="text-align:center;color:#94a3b8;padding:14px">Sin gastos financieros ${sourceType === 'terreno' ? 'de terreno' : 'de construcción'} para mostrar.</td>
    </tr>
  `);

  setHtml(`${prefix}-tfoot`, `
    <tr class="tfoot-dark">
      <td colspan="3">Totales</td>
      <td>${fmtTableAmount(totalNeto, { kind: 'cost', total: true })}</td>
      <td>${fmtTableAmount(totalIva, { kind: 'cost', total: true })}</td>
      ${monthlyTotals.map((value) => `<td>${fmtTableAmount(value, { kind: 'cost', total: true })}</td>`).join('')}
    </tr>
  `);
}

function onTerrainFinancialInputChange() {
  const category = ensureCostosState().find((item) => item.nombre === 'GASTOS FINANCIEROS');
  if (!category) return;

  document.querySelectorAll('[data-terreno-fin-row]').forEach((row) => {
    const index = toNumber(row.dataset.costIndex);
    const target = category.partidas?.[index];
    if (!target) return;

    const formula = parseFormulaInput(row.querySelector('[data-field="formula"]')?.value);
    target.formula_tipo = formula.formula_tipo;
    target.formula_valor = formula.formula_valor;
    target.formula_referencia = formula.formula_referencia;
    target.tiene_iva = !!row.querySelector('[data-field="tiene_iva"]')?.checked;
    target.total_neto = toNumber(row.querySelector('[data-field="total_neto"]')?.value);
    target.distribucion_mensual = Array.from(row.querySelectorAll('[data-month]')).map((input) => toNumber(input.value));
    target.auto_origen = false;
    target.editable_source = 'terreno';
  });

  renderTerrainModule();
  renderCostosModule();
  scheduleAutosave('terreno');
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
  const hito = getConstructionMilestone();
  return hito ? toNumber(hito.inicio) : 1;
}

function getConstructionMilestone() {
  return state.gantt.find((row) => String(row.nombre || '').trim().toLowerCase() === 'construcción')
    || state.gantt.find((row) => String(row.nombre || '').trim().toLowerCase() === 'construccion')
    || state.gantt.find((row) => /CONSTRUCCI[ÓO]N/i.test(row.nombre || ''))
    || null;
}

function syncConstructionMilestone(duration = toNumber(state.construccion?.plazo_meses || 1)) {
  const targetDuration = Math.max(1, toNumber(duration));
  const rows = Array.isArray(state.gantt) ? state.gantt.map((row) => ({ ...row })) : [];
  const index = rows.findIndex((row) => /CONSTRUCCI[ÓO]N/i.test(String(row.nombre || '').trim()));
  if (index >= 0) {
    rows[index].nombre = 'Construcción';
    rows[index].duracion = targetDuration;
    rows[index].fin = toNumber(rows[index].inicio) + targetDuration;
  } else {
    rows.push({
      id: '',
      nombre: 'Construcción',
      color: '#16a34a',
      dependencia: null,
      dependencia_tipo: 'fin',
      desfase: 0,
      inicio: 1,
      duracion: targetDuration,
      fin: 1 + targetDuration,
    });
  }
  state.gantt = normalizeGanttRows(rows);
}

function getTerrainMilestone() {
  return state.gantt.find((row) => String(row.nombre || '').trim().toLowerCase() === 'compra terreno')
    || state.gantt.find((row) => /ADQUISICION DE TERRENO|COMPRA DE TERRENO|TERRENO/i.test(row.nombre || ''))
    || null;
}

function getTerrainBaseCost() {
  const explicitTotal = toNumber(state.proyecto?.terreno_precio_total);
  if (explicitTotal > 0) return explicitTotal;
  return (state.costos.find((category) => category.nombre === 'TERRENO')?.partidas || [])
    .reduce((sum, partida) => sum + (partida.es_terreno ? toNumber(partida.total_neto) : 0), 0);
}

function getTerrainPurchaseMetrics(project = state.proyecto) {
  const normalized = normalizeProject(project);
  const bruto = toNumber(normalized.terreno_m2_bruto);
  const afectacion = Math.max(0, toNumber(normalized.terreno_m2_afectacion));
  const neto = Math.max(0, bruto - afectacion);
  const precioUfM2 = toNumber(normalized.terreno_precio_uf_m2);
  const precioTotal = neto * precioUfM2;
  return {
    bruto,
    afectacion,
    neto,
    precioUfM2,
    precioTotal,
  };
}

function syncTerrainPurchaseMilestone() {
  const purchaseBlockName = 'Compra terreno';
  const aliases = /^(Compra terreno|Adquisicion de Terreno|Compra de Terreno)$/i;
  const currentRows = Array.isArray(state.gantt) ? state.gantt.map((row) => ({ ...row })) : [];
  const index = currentRows.findIndex((row) => aliases.test(String(row.nombre || '').trim()));
  const previousName = index >= 0 ? currentRows[index].nombre : null;
  const baseRow = index >= 0 ? currentRows[index] : {};

  const milestone = {
    id: baseRow.id || '',
    nombre: purchaseBlockName,
    color: baseRow.color || '#6366f1',
    dependencia: null,
    dependencia_tipo: baseRow.dependencia_tipo || 'fin',
    desfase: 0,
    inicio: 0,
    duracion: 1,
    fin: 1,
  };

  if (index >= 0) currentRows[index] = milestone;
  else currentRows.unshift(milestone);

  if (previousName && previousName !== purchaseBlockName) {
    currentRows.forEach((row) => {
      if (row.dependencia === previousName) row.dependencia = purchaseBlockName;
    });
    state.ventasCronograma = (state.ventasCronograma || []).map((row) => (
      row.vinculo_gantt === previousName
        ? { ...row, vinculo_gantt: purchaseBlockName }
        : row
    ));
  }

  state.gantt = normalizeGanttRows(currentRows);
  return milestone;
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
  let normalized = String(expression);
  getCostFormulaCatalog().forEach(({ label, value, token }) => {
    const bracketToken = `[${label}]`;
    normalized = normalized.replace(new RegExp(bracketToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), String(toNumber(value)));
    normalized = normalized.replace(new RegExp(String(token ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), String(toNumber(value)));
  });
  normalized = normalized
    .toLowerCase()
    .replace(/cantidad de meses de construcci[oó]n/g, 'meses_construccion')
    .replace(/meses de construcci[oó]n/g, 'meses_construccion')
    .replace(/meses preventa/g, 'meses_preventa')
    .replace(/meses venta/g, 'meses_venta')
    .replace(/meses escrituracion/g, 'meses_escrituracion')
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

function getProjectFinalMonth() {
  const ganttEnd = state.gantt.reduce((max, row) => Math.max(max, toNumber(row.fin), toNumber(row.inicio) + toNumber(row.duracion)), 0);
  const ventasEnd = state.ventasCronograma.reduce((max, row) => Math.max(max, toNumber(row.mes_inicio) + toNumber(row.duracion)), 0);
  const constructionEnd = getConstructionStartMonth() + getConstructionDuration();
  return Math.max(12, ganttEnd, ventasEnd, constructionEnd);
}

function getCostMonthCount() {
  return Math.max(13, Math.ceil(getProjectFinalMonth()) + 1);
}

function createMonthlyArray(length = getCostMonthCount(), fill = 0) {
  return Array.from({ length }, () => fill);
}

function getCostMonthLabels() {
  const baseDate = getCostStartDate();
  return Array.from({ length: getCostMonthCount() }, (_, index) => formatCostMonthLabel(addMonths(baseDate, index)));
}

function getCostStartDate() {
  const reference = state.proyecto?.compra_terreno_fecha || state.proyecto?.created_at || state.proyecto?.updated_at || new Date().toISOString();
  const date = new Date(reference);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function addMonths(date, monthsToAdd) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + monthsToAdd);
  return next;
}

function formatCostMonthLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = new Intl.DateTimeFormat('es-CL', { month: 'short' }).format(date).replace('.', '').toLowerCase();
  const year = new Intl.DateTimeFormat('es-CL', { year: '2-digit' }).format(date);
  return `${month}-${year}`;
}

function getGanttReferenceMonth(refName, mode = 'inicio') {
  const exact = state.gantt.find((row) => String(row.nombre || '').trim().toLowerCase() === String(refName || '').trim().toLowerCase());
  const partial = state.gantt.find((row) => String(row.nombre || '').toLowerCase().includes(String(refName || '').trim().toLowerCase()));
  const match = exact || partial;
  if (!match) return 0;
  return mode === 'fin' ? toNumber(match.fin) : toNumber(match.inicio);
}

function placeMonthlyValue(months, monthIndex, amount) {
  if (!amount) return;
  const target = Math.max(0, Math.min(months.length - 1, Math.round(monthIndex)));
  months[target] += amount;
}

function distributeEvenly(months, amount, startMonth, duration) {
  const safeDuration = Math.max(1, Math.round(duration));
  const share = amount / safeDuration;
  Array.from({ length: safeDuration }, (_, offset) => {
    placeMonthlyValue(months, toNumber(startMonth) + offset, share);
  });
}

function buildDistributionFromPlan(planText, total) {
  const months = createMonthlyArray();
  const rawPlan = String(planText || '').trim();
  if (!rawPlan || !total) return null;

  const segments = rawPlan.split(/[;\n]+/).map((segment) => segment.trim()).filter(Boolean);
  let lastTouchedMonth = 0;

  segments.forEach((segment) => {
    const match = segment.match(/^(\d+(?:[.,]\d+)?)%\s*@\s*(.+)$/i);
    if (!match) return;

    const pct = toNumber(match[1].replace(',', '.'));
    const instruction = match[2].trim();
    const amount = total * pct / 100;

    if (/^inicio$/i.test(instruction)) {
      placeMonthlyValue(months, 0, amount);
      lastTouchedMonth = 0;
      return;
    }

    if (/^fin$/i.test(instruction)) {
      lastTouchedMonth = months.length - 1;
      placeMonthlyValue(months, lastTouchedMonth, amount);
      return;
    }

    const spreadMatch = instruction.match(/^meses\(\s*(\d+)\s*(?:,\s*(\d+))?\s*\)$/i);
    if (spreadMatch) {
      const duration = toNumber(spreadMatch[1]);
      const startMonth = spreadMatch[2] != null ? toNumber(spreadMatch[2]) : 0;
      distributeEvenly(months, amount, startMonth, duration);
      lastTouchedMonth = startMonth + Math.max(0, duration - 1);
      return;
    }

    const tramoMatch = instruction.match(/^tramo\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    if (tramoMatch) {
      const startMonth = toNumber(tramoMatch[1]);
      const endMonth = toNumber(tramoMatch[2]);
      distributeEvenly(months, amount, startMonth, Math.max(1, endMonth - startMonth + 1));
      lastTouchedMonth = endMonth;
      return;
    }

    const hitoMatch = instruction.match(/^hito\(\s*([^,]+)\s*,\s*(inicio|fin)\s*\)$/i);
    if (hitoMatch) {
      const refMonth = getGanttReferenceMonth(hitoMatch[1], hitoMatch[2].toLowerCase());
      placeMonthlyValue(months, refMonth, amount);
      lastTouchedMonth = refMonth;
    }
  });

  if (!months.some((value) => value !== 0)) return null;

  const delta = total - months.reduce((sum, value) => sum + value, 0);
  if (Math.abs(delta) > 0.0001) {
    placeMonthlyValue(months, lastTouchedMonth, delta);
  }
  return months;
}

function normalizeDistribution(distribucion, total, planPago = '') {
  const fromInteractivePlan = buildDistributionFromInteractivePlan(planPago, total);
  if (fromInteractivePlan) return fromInteractivePlan;
  const fromPlan = buildDistributionFromPlan(planPago, total);
  if (fromPlan) return fromPlan;

  const months = createMonthlyArray().map((_, index) => toNumber(distribucion?.[index]));
  const sum = months.reduce((acc, value) => acc + value, 0);
  if (!sum && total) {
    months[0] = total;
  }
  return months;
}

function buildFinancialCostRows(manualRows = []) {
  const monthCount = getCostMonthCount();
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

  const defaults = [
    { nombre: 'Terreno · Linea aprobada', editable_source: 'terreno', formula_display: 'extraido financiamiento terreno', total_neto: terrenoAprobado, distribucion_mensual: [terrenoAprobado] },
    { nombre: 'Terreno · Interes', editable_source: 'terreno', formula_display: 'extraido financiamiento terreno', total_neto: terrenoInteres, distribucion_mensual: [0, terrenoInteres] },
    { nombre: 'Terreno · Pago de linea', editable_source: 'terreno', formula_display: 'extraido pago de linea terreno', total_neto: terrenoAprobado, distribucion_mensual: Array.from({ length: 13 }, (_, index) => index === Math.min(12, terrainTermMonths) ? terrenoAprobado : 0) },
    { nombre: 'Construccion · Linea aprobada', editable_source: 'construccion', formula_display: 'extraido linea construccion', total_neto: construccionAprobada, distribucion_mensual: [0, ...Array.from({ length: 12 }, (_, index) => index < constructionMonths ? construccionAprobada / constructionMonths : 0)] },
    { nombre: 'Construccion · Interes', editable_source: 'construccion', formula_display: 'extraido linea construccion', total_neto: construccionInteres, distribucion_mensual: [0, ...Array.from({ length: 12 }, (_, index) => index < constructionMonths ? construccionInteres / constructionMonths : 0)] },
    { nombre: 'Construccion · Impuesto de timbre', editable_source: 'construccion', formula_display: 'extraido linea construccion', total_neto: impuestoTimbre, distribucion_mensual: [impuestoTimbre] },
    { nombre: 'Construccion · Alzamiento', editable_source: 'construccion', formula_display: 'extraido linea construccion', total_neto: alzamiento, distribucion_mensual: Array.from({ length: 13 }, (_, index) => index === Math.min(12, constructionMonths) ? alzamiento : 0) },
    { nombre: 'Construccion · Pago de linea', editable_source: 'construccion', formula_display: 'extraido linea construccion', total_neto: construccionAprobada, distribucion_mensual: Array.from({ length: 13 }, (_, index) => index === Math.min(12, constructionMonths) ? construccionAprobada : 0) },
  ];

  const defaultKeys = new Set(defaults.map((row) => String(row.nombre || '').trim().toLowerCase()));
  const overrideMap = new Map(
    manualRows
      .filter((row) => defaultKeys.has(String(row.nombre || '').trim().toLowerCase()))
      .map((row) => [String(row.nombre || '').trim().toLowerCase(), row])
  );

  const autoRows = defaults.map((row, index) => ({
    id: `auto-fin-${index}`,
    formula_tipo: 'calculado',
    tiene_iva: false,
    es_terreno: false,
    auto_origen: true,
    ...row,
    ...(overrideMap.get(String(row.nombre || '').trim().toLowerCase()) || {}),
  }));

  const adjustedRows = autoRows.map((row) => {
    const distribucion = createMonthlyArray(monthCount, 0);
    const isTerreno = /Terreno/i.test(row.nombre || '');
    const isInteres = /Interes/i.test(row.nombre || '');
    const isPagoLinea = /Pago de linea/i.test(row.nombre || '');
    const isLineaAprobada = /Linea aprobada/i.test(row.nombre || '');
    const isTimbre = /timbre/i.test(row.nombre || '');
    const isAlzamiento = /Alzamiento/i.test(row.nombre || '');

    if (isTerreno && isLineaAprobada) distribucion[0] = toNumber(row.total_neto);
    if (isTerreno && isInteres) distribucion[Math.min(monthCount - 1, 1)] = toNumber(row.total_neto);
    if (isTerreno && isPagoLinea) distribucion[Math.min(monthCount - 1, terrainTermMonths)] = toNumber(row.total_neto);
    if (!isTerreno && isLineaAprobada) {
      Array.from({ length: constructionMonths }, (_, offset) => {
        const month = Math.min(monthCount - 1, offset + 1);
        distribucion[month] += toNumber(row.total_neto) / constructionMonths;
      });
    }
    if (!isTerreno && isInteres) {
      Array.from({ length: constructionMonths }, (_, offset) => {
        const month = Math.min(monthCount - 1, offset + 1);
        distribucion[month] += toNumber(row.total_neto) / constructionMonths;
      });
    }
    if (isTimbre) distribucion[0] = toNumber(row.total_neto);
    if (isAlzamiento || (!isTerreno && isPagoLinea)) distribucion[Math.min(monthCount - 1, constructionMonths)] = toNumber(row.total_neto);

    return {
      ...row,
      distribucion_mensual: distribucion,
    };
  });

  const remainingManualRows = manualRows
    .filter((row) => !defaultKeys.has(String(row.nombre || '').trim().toLowerCase()))
    .map((row) => ({ ...row, auto_origen: false }));

  return adjustedRows.concat(remainingManualRows);
}

function ensureCostosState() {
  const byCategory = new Map(COST_CATEGORY_ORDER.map((name) => [name, { id: '', nombre: name, partidas: [] }]));
  (state.costos || []).forEach((category) => {
    (category.partidas || []).forEach((partida) => {
      const target = mapLegacyCategoryName(category.nombre, partida.nombre);
      const current = byCategory.get(target);
      current.partidas.push({
        ...partida,
        plan_pago: partida.plan_pago || '',
        distribucion_mensual: Array.isArray(partida.distribucion_mensual) ? partida.distribucion_mensual : [],
      });
    });
  });

  state.costos = COST_CATEGORY_ORDER.map((name) => {
    const category = byCategory.get(name);
    const manualRows = (category.partidas || []).filter((row) => !row.auto_origen && row.nombre);
    return {
      ...category,
      nombre: name,
      partidas: name === 'GASTOS FINANCIEROS'
        ? buildFinancialCostRows(manualRows.filter((row) => !(
          /^(Terreno|Construccion)/i.test(row.nombre || '')
          && /(Linea aprobada|Interes|Pago de linea|Impuesto de timbre|Alzamiento)/i.test(row.nombre || '')
        )))
        : manualRows,
    };
  });

  return state.costos;
}

function renderCostFlow(monthlyTotals) {
  const labels = getCostMonthLabels();
  const total = monthlyTotals.reduce((sum, value) => sum + value, 0);
  const mode = state.costosUi?.costFlowMode || 'both';
  const cumulativeValues = monthlyTotals.reduce((acc, value, index) => {
    acc.push((acc[index - 1] || 0) + toNumber(value));
    return acc;
  }, []);

  setHtml('flujoEgresos-legend', '');
  const monthlyBtn = $('cost-flow-monthly-btn');
  const cumulativeBtn = $('cost-flow-cumulative-btn');
  const bothBtn = $('cost-flow-both-btn');
  [
    { button: monthlyBtn, active: mode === 'monthly' },
    { button: cumulativeBtn, active: mode === 'cumulative' },
    { button: bothBtn, active: mode === 'both' },
  ].forEach(({ button, active }) => {
    if (!button) return;
    button.style.background = active ? '#fee2e2' : '#fff';
    button.style.color = active ? '#991b1b' : '#475569';
    button.style.borderColor = active ? '#fca5a5' : '#e2e8f0';
  });

  if (typeof Chart === 'undefined') return;
  const canvas = $('flujoEgresos-chart');
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (state.costFlowChart) state.costFlowChart.destroy();
  const datasets = [];

  if (mode === 'monthly' || mode === 'both') {
    datasets.push({
      type: 'bar',
      label: 'Egresos mensuales',
      data: monthlyTotals,
      backgroundColor: '#fca5a5',
      borderColor: '#dc2626',
      borderWidth: 1,
      borderRadius: 4,
      order: 2,
    });
  }

  if (mode === 'cumulative' || mode === 'both') {
    datasets.push({
      type: 'line',
      label: 'Egresos acumulados',
      data: cumulativeValues,
      borderColor: '#2563eb',
      backgroundColor: '#2563eb',
      borderWidth: 3,
      pointRadius: 0,
      pointHoverRadius: 0,
      tension: 0.25,
      fill: false,
      yAxisID: 'y',
      order: 1,
    });
  }

  state.costFlowChart = new Chart(context, {
    type: 'bar',
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: {
          callbacks: {
            label(contextTooltip) {
              const rawValue = toNumber(contextTooltip.raw);
              const monthValue = toNumber(monthlyTotals[contextTooltip.dataIndex]);
              const pct = total ? (monthValue / total) * 100 : 0;
              return contextTooltip.dataset.type === 'line'
                ? `Acumulado ${fmtUf(rawValue)} | Mes ${fmtUf(monthValue)} | ${fmtPct(pct)}`
                : `Mes ${fmtUf(rawValue)} | ${fmtPct(pct)}`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true },
      },
    },
  });
}

function renderCostPlanilla() {
  const categorias = ensureCostosState();
  const context = buildCostContext();
  const monthCount = getCostMonthCount();
  const monthLabels = getCostMonthLabels();
  const monthlyTotals = createMonthlyArray(monthCount, 0);
  const collapsedState = state.costosUi?.collapsed || {};
  let totalNeto = 0;
  let totalIva = 0;

  renderCostFormulaOptions();

  setHtml('planilla-head', `
    <tr>
      <th style="width:60px"></th>
      <th style="min-width:220px;text-align:left">Subpartida</th>
      <th style="width:126px;text-align:center">Ver formula</th>
      <th style="min-width:170px;text-align:left">Plan de pago</th>
      <th style="min-width:110px">Total neto</th>
      <th style="width:64px">IVA</th>
      ${monthLabels.map((label) => `<th data-month-col>${escapeHtml(label)}</th>`).join('')}
    </tr>
  `);

  setHtml('planilla-tbody', categorias.map((categoria) => {
    const isCollapsed = !!collapsedState[categoria.nombre];
    const hasSubpartidas = (categoria.partidas || []).length > 0;
    const categoryReadOnly = categoria.nombre === 'GASTOS FINANCIEROS';
    const categoryRows = [];
    const categoryMonthlyTotals = createMonthlyArray(monthCount, 0);
    let categoryTotalNeto = 0;
    let categoryTotalIva = 0;

    (categoria.partidas || []).forEach((partida, index) => {
      const rowReadOnly = categoryReadOnly || !!partida.auto_origen;
      const planEditable = !rowReadOnly || !!partida.editable_source;

      if (categoria.nombre === 'GASTOS FINANCIEROS' && partida.auto_origen) {
        const sectionLabel = /^Terreno/i.test(partida.nombre || '')
          ? 'Financiamiento Terreno'
          : /^Construccion/i.test(partida.nombre || '')
            ? 'Financiamiento Construcción'
            : '';
        const previous = (categoria.partidas || [])[index - 1];
        const previousLabel = previous && /^Terreno/i.test(previous.nombre || '')
          ? 'Financiamiento Terreno'
          : previous && /^Construccion/i.test(previous.nombre || '')
            ? 'Financiamiento Construcción'
            : '';

        if (sectionLabel && sectionLabel !== previousLabel) {
          categoryRows.push(`
            <tr class="subcat-row">
              <td colspan="${6 + monthCount}">${escapeHtml(sectionLabel)}</td>
            </tr>
          `);
        }
      }

      const total = evaluateCostPartida(partida, context);
      const distribucion = normalizeDistribution(partida.distribucion_mensual, total, partida.plan_pago);
      partida.total_neto = total;
      partida.distribucion_mensual = distribucion;
      totalNeto += total;
      totalIva += partida.tiene_iva ? total * 0.19 : 0;
      categoryTotalNeto += total;
      categoryTotalIva += partida.tiene_iva ? total * 0.19 : 0;
      distribucion.forEach((value, monthIndex) => { monthlyTotals[monthIndex] += value; });
      distribucion.forEach((value, monthIndex) => { categoryMonthlyTotals[monthIndex] += value; });

      categoryRows.push(`
        <tr class="partida-row" data-cost-row data-category="${escapeHtml(categoria.nombre)}" data-index="${index}" ${rowReadOnly ? 'data-auto="1" data-readonly="1"' : 'draggable="true" ondragstart="startCostDrag(event)" ondragover="allowCostDrop(event)" ondrop="dropCostRow(event)" ondragend="endCostDrag(event)"'}>
          <td style="text-align:center">${rowReadOnly ? '' : `<span class="row-tools"><button class="btn-outline btn-delete-inline" type="button" title="Eliminar subpartida" onclick="removeCostPartida('${escapeHtml(categoria.nombre)}', ${index})">&times;</button><span class="drag-handle" title="Orden manual">&#8226;&#8226;&#8226;</span></span>`}</td>
          <td><input class="inp" data-field="nombre" value="${escapeHtml(partida.nombre || '')}" ${rowReadOnly ? 'disabled' : ''}/></td>
          <td style="text-align:center">
            <input class="inp cost-hidden-formula" data-field="formula" value="${escapeHtml(getPartidaFormulaText(partida))}" ${rowReadOnly ? 'disabled' : ''}/>
            <button class="btn-outline btn-formula" type="button" onclick="openCostFormulaModal('${escapeHtml(categoria.nombre)}', ${index})">Ver fórmula</button>
          </td>
          <td>${planEditable ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><button class="btn-outline" type="button" onclick="openPaymentPlanModal('${escapeHtml(categoria.nombre)}', ${index})">${escapeHtml(summarizePaymentPlan(partida.plan_pago))}</button><div style="font-size:10px;color:${Math.abs(getPaymentPlanAssignedPct(partida.plan_pago) - 100) < 0.01 ? '#16a34a' : '#b45309'};white-space:nowrap">${fmtPct(getPaymentPlanAssignedPct(partida.plan_pago))}</div></div>` : '<span class="badge badge-yellow">AUTO</span>'}</td>
          <td style="text-align:center;color:#22c55e;font-weight:800">${fmtTableAmount(total, { kind: 'cost' })}</td>
          <td style="text-align:center"><input type="checkbox" data-field="tiene_iva" ${partida.tiene_iva ? 'checked' : ''} ${rowReadOnly ? 'disabled' : ''}/></td>
          ${distribucion.map((value) => `<td data-month-cell style="text-align:center">${fmtTableAmount(value, { kind: 'cost' })}</td>`).join('')}
        </tr>
      `);
    });

    return `
      <tr class="cat-row">
        <td colspan="4" style="padding:10px">
          <div class="cost-category-header">
            <div class="cost-category-title">
              <button class="btn-outline btn-plus" type="button" onclick="${hasSubpartidas ? `toggleCostCategoryCollapse('${escapeHtml(categoria.nombre)}')` : ''}" title="${hasSubpartidas ? 'Expandir o colapsar' : 'Sin subpartidas'}" ${hasSubpartidas ? '' : 'disabled style="opacity:.45;cursor:not-allowed"'}>${hasSubpartidas ? (isCollapsed ? '+' : '-') : '·'}</button>
              <span class="cost-category-name">${escapeHtml(categoria.nombre)}</span>
              ${categoryReadOnly ? '' : `<button class="btn-outline btn-subpartida" type="button" onclick="agregarPartidaLinea('${escapeHtml(categoria.nombre)}')" title="Agregar subpartida">+</button>`}
            </div>
            <div class="cost-category-actions">
            </div>
          </div>
        </td>
        <td class="cat-total-cell"><strong>${fmtTableAmount(categoryTotalNeto, { kind: 'cost', total: true })}</strong></td>
        <td class="cat-total-cell"><strong>${fmtTableAmount(categoryTotalIva, { kind: 'cost', total: true })}</strong></td>
        ${categoryMonthlyTotals.map((value) => `<td class="cat-total-cell"><strong>${fmtTableAmount(value, { kind: 'cost', total: true })}</strong></td>`).join('')}
      </tr>
      ${isCollapsed ? '' : categoryRows.join('')}
    `;
  }).join(''));

  setHtml('planilla-tfoot', `
    <tr class="tfoot-dark">
      <td colspan="4">Totales</td>
      <td>${fmtTableAmount(totalNeto, { kind: 'cost', total: true })}</td>
      <td>${fmtTableAmount(totalIva, { kind: 'cost', total: true })}</td>
      ${monthlyTotals.map((value) => `<td>${fmtTableAmount(value, { kind: 'cost', total: true })}</td>`).join('')}
    </tr>
  `);

  renderCostFlow(monthlyTotals);
}

function renderCostosModule() {
  ensureCostosState();
  renderCostPlanilla();
  renderCostStructure();
}

function getCostFormulaCatalog() {
  const context = buildCostContext();
  const mesesPreventa = Math.max(0, ...state.ventasCronograma.filter((row) => row.tipo === 'preventa').map((row) => toNumber(row.duracion)));
  const mesesVenta = Math.max(0, ...state.ventasCronograma.filter((row) => row.tipo === 'venta').map((row) => toNumber(row.duracion)));
  const mesesEscrituracion = Math.max(0, ...state.ventasCronograma.filter((row) => row.tipo === 'escrituracion').map((row) => toNumber(row.duracion)));
  return [
    { label: 'tiempo construccion', token: '_tiempo_construccion', value: context.meses_construccion },
    { label: 'meses construccion', token: '_meses_construccion', value: context.meses_construccion },
    { label: 'meses preventa', token: '_meses_preventa', value: mesesPreventa },
    { label: 'meses venta', token: '_meses_venta', value: mesesVenta },
    { label: 'meses escrituracion', token: '_meses_escrituracion', value: mesesEscrituracion },
    { label: 'm2 utiles', token: '_m2_utiles', value: context.m2_utiles },
    { label: 'm2 municipales', token: '_m2_municipales', value: context.m2_municipales },
    { label: 'm2 sobre cota 0', token: '_m2_sobre_cota_0', value: context.m2_sobre_cota_0 },
    { label: 'm2 subterraneo', token: '_m2_subterraneo', value: context.m2_subterraneo },
    { label: 'm2 losa total', token: '_m2_losa_total', value: context.m2_losa_total },
    { label: 'm2 vendible deptos', token: '_m2_vendible_deptos', value: context.m2_vendible_deptos },
    { label: 'total construccion', token: '_total_construccion', value: context.total_construccion },
    { label: 'total terreno', token: '_total_terreno', value: context.total_terreno },
    { label: 'ventas brutas', token: '_ventas_brutas', value: context.ventas_brutas },
    ...COST_CATEGORY_ORDER.map((name) => ({
      label: `total categoria ${name.toLowerCase()}`,
      token: `_total_categoria_${String(name).toLowerCase().replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}`,
      value: ((state.costos.find((item) => item.nombre === name)?.partidas || []).reduce((sum, partida) => sum + toNumber(partida.total_neto), 0)),
    })),
    ...state.gantt.flatMap((row) => ([
      {
        label: `inicio ${String(row.nombre || '').toLowerCase()}`,
        token: `_inicio_${String(row.nombre || '').toLowerCase().replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}`,
        value: toNumber(row.inicio),
      },
      {
        label: `fin ${String(row.nombre || '').toLowerCase()}`,
        token: `_fin_${String(row.nombre || '').toLowerCase().replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}`,
        value: toNumber(row.fin),
      },
      {
        label: `duracion ${String(row.nombre || '').toLowerCase()}`,
        token: `_duracion_${String(row.nombre || '').toLowerCase().replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}`,
        value: toNumber(row.duracion),
      },
    ])),
  ];
}

function splitFormulaTokens(rawValue) {
  const parts = String(rawValue || '').match(/\[[^\]]+\]|_[a-z0-9_]+|\d+(?:[.,]\d+)?|[()+\-*/]|[^\s]+/gi);
  return Array.isArray(parts) ? parts.slice(0, 40) : [];
}

function findFormulaCatalogEntry(token) {
  const normalizedToken = String(token || '').trim().toLowerCase();
  return getCostFormulaCatalog().find(({ label, token: catalogToken }) => (
    String(catalogToken || '').toLowerCase() === normalizedToken
    || `[${String(label || '').toLowerCase()}]` === normalizedToken
  ));
}

function renderFormulaToken(token, isAuto = false) {
  const value = String(token || '').trim();
  if (!value) return '';
  if (isAuto) return `<span class="formula-token auto">${escapeHtml(value.replace(/^_+/, ''))}</span>`;
  if (/^[()+\-*/]$/.test(value)) {
    const operatorLabel = value === '*' ? 'x' : value;
    return `<span class="formula-token operator">${escapeHtml(operatorLabel)}</span>`;
  }

  const match = findFormulaCatalogEntry(value);
  if (match) {
    return `<span class="formula-token reference" title="${escapeHtml(`${match.label} = ${fmtNumber(match.value, 2)}`)}">${escapeHtml(value.replace(/^_+/, ''))}</span>`;
  }
  if (/^[0-9.,]+$/.test(value)) return `<span class="formula-token number">${escapeHtml(value)}</span>`;
  return `<span class="formula-token">${escapeHtml(value.replace(/^_+/, ''))}</span>`;
}

function renderCostFormulaPreviewContent(rawValue, formulaType = 'expr', isAuto = false) {
  const value = String(rawValue || '').trim();
  const tokens = splitFormulaTokens(value);
  const expression = value
    ? tokens.map((token) => renderFormulaToken(token, isAuto)).join('')
    : '<span class="formula-token placeholder">Sin formula</span>';

  const statusClass = isAuto
    ? 'formula-status formula-status-auto'
    : formulaType === 'manual'
      ? 'formula-status formula-status-manual'
      : 'formula-status formula-status-expr';
  const statusText = isAuto
    ? 'Automatico'
    : formulaType === 'manual'
      ? 'Manual'
      : 'Formula';
  const note = isAuto
    ? 'Origen calculado automaticamente por el modelo.'
    : formulaType === 'manual'
      ? 'Monto fijo editable para esta subpartida.'
      : 'Expresion editable con referencias y operadores del modelo.';

  return `
    <div class="formula-preview-head">
      <span class="formula-preview-title">Vista de formula</span>
      <span class="${statusClass}">${statusText}</span>
    </div>
    <div class="formula-preview-expression">${expression}</div>
    <div class="formula-preview-note">${escapeHtml(note)}</div>
  `;
}

function updateCostFormulaPreview(input) {
  const cell = input?.closest('.formula-cell');
  const preview = cell?.querySelector('[data-formula-preview]');
  if (!preview) return;
  const rawValue = input.value || '';
  const parsed = parseFormulaInput(rawValue);
  preview.innerHTML = renderCostFormulaPreviewContent(rawValue, parsed.formula_tipo, false);
}

function updateCostFormulaModalPreview() {
  const input = $('cost-formula-modal-input');
  const preview = $('cost-formula-modal-preview');
  if (!input || !preview) return;
  const isAuto = !!input.dataset.auto;
  const rawValue = input.value || '';
  const parsed = parseFormulaInput(rawValue);
  preview.innerHTML = renderCostFormulaPreviewContent(
    rawValue,
    isAuto ? 'expr' : parsed.formula_tipo,
    isAuto
  );
}

function renderCostFormulaOptions() {
  setHtml('cost-formula-refs', getCostFormulaCatalog().map(({ label, token, value }) => (
    `<option value="${escapeHtml(token)}">${escapeHtml(label)} (${fmtNumber(value, 2)})</option>`
  )).join(''));
}

function toggleCostCategoryCollapse(categoryName) {
  state.costosUi.collapsed[categoryName] = !state.costosUi.collapsed[categoryName];
  renderCostosModule();
}

function setCostFlowMode(mode) {
  state.costosUi.costFlowMode = ['monthly', 'cumulative', 'both'].includes(mode) ? mode : 'both';
  renderCostosModule();
}

function scrollTableById(containerId, offset) {
  const container = $(containerId);
  if (!container) return;
  container.scrollBy({ left: offset, behavior: 'smooth' });
}

function scrollCostPlanilla(offset) {
  scrollTableById('cost-planilla-scroll', offset);
}

function scrollFinancialPlanilla(containerId, offset) {
  scrollTableById(containerId, offset);
}

function openCostFormulaModal(categoryName, index) {
  readCostosEditor();
  const category = state.costos.find((item) => item.nombre === categoryName);
  const partida = category?.partidas?.[index];
  if (!partida) return;

  state.costosUi.activeFormulaCategory = categoryName;
  state.costosUi.activeFormulaIndex = index;

  const input = $('cost-formula-modal-input');
  const title = $('cost-formula-title');
  const subtitle = $('cost-formula-subtitle');
  const saveBtn = $('cost-formula-save-btn');
  if (!input || !title || !subtitle || !saveBtn) return;

  const formulaText = getPartidaFormulaText(partida);
  input.value = formulaText;
  const readOnlyAuto = !!partida.auto_origen && !partida.editable_source;
  input.dataset.auto = readOnlyAuto ? '1' : '';
  input.disabled = readOnlyAuto;
  title.textContent = `Ver fórmula · ${partida.nombre || 'Subpartida'}`;
  subtitle.textContent = readOnlyAuto
    ? 'Fórmula calculada automáticamente para esta subpartida.'
    : 'Edita la fórmula sin ocupar espacio en la tabla principal.';
  saveBtn.style.display = readOnlyAuto ? 'none' : 'inline-flex';
  updateCostFormulaModalPreview();
  $('cost-formula-modal').style.display = 'flex';
}

function closeCostFormulaModal() {
  state.costosUi.activeFormulaCategory = null;
  state.costosUi.activeFormulaIndex = null;
  const input = $('cost-formula-modal-input');
  if (input) {
    input.value = '';
    input.disabled = false;
    delete input.dataset.auto;
  }
  $('cost-formula-modal').style.display = 'none';
}

function saveCostFormulaModal() {
  const categoryName = state.costosUi.activeFormulaCategory;
  const index = state.costosUi.activeFormulaIndex;
  const input = $('cost-formula-modal-input');
  if (!categoryName || index == null || !input) return;
  const category = state.costos.find((item) => item.nombre === categoryName);
  const partida = category?.partidas?.[index];
  if (!partida) return;
  const formula = parseFormulaInput(input.value || '');
  partida.formula_tipo = formula.formula_tipo;
  partida.formula_valor = formula.formula_valor;
  partida.formula_referencia = formula.formula_referencia;
  if (partida.editable_source === 'terreno') partida.auto_origen = false;
  closeCostFormulaModal();
  if (partida.editable_source === 'terreno') renderTerrainModule();
  renderCostosModule();
  scheduleAutosave(partida.editable_source === 'terreno' ? 'terreno' : 'costos');
}

function autosaveCostFormulaModal() {
  const categoryName = state.costosUi.activeFormulaCategory;
  const index = state.costosUi.activeFormulaIndex;
  const input = $('cost-formula-modal-input');
  if (!categoryName || index == null || !input) return;
  const category = state.costos.find((item) => item.nombre === categoryName);
  const partida = category?.partidas?.[index];
  if (!partida) return;
  const formula = parseFormulaInput(input.value || '');
  partida.formula_tipo = formula.formula_tipo;
  partida.formula_valor = formula.formula_valor;
  partida.formula_referencia = formula.formula_referencia;
  if (partida.editable_source === 'terreno') partida.auto_origen = false;
  scheduleAutosave(partida.editable_source === 'terreno' ? 'terreno' : 'costos');
}

function insertCostFormulaReference(input, token) {
  if (!input || !token) return;
  const value = input.value || '';
  const match = value.match(/_[a-z0-9_]*$/i);
  input.value = match ? `${value.slice(0, match.index)}${token}` : `${value}${token}`;
  input.focus();
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderCostFormulaSuggestions(input, query = '') {
  const panel = input?.closest('.formula-cell')?.querySelector('.formula-suggest');
  if (!panel) return;
  const normalizedQuery = String(query || '').toLowerCase().replace(/^_/, '');
  const options = getCostFormulaCatalog().filter(({ label, token }) => (
    !normalizedQuery
    || label.toLowerCase().includes(normalizedQuery)
    || token.toLowerCase().includes(`_${normalizedQuery}`)
  )).slice(0, 12);

  if (!options.length) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }

  panel.innerHTML = options.map(({ label, token, value }) => (
    `<button type="button" onmousedown="event.preventDefault(); pickCostFormulaSuggestion(this)" data-token="${escapeHtml(token)}" data-input-id="${escapeHtml(input.id)}">${escapeHtml(token)}<small>${escapeHtml(label)} | ${fmtNumber(value, 2)}</small></button>`
  )).join('');
  panel.style.display = 'block';
}

function handleCostFormulaInput(input) {
  if (!input.id) input.id = `cost-formula-${Math.random().toString(36).slice(2, 9)}`;
  state.costosUi.formulaInputId = input.id;
  const match = String(input.value || '').match(/_([a-z0-9_]*)$/i);
  if (!match) {
    renderCostFormulaSuggestions(input, '');
    const panel = input.closest('.formula-cell')?.querySelector('.formula-suggest');
    if (panel) panel.style.display = 'none';
    return;
  }
  renderCostFormulaSuggestions(input, match[0]);
}

function hideCostFormulaSuggestionsLater() {
  window.setTimeout(() => {
    document.querySelectorAll('.formula-suggest').forEach((panel) => { panel.style.display = 'none'; });
  }, 120);
}

function pickCostFormulaSuggestion(button) {
  const input = $(button.dataset.inputId);
  if (!input) return;
  insertCostFormulaReference(input, button.dataset.token);
  if (input.id === 'cost-formula-modal-input') updateCostFormulaModalPreview();
  hideCostFormulaSuggestionsLater();
}

function getPaymentReferenceOptions() {
  return [
    { value: 'MANUAL_0', label: 'Manual (M0)' },
    ...state.gantt.flatMap((row) => ([
      { value: `START:${row.id || row.nombre}`, label: `Inicio: ${row.nombre}` },
      { value: `END:${row.id || row.nombre}`, label: `Fin: ${row.nombre}` },
    ])),
  ];
}

function parseInteractivePaymentPlan(rawValue) {
  if (!rawValue) return { tramos: [], hitos: [] };
  try {
    const parsed = JSON.parse(rawValue);
    return {
      tramos: Array.isArray(parsed.tramos) ? parsed.tramos : [],
      hitos: Array.isArray(parsed.hitos) ? parsed.hitos : [],
    };
  } catch {
    return { tramos: [], hitos: [] };
  }
}

function serializeInteractivePaymentPlan(plan) {
  return JSON.stringify({
    tramos: plan.tramos || [],
    hitos: plan.hitos || [],
  });
}

function summarizePaymentPlan(rawValue) {
  const plan = parseInteractivePaymentPlan(rawValue);
  if (!plan.tramos.length && !plan.hitos.length) return 'Configurar';
  return `${plan.tramos.length} tramo(s) | ${plan.hitos.length} hito(s)`;
}

function getPaymentPlanAssignedPct(rawValue) {
  const plan = parseInteractivePaymentPlan(rawValue);
  return plan.tramos.reduce((sum, item) => sum + toNumber(item.pct), 0)
    + plan.hitos.reduce((sum, item) => sum + toNumber(item.pct), 0);
}

function resolvePaymentReference(refValue, offset = 0) {
  if (!refValue || refValue === 'MANUAL_0') return Math.max(0, toNumber(offset));
  const [kind, rawKey] = String(refValue).split(':');
  const match = state.gantt.find((row) => String(row.id || row.nombre) === rawKey);
  if (!match) return Math.max(0, toNumber(offset));
  return Math.max(0, (kind === 'END' ? toNumber(match.fin) : toNumber(match.inicio)) + toNumber(offset));
}

function buildDistributionFromInteractivePlan(rawValue, total) {
  if (!rawValue || !total) return null;
  const plan = parseInteractivePaymentPlan(rawValue);
  if (!plan.tramos.length && !plan.hitos.length) return null;
  const months = createMonthlyArray();

  plan.tramos.forEach((tramo) => {
    const amount = total * toNumber(tramo.pct) / 100;
    const startMonth = resolvePaymentReference(tramo.inicio_ref, tramo.inicio_offset);
    const endMonth = resolvePaymentReference(tramo.fin_ref, tramo.fin_offset);
    distributeEvenly(months, amount, startMonth, Math.max(1, endMonth - startMonth + 1));
  });

  plan.hitos.forEach((hito) => {
    const amount = total * toNumber(hito.pct) / 100;
    placeMonthlyValue(months, resolvePaymentReference(hito.ref, hito.offset), amount);
  });

  return months;
}

function openPaymentPlanModal(categoryName, index) {
  readCostosEditor();
  const category = state.costos.find((item) => item.nombre === categoryName);
  const partida = category?.partidas?.[index];
  if (!partida) return;
  state.costosUi.activePaymentCategory = categoryName;
  state.costosUi.activePaymentIndex = index;
  const plan = parseInteractivePaymentPlan(partida.plan_pago);
  const refs = getPaymentReferenceOptions();

  setText('payment-plan-title', `Configurar pagos: ${partida.nombre}`);
  setText('payment-plan-total', fmtUf(evaluateCostPartida(partida, buildCostContext())));
  setText('payment-plan-assigned', `${fmtPct(getPaymentPlanAssignedPct(partida.plan_pago))}`);
  setText('payment-plan-assigned-card', `${fmtPct(getPaymentPlanAssignedPct(partida.plan_pago))}`);
  setText('payment-plan-counts', `${plan.tramos.length} tramo(s) · ${plan.hitos.length} hito(s)`);

  const renderRefOptions = (selectedValue) => refs.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === selectedValue ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('');

  setHtml('payment-plan-tramos', plan.tramos.map((tramo, idx) => `
    <div class="payment-line" data-tramo-index="${idx}" style="display:grid;grid-template-columns:100px 1fr 90px 1fr 90px 40px;gap:8px;margin-bottom:10px">
      <input class="inp" data-field="pct" type="number" step="0.01" value="${toNumber(tramo.pct)}" placeholder="%"/>
      <select class="inp" data-field="inicio_ref">${renderRefOptions(tramo.inicio_ref || 'MANUAL_0')}</select>
      <input class="inp" data-field="inicio_offset" type="number" value="${toNumber(tramo.inicio_offset)}" placeholder="Meses"/>
      <select class="inp" data-field="fin_ref">${renderRefOptions(tramo.fin_ref || 'MANUAL_0')}</select>
      <input class="inp" data-field="fin_offset" type="number" value="${toNumber(tramo.fin_offset)}" placeholder="Meses"/>
      <button class="btn-outline btn-plus" type="button" onclick="removePaymentPlanItem('tramo', ${idx})">&times;</button>
    </div>
  `).join('') || '<div style="font-size:11px;color:#94a3b8">Sin tramos mensuales.</div>');

  setHtml('payment-plan-hitos', plan.hitos.map((hito, idx) => `
    <div class="payment-line" data-hito-index="${idx}" style="display:grid;grid-template-columns:100px 1fr 90px 40px;gap:8px;margin-bottom:10px">
      <input class="inp" data-field="pct" type="number" step="0.01" value="${toNumber(hito.pct)}" placeholder="%"/>
      <select class="inp" data-field="ref">${renderRefOptions(hito.ref || 'MANUAL_0')}</select>
      <input class="inp" data-field="offset" type="number" value="${toNumber(hito.offset)}" placeholder="Meses"/>
      <button class="btn-outline btn-plus" type="button" onclick="removePaymentPlanItem('hito', ${idx})">&times;</button>
    </div>
  `).join('') || '<div style="font-size:11px;color:#94a3b8">Sin pagos por hito.</div>');

  $('payment-plan-modal').style.display = 'flex';
}

function closePaymentPlanModal() {
  $('payment-plan-modal').style.display = 'none';
}

function addPaymentPlanItem(type) {
  const category = state.costos.find((item) => item.nombre === state.costosUi.activePaymentCategory);
  const partida = category?.partidas?.[state.costosUi.activePaymentIndex];
  if (!partida) return;
  const plan = parseInteractivePaymentPlan(partida.plan_pago);
  if (type === 'tramo') plan.tramos.push({ pct: 0, inicio_ref: 'MANUAL_0', inicio_offset: 0, fin_ref: 'MANUAL_0', fin_offset: 0 });
  if (type === 'hito') plan.hitos.push({ pct: 0, ref: 'MANUAL_0', offset: 0 });
  partida.plan_pago = serializeInteractivePaymentPlan(plan);
  if (partida.editable_source === 'terreno') partida.auto_origen = false;
  openPaymentPlanModal(state.costosUi.activePaymentCategory, state.costosUi.activePaymentIndex);
  scheduleAutosave(partida.editable_source === 'terreno' ? 'terreno' : 'costos');
}

function removePaymentPlanItem(type, index) {
  const category = state.costos.find((item) => item.nombre === state.costosUi.activePaymentCategory);
  const partida = category?.partidas?.[state.costosUi.activePaymentIndex];
  if (!partida) return;
  const plan = parseInteractivePaymentPlan(partida.plan_pago);
  if (type === 'tramo') plan.tramos.splice(index, 1);
  if (type === 'hito') plan.hitos.splice(index, 1);
  partida.plan_pago = serializeInteractivePaymentPlan(plan);
  if (partida.editable_source === 'terreno') partida.auto_origen = false;
  openPaymentPlanModal(state.costosUi.activePaymentCategory, state.costosUi.activePaymentIndex);
  scheduleAutosave(partida.editable_source === 'terreno' ? 'terreno' : 'costos');
}

function savePaymentPlanModal() {
  const category = state.costos.find((item) => item.nombre === state.costosUi.activePaymentCategory);
  const partida = category?.partidas?.[state.costosUi.activePaymentIndex];
  if (!partida) return;

  const tramos = Array.from(document.querySelectorAll('#payment-plan-tramos .payment-line')).map((row) => ({
    pct: toNumber(row.querySelector('[data-field="pct"]')?.value),
    inicio_ref: row.querySelector('[data-field="inicio_ref"]')?.value || 'MANUAL_0',
    inicio_offset: toNumber(row.querySelector('[data-field="inicio_offset"]')?.value),
    fin_ref: row.querySelector('[data-field="fin_ref"]')?.value || 'MANUAL_0',
    fin_offset: toNumber(row.querySelector('[data-field="fin_offset"]')?.value),
  }));

  const hitos = Array.from(document.querySelectorAll('#payment-plan-hitos .payment-line')).map((row) => ({
    pct: toNumber(row.querySelector('[data-field="pct"]')?.value),
    ref: row.querySelector('[data-field="ref"]')?.value || 'MANUAL_0',
    offset: toNumber(row.querySelector('[data-field="offset"]')?.value),
  }));

  partida.plan_pago = serializeInteractivePaymentPlan({ tramos, hitos });
  if (partida.editable_source === 'terreno') partida.auto_origen = false;
  closePaymentPlanModal();
  if (partida.editable_source === 'terreno') renderTerrainModule();
  renderCostosModule();
  scheduleAutosave(partida.editable_source === 'terreno' ? 'terreno' : 'costos');
}

function autosavePaymentPlanModal() {
  const category = state.costos.find((item) => item.nombre === state.costosUi.activePaymentCategory);
  const partida = category?.partidas?.[state.costosUi.activePaymentIndex];
  if (!partida) return;

  const tramos = Array.from(document.querySelectorAll('#payment-plan-tramos .payment-line')).map((row) => ({
    pct: toNumber(row.querySelector('[data-field="pct"]')?.value),
    inicio_ref: row.querySelector('[data-field="inicio_ref"]')?.value || 'MANUAL_0',
    inicio_offset: toNumber(row.querySelector('[data-field="inicio_offset"]')?.value),
    fin_ref: row.querySelector('[data-field="fin_ref"]')?.value || 'MANUAL_0',
    fin_offset: toNumber(row.querySelector('[data-field="fin_offset"]')?.value),
  }));

  const hitos = Array.from(document.querySelectorAll('#payment-plan-hitos .payment-line')).map((row) => ({
    pct: toNumber(row.querySelector('[data-field="pct"]')?.value),
    ref: row.querySelector('[data-field="ref"]')?.value || 'MANUAL_0',
    offset: toNumber(row.querySelector('[data-field="offset"]')?.value),
  }));

  partida.plan_pago = serializeInteractivePaymentPlan({ tramos, hitos });
  if (partida.editable_source === 'terreno') partida.auto_origen = false;
  scheduleAutosave(partida.editable_source === 'terreno' ? 'terreno' : 'costos');
}

function removeCostPartida(categoryName, index) {
  if (categoryName === 'GASTOS FINANCIEROS') return;
  readCostosEditor();
  const category = state.costos.find((item) => item.nombre === categoryName);
  if (!category) return;
  category.partidas.splice(index, 1);
  renderCostosModule();
  scheduleAutosave('costos');
}

function renderProjectHeader() {
  setText('proj-title', state.proyecto?.nombre || 'Proyecto');
  setText('proj-dir', state.proyecto?.direccion || 'Sin direccion');
  renderSyncStatus();
}

function renderKpis() {
  setText('kpi-ventas', fmtUf(state.calculos.ventas_brutas));
  setText('kpi-margen', fmtUf(state.calculos.margen_neto));
  setText('kpi-margen-pct', `${fmtPct(state.calculos.margen_pct)} s/ventas`);

  const deudaMax = toNumber(state.calculos.costos_netos) * ((toNumber(state.financiamiento.credito_terreno_pct) + toNumber(state.financiamiento.linea_construccion_pct)) / 200);
  const intereses = toNumber(state.calculos.costos_netos) * ((toNumber(state.financiamiento.credito_terreno_tasa) + toNumber(state.financiamiento.linea_construccion_tasa)) / 200);

  setText('fin-deuda-max', fmtUf(deudaMax));
  setText('fin-deuda-mes', 'Estimacion inicial');
  setText('fin-intereses', fmtUf(intereses));
  setText('cap-req', fmtUf(Math.max(0, toNumber(state.calculos.costos_netos) - deudaMax)));
  setText('cap-margen', fmtUf(state.calculos.margen_neto));
}

function renderAll() {
  syncConstructionMilestone(state.construccion?.plazo_meses || 1);
  renderProjectSelector();
  renderProjectHeader();
  renderCabidaTables(state.cabida);
  renderCabidaEditor(state.cabida);
  renderTerrainModule();
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
    compra_terreno_fecha: state.proyecto?.compra_terreno_fecha || '',
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

function readTerrenoProjectSettingsFromEditor() {
  const terrenoM2Bruto = toNumber($('terreno-m2-bruto')?.value);
  const terrenoM2Afectacion = toNumber($('terreno-m2-afectacion')?.value);
  const terrenoM2Neto = Math.max(0, terrenoM2Bruto - terrenoM2Afectacion);
  const terrenoPrecioUfM2 = toNumber($('terreno-precio-uf-m2')?.value);
  const terrenoPrecioTotal = terrenoM2Neto * terrenoPrecioUfM2;
  return {
    ...state.proyecto,
    compra_terreno_fecha: fromMonthInputValue($('terreno-fecha-compra')?.value || ''),
    terreno_m2_bruto: terrenoM2Bruto,
    terreno_m2_bruto_afecto: terrenoM2Bruto,
    terreno_m2_afectacion: terrenoM2Afectacion,
    terreno_m2_neto: terrenoM2Neto,
    terreno_precio_uf_m2: terrenoPrecioUfM2,
    terreno_precio_total: terrenoPrecioTotal,
  };
}

function readTerrenoFinanciamientoFromEditor() {
  return normalizeFinanciamiento({
    ...state.financiamiento,
    credito_terreno_activo: true,
    credito_terreno_pct: toNumber($('fin-terreno-pct')?.value),
    credito_terreno_tasa: toNumber($('fin-terreno-tasa')?.value),
    credito_terreno_pago_intereses: $('fin-terreno-pago-int')?.value || 'Semestral',
  });
}

function readConstruccionFinanciamientoFromEditor() {
  return normalizeFinanciamiento({
    ...state.financiamiento,
    linea_construccion_activo: true,
    linea_construccion_pct: toNumber($('fin-constr-pct')?.value),
    linea_construccion_tasa: toNumber($('fin-constr-tasa')?.value),
    linea_construccion_pago_intereses: $('fin-constr-pago-int')?.value || 'Anual',
    linea_construccion_pago_capital: 'Contra Escrituraciones',
  });
}

function onCabidaInputChange() {
  state.proyecto = normalizeProject(getCabidaProjectSettingsFromEditor());
  state.cabida = getCabidaRowsFromEditor();
  renderCabidaTables(state.cabida);
  renderCabidaEditor(state.cabida);
  renderTerrainModule();
  renderConstruccion();
  ensureVentasState();
  renderVentasModule();
  renderCostosModule();
  scheduleAutosave('cabida');
}

function onTerrenoInputChange() {
  state.proyecto = normalizeProject(readTerrenoProjectSettingsFromEditor());
  state.financiamiento = readTerrenoFinanciamientoFromEditor();
  syncTerrainPurchaseMilestone();
  renderGanttEditor(state.gantt);
  renderTerrainModule();
  renderCostosModule();
  renderKpis();
  scheduleAutosave('terreno');
}

function readConstruccionFromEditor() {
  return normalizeConstruccion({
    ...state.construccion,
    costo_uf_m2_sobre_tierra: toNumber($('constr-uf-st')?.value),
    pct_bajo_tierra_sobre_cota_0: toNumber($('constr-pct-bt')?.value),
    costo_uf_m2_bajo_tierra: toNumber($('constr-uf-bt')?.value),
    plazo_meses: Math.max(1, toNumber($('constr-plazo-meses')?.value || getConstructionDuration())),
    anticipo_pct: toNumber($('anticipo-slider')?.value),
    retencion_pct: toNumber($('retencion-slider')?.value),
    ancho_curva: state.construccion?.ancho_curva ?? 0.5,
    peak_gasto: state.construccion?.peak_gasto ?? 0.5,
  });
}

function updateConstrParams() {
  state.construccion = readConstruccionFromEditor();
  state.financiamiento = readConstruccionFinanciamientoFromEditor();
  syncConstructionMilestone(state.construccion.plazo_meses);
  renderGanttEditor(state.gantt);
  renderConstruccion();
  renderCostosModule();
  renderKpis();
  scheduleAutosave('construccion');
  scheduleAutosave('gantt');
}

function onGanttInputChange() {
  state.gantt = readGanttEditor();
  renderTerrainModule();
  renderGanttEditor(state.gantt);
  renderConstruccion();
  ensureVentasState();
  renderVentasSchedules();
  renderVentasSummaryCards();
  renderVentasCashflow();
  renderCostosModule();
  scheduleAutosave('gantt');
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
  onGanttInputChange();
}

function moveGanttRow(index, direction) {
  const rows = readGanttEditor();
  const target = index + direction;
  if (target < 0 || target >= rows.length) return;
  const copy = [...rows];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  renderGanttEditor(copy);
  onGanttInputChange();
}

function removeGanttRow(index) {
  const rows = readGanttEditor();
  rows.splice(index, 1);
  renderGanttEditor(rows);
  onGanttInputChange();
}

function startGanttDrag(event) {
  const handle = event.target.closest('[data-gantt-drag]');
  const row = handle?.closest('[data-gantt-row]');
  if (!row) return;
  state.ganttDrag = { index: toNumber(row.dataset.index) };
  row.classList.add('gantt-row-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', row.dataset.index || '0');
}

function allowGanttDrop(event) {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function endGanttDrag(event) {
  event.target.closest('[data-gantt-row]')?.classList.remove('gantt-row-dragging');
}

function dropGanttRow(event) {
  event.preventDefault();
  const targetRow = event.target.closest('[data-gantt-row]');
  if (!targetRow || !state.ganttDrag) return;

  const rows = readGanttEditor();
  const sourceIndex = toNumber(state.ganttDrag.index);
  const targetIndex = toNumber(targetRow.dataset.index);
  document.querySelectorAll('[data-gantt-row]').forEach((row) => row.classList.remove('gantt-row-dragging'));
  state.ganttDrag = null;
  if (sourceIndex === targetIndex || sourceIndex < 0 || targetIndex < 0 || sourceIndex >= rows.length || targetIndex >= rows.length) return;

  const copy = [...rows];
  const [moved] = copy.splice(sourceIndex, 1);
  copy.splice(targetIndex, 0, moved);
  renderGanttEditor(copy);
  onGanttInputChange();
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
  scheduleAutosave('ventas');
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
    if (row.dataset.auto === '1' || row.dataset.readonly === '1') return;
    const category = categoryMap.get(row.dataset.category);
    const index = toNumber(row.dataset.index);
    const target = category?.partidas?.[index];
    if (!target) return;

    const formula = parseFormulaInput(row.querySelector('[data-field="formula"]')?.value);
    target.nombre = row.querySelector('[data-field="nombre"]')?.value?.trim() || 'Nueva subpartida';
    target.formula_tipo = formula.formula_tipo;
    target.formula_valor = formula.formula_valor;
    target.formula_referencia = formula.formula_referencia;
    target.plan_pago = target.plan_pago || '';
    target.tiene_iva = !!row.querySelector('[data-field="tiene_iva"]')?.checked;
    target.es_terreno = !!row.querySelector('[data-field="es_terreno"]')?.checked;
    const monthInputs = Array.from(row.querySelectorAll('[data-month]'));
    if (monthInputs.length) {
      target.distribucion_mensual = monthInputs.map((input) => toNumber(input.value));
    }
  });

  state.costos = categories;
  return categories;
}

function agregarPartidaLinea(categoryName) {
  if (categoryName === 'GASTOS FINANCIEROS') return;
  readCostosEditor();
  ensureCostosState();
  let category = state.costos.find((item) => item.nombre === categoryName);
  if (!category) {
    category = { id: '', nombre: categoryName, partidas: [] };
    state.costos.push(category);
  }
  category.partidas.push({
    id: '',
    nombre: 'Nueva subpartida',
    formula_tipo: 'expr',
    formula_valor: 0,
    formula_referencia: '',
    plan_pago: '',
    tiene_iva: true,
    es_terreno: categoryName === 'TERRENO',
    total_neto: 0,
    distribucion_mensual: createMonthlyArray(),
  });
  renderCostosModule();
  scheduleAutosave('costos');
}

function redistribuirPartida(button) {
  const row = button.closest('[data-cost-row]');
  if (!row) return;
  const formulaText = row.querySelector('[data-field="formula"]')?.value || '';
  const category = state.costos.find((item) => item.nombre === row.dataset.category);
  const partida = category?.partidas?.[toNumber(row.dataset.index)];
  const planText = partida?.plan_pago || '';
  const parsed = parseFormulaInput(formulaText);
  const total = parsed.formula_tipo === 'manual'
    ? toNumber(parsed.formula_valor)
    : evaluateExpressionFormula(parsed.formula_referencia || formulaText, buildCostContext()) || 0;
  const normalized = normalizeDistribution([], total, planText);
  row.querySelectorAll('[data-month]').forEach((input, index) => {
    input.value = toNumber(normalized[index]);
  });
}

function aplicarPlanPagoFila(input) {
  const row = input.closest('[data-cost-row]');
  if (!row) return;
  redistribuirPartida({ closest: () => row });
  readCostosEditor();
  renderCostosModule();
}

function startCostDrag(event) {
  const row = event.target.closest('[data-cost-row]');
  if (!row || row.dataset.auto === '1' || row.dataset.readonly === '1') return;
  state.costDrag = {
    category: row.dataset.category,
    index: toNumber(row.dataset.index),
  };
  row.classList.add('cost-row-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', `${row.dataset.category}:${row.dataset.index}`);
}

function allowCostDrop(event) {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function endCostDrag(event) {
  event.target.closest('[data-cost-row]')?.classList.remove('cost-row-dragging');
}

function dropCostRow(event) {
  event.preventDefault();
  const targetRow = event.target.closest('[data-cost-row]');
  if (!targetRow || !state.costDrag || targetRow.dataset.auto === '1' || targetRow.dataset.readonly === '1') return;
  if (state.costDrag.category !== targetRow.dataset.category) return;

  readCostosEditor();
  const category = state.costos.find((item) => item.nombre === state.costDrag.category);
  if (!category) return;

  const sourceIndex = toNumber(state.costDrag.index);
  const targetIndex = toNumber(targetRow.dataset.index);
  if (sourceIndex === targetIndex) return;

  const copy = [...category.partidas];
  const [moved] = copy.splice(sourceIndex, 1);
  copy.splice(targetIndex, 0, moved);
  category.partidas = copy;
  state.costDrag = null;
  renderCostosModule();
  scheduleAutosave('costos');
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
  state.financiamiento = normalizeFinanciamiento(financiamiento);
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

async function guardarTerreno() {
  if (!state.proyectoId) return;
  const proyecto = readTerrenoProjectSettingsFromEditor();
  const financiamiento = readTerrenoFinanciamientoFromEditor();
  syncTerrainPurchaseMilestone();
  setSyncStatus('saving', 'GUARDANDO', 'Actualizando terreno y financiamiento terreno');
  await Promise.all([
    api(`/api/proyectos/${state.proyectoId}`, {
      method: 'PUT',
      body: JSON.stringify(proyecto),
    }),
    api(`/api/proyectos/${state.proyectoId}/financiamiento`, {
      method: 'POST',
      body: JSON.stringify(financiamiento),
    }),
    api(`/api/proyectos/${state.proyectoId}/gantt`, {
      method: 'POST',
      body: JSON.stringify(state.gantt),
    }),
    api(`/api/proyectos/${state.proyectoId}/ventas/cronograma`, {
      method: 'POST',
      body: JSON.stringify(state.ventasCronograma || []),
    }),
    api(`/api/proyectos/${state.proyectoId}/costos`, {
      method: 'POST',
      body: JSON.stringify(state.costos),
    }),
  ]);
  state.sync.lastSavedAt = new Date().toISOString();
  await loadProject(state.proyectoId);
  await refreshHealthStatus();
}

async function guardarConstruccion() {
  if (!state.proyectoId) return;
  syncConstructionMilestone(toNumber($('constr-plazo-meses')?.value || state.construccion?.plazo_meses || 1));
  const payload = {
    ...readConstruccionFromEditor(),
    sup_sobre_tierra: getConstructionMetrics().sup_sobre_tierra,
    sup_bajo_tierra: getConstructionMetrics().sup_bajo_tierra,
  };
  const financiamiento = readConstruccionFinanciamientoFromEditor();
  setSyncStatus('saving', 'GUARDANDO', 'Actualizando parametros de construccion');
  await Promise.all([
    api(`/api/proyectos/${state.proyectoId}/construccion`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
    api(`/api/proyectos/${state.proyectoId}/gantt`, {
      method: 'POST',
      body: JSON.stringify(state.gantt),
    }),
    api(`/api/proyectos/${state.proyectoId}/financiamiento`, {
      method: 'POST',
      body: JSON.stringify(financiamiento),
    }),
  ]);
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
  onCabidaInputChange();
}

[
  'guardarCapital',
  'toggleEstructura',
  'setCostosView',
  'setDeudaView',
  'setInteresView',
  'setCapTab',
  'exportarExcel',
  'handleFileUpload',
  'calcularCapital',
].forEach((fnName) => {
  window[fnName] = createPendingAction(fnName);
});

window.showTab = showTab;
window.onCabidaInputChange = onCabidaInputChange;
window.onTerrenoInputChange = onTerrenoInputChange;
window.guardarCabida = guardarCabida;
window.guardarTerreno = guardarTerreno;
window.guardarConstruccion = guardarConstruccion;
window.guardarGantt = guardarGantt;
window.guardarVentas = guardarVentas;
window.updateConstrParams = updateConstrParams;
window.guardarCostos = guardarCostos;
window.agregarPartidaLinea = agregarPartidaLinea;
window.redistribuirPartida = redistribuirPartida;
window.aplicarPlanPagoFila = aplicarPlanPagoFila;
window.setCostFlowMode = setCostFlowMode;
window.scrollCostPlanilla = scrollCostPlanilla;
window.scrollFinancialPlanilla = scrollFinancialPlanilla;
window.openCostFormulaModal = openCostFormulaModal;
window.closeCostFormulaModal = closeCostFormulaModal;
window.saveCostFormulaModal = saveCostFormulaModal;
window.toggleCostCategoryCollapse = toggleCostCategoryCollapse;
window.insertCostFormulaReference = insertCostFormulaReference;
window.handleCostFormulaInput = handleCostFormulaInput;
window.updateCostFormulaPreview = updateCostFormulaPreview;
window.updateCostFormulaModalPreview = updateCostFormulaModalPreview;
window.hideCostFormulaSuggestionsLater = hideCostFormulaSuggestionsLater;
window.pickCostFormulaSuggestion = pickCostFormulaSuggestion;
window.openPaymentPlanModal = openPaymentPlanModal;
window.closePaymentPlanModal = closePaymentPlanModal;
window.addPaymentPlanItem = addPaymentPlanItem;
window.removePaymentPlanItem = removePaymentPlanItem;
window.savePaymentPlanModal = savePaymentPlanModal;
window.removeCostPartida = removeCostPartida;
window.startCostDrag = startCostDrag;
window.allowCostDrop = allowCostDrop;
window.dropCostRow = dropCostRow;
window.endCostDrag = endCostDrag;
window.agregarUso = agregarUso;
window.agregarHito = agregarHito;
window.onGanttInputChange = onGanttInputChange;
window.moveGanttRow = moveGanttRow;
window.removeGanttRow = removeGanttRow;
window.startGanttDrag = startGanttDrag;
window.allowGanttDrop = allowGanttDrop;
window.endGanttDrag = endGanttDrag;
window.dropGanttRow = dropGanttRow;
window.onVentasInputChange = onVentasInputChange;

document.addEventListener('DOMContentLoaded', async () => {
  ensureProjectControls();
  ensureActionButtons();
  setupAutosaveListeners();
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


