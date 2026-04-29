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
    dirty: {},
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

function makeClientId(prefix = 'tmp') {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function renderFinanceFixedColumn(prefix, rows = [], options = {}) {
  setHtml(`${prefix}-fixed-head`, `<tr><th style="text-align:left">Concepto</th></tr>`);
  setHtml(`${prefix}-fixed-tbody`, rows.map((row) => `
    <tr class="${row.bold ? 'finance-total-row' : ''}">
      <td style="text-align:left;font-weight:${row.bold ? 800 : 600};color:${row.color || '#334155'};background:${row.bg || (row.bold ? '#f4f8fc' : '#fff')}!important;display:flex;align-items:center;justify-content:space-between;gap:4px">
        <span>${escapeHtml(row.label || '')}</span>
        ${row.actionHtml || ''}
      </td>
    </tr>
  `).join(''));
  setHtml(`${prefix}-fixed-tfoot`, options.footerLabel ? `
    <tr class="tfoot-dark"><td>${escapeHtml(options.footerLabel)}</td></tr>
  ` : '');
}

const AUTOSAVE_SCOPE_LABELS = {
  proyecto: 'proyecto',
  cabida: 'cabida',
  terreno: 'terreno',
  construccion: 'construccion',
  gantt: 'carta gantt',
  ventas: 'ventas',
  costos: 'costos del proyecto',
  capital: 'capital',
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

function normalizeFormulaOverrides(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    flow: source.flow && typeof source.flow === 'object' && !Array.isArray(source.flow) ? { ...source.flow } : {},
    ep: source.ep && typeof source.ep === 'object' && !Array.isArray(source.ep) ? { ...source.ep } : {},
    gf: source.gf && typeof source.gf === 'object' && !Array.isArray(source.gf) ? { ...source.gf } : {},
  };
}

function normalizeProject(project = {}) {
  const terrenoM2Bruto = project.terreno_m2_bruto ?? project.terreno_m2_bruto_afecto ?? 0;
  const terrenoM2Afectacion = project.terreno_m2_afectacion
    ?? Math.max(0, toNumber(terrenoM2Bruto) - toNumber(project.terreno_m2_neto ?? terrenoM2Bruto));
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
    tasa_interes_terreno: project.tasa_interes_terreno ?? 3.5,
    tasa_interes_construccion: project.tasa_interes_construccion ?? 3.5,
    pct_timbres: project.pct_timbres ?? 0.8,
    pct_ceec: project.pct_ceec ?? 65,
    pct_impuesto_renta: project.pct_impuesto_renta ?? 27,
    formula_overrides: normalizeFormulaOverrides(project.formula_overrides),
  };
}

function getFormulaOverridesForSave() {
  const getter = window.getPersistedFormulaOverrides;
  return normalizeFormulaOverrides(
    typeof getter === 'function'
      ? getter()
      : (window.__bricsaFormulaPatch?.formulaOverrides || state.proyecto?.formula_overrides || {})
  );
}

function getProjectSavePayload() {
  return normalizeProject({
    ...(state.proyecto || {}),
    formula_overrides: getFormulaOverridesForSave(),
  });
}

function getGlobalFinancialParams() {
  const p = normalizeProject(state.proyecto);
  return {
    tasa_terreno: toNumber(p.tasa_interes_terreno),
    tasa_construccion: toNumber(p.tasa_interes_construccion),
    pct_timbres: toNumber(p.pct_timbres),
    pct_ceec: toNumber(p.pct_ceec),
    pct_impuesto_renta: toNumber(p.pct_impuesto_renta),
  };
}

// ---- IRR (Newton-Raphson) ----
function npv(rate, flows) {
  return flows.reduce((acc, f, i) => acc + toNumber(f) / Math.pow(1 + rate, i), 0);
}
function irr(flows, guess = 0.1) {
  if (!Array.isArray(flows) || flows.length < 2) return 0;
  const hasPos = flows.some((v) => toNumber(v) > 0);
  const hasNeg = flows.some((v) => toNumber(v) < 0);
  if (!hasPos || !hasNeg) return 0;
  let rate = guess;
  for (let k = 0; k < 100; k += 1) {
    let f = 0, df = 0;
    for (let i = 0; i < flows.length; i += 1) {
      const d = Math.pow(1 + rate, i);
      f += toNumber(flows[i]) / d;
      if (i > 0) df += -i * toNumber(flows[i]) / (d * (1 + rate));
    }
    if (!Number.isFinite(f) || !Number.isFinite(df) || Math.abs(df) < 1e-12) break;
    const next = rate - f / df;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-8) { rate = next; break; }
    rate = next;
    if (rate < -0.99) rate = -0.99;
  }
  return Number.isFinite(rate) ? rate : 0;
}
function irrAnualFromMensual(flowsMensuales) {
  const r = irr(flowsMensuales);
  return Math.pow(1 + r, 12) - 1;
}

// ---- Formula tooltip (generic, for any calculated cell) ----
function renderFormulaCell(value, formulaObj, options = {}) {
  // formulaObj: { formula: "A + B", refs: [{label, value, unit}], note: "..." }
  const kind = options.kind || 'neutral';
  const cellStyle = options.style || 'text-align:center';
  const formatted = typeof options.format === 'function'
    ? options.format(value)
    : fmtTableAmount(value, { kind, total: options.total });
  const formulaText = (formulaObj?.formula || '').toString();
  const refs = Array.isArray(formulaObj?.refs) ? formulaObj.refs : [];
  const refsHtml = refs.map((r) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:2px 0"><span style="color:#64748b">${escapeHtml(String(r.label || ''))}</span><strong>${escapeHtml(String(r.value ?? ''))}${r.unit ? ' ' + escapeHtml(String(r.unit)) : ''}</strong></div>`).join('');
  const noteHtml = formulaObj?.note ? `<div style="margin-top:6px;font-size:10px;color:#94a3b8">${escapeHtml(String(formulaObj.note))}</div>` : '';
  const popId = `fpop-${Math.random().toString(36).slice(2, 9)}`;
  return `<td style="${cellStyle};position:relative" class="formula-host">
    <div style="display:inline-flex;align-items:center;gap:4px">
      <span>${formatted}</span>
      <button type="button" class="btn-formula-mini" onclick="toggleFormulaPop('${popId}', event)" title="Ver fórmula" style="background:none;border:1px solid #cbd5e1;color:#3b82f6;border-radius:4px;padding:0 4px;font-size:9px;cursor:pointer;line-height:1.4">ƒx</button>
    </div>
    <div id="${popId}" class="formula-pop" style="display:none;position:absolute;z-index:50;right:0;top:100%;margin-top:4px;background:#0f172a;color:#fff;border-radius:8px;padding:10px 12px;min-width:240px;max-width:340px;text-align:left;box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:11px">
      <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Fórmula</div>
      <div style="font-family:'Courier New',monospace;background:#1e293b;padding:6px 8px;border-radius:6px;margin-bottom:6px;white-space:pre-wrap;word-break:break-word">${escapeHtml(formulaText)}</div>
      ${refsHtml ? `<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Variables</div>${refsHtml}` : ''}
      ${noteHtml}
    </div>
  </td>`;
}

function toggleFormulaPop(id, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  document.querySelectorAll('.formula-pop').forEach((el) => { if (el.id !== id) el.style.display = 'none'; });
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
window.toggleFormulaPop = toggleFormulaPop;
document.addEventListener('click', (e) => {
  if (!e.target.closest('.formula-host')) {
    document.querySelectorAll('.formula-pop').forEach((el) => { el.style.display = 'none'; });
  }
  if (!e.target.closest('#gantt-color-popup') && !e.target.closest('.gantt-color-current')) {
    closeGanttColorPopup();
  }
});
window.addEventListener('resize', closeGanttColorPopup);
window.addEventListener('scroll', closeGanttColorPopup, true);

// ---- IVA / PPM / Impuesto Renta helpers ----
function getMonthlyIvaCredito() {
  const monthCount = getCostMonthCount();
  const monthly = createMonthlyArray(monthCount, 0);
  const context = buildCostContext();
  ensureCostosState().forEach((category) => {
    (category.partidas || []).forEach((partida) => {
      if (!partida.tiene_iva) return;
      if (category.nombre === 'GASTOS FINANCIEROS' && /Linea aprobada|Pago de linea/i.test(partida.nombre || '')) return;
      const dist = getMonthlyDistributionForPartida(partida, monthCount);
      dist.forEach((v, i) => { if (i < monthly.length) monthly[i] += toNumber(v) * 0.19; });
    });
  });
  return monthly;
}

function getMonthlyIvaDebito(monthlyIncome) {
  // IVA débito sobre ventas escrituradas (al momento de la escrituración)
  const monthCount = getCostMonthCount();
  const monthly = createMonthlyArray(monthCount, 0);
  const totals = getTotalSalesMetrics();
  const settings = getGlobalPaymentSettings();
  const piePct = Math.min(100, Math.max(0, settings.pie_promesa_pct));
  const escrituraPct = Math.max(0, 100 - piePct);
  const escrituraUnidad = totals.precioPromedio * escrituraPct / 100;
  const { escrituras } = getPromesasEscrituracionUnidades(monthCount);
  Array.from({ length: monthCount }, (_, m) => {
    const unidades = escrituras[m];
    monthly[m] = unidades * escrituraUnidad * 0.19;
  });
  return monthly;
}

function getMonthlyPPM(monthlyIncome) {
  // PPM = -1% * Ingresos_escrituracion
  const monthCount = getCostMonthCount();
  const monthly = createMonthlyArray(monthCount, 0);
  const totals = getTotalSalesMetrics();
  const settings = getGlobalPaymentSettings();
  const piePct = Math.min(100, Math.max(0, settings.pie_promesa_pct));
  const escrituraPct = Math.max(0, 100 - piePct);
  const escrituraUnidad = totals.precioPromedio * escrituraPct / 100;
  const { escrituras } = getPromesasEscrituracionUnidades(monthCount);
  Array.from({ length: monthCount }, (_, m) => {
    const unidades = escrituras[m];
    const ingresoEscr = unidades * escrituraUnidad;
    // factor IVA: IN = (Ventas + 0.19*Terreno)/1.19
    monthly[m] = -0.01 * (ingresoEscr / 1.19);
  });
  return monthly;
}

function getMonthlyImpuestoRenta(flujoAntesImpuestos, monthlyIncome) {
  // Se paga en abril del año siguiente; tasa configurable
  const monthCount = getCostMonthCount();
  const monthly = createMonthlyArray(monthCount, 0);
  const tasa = getGlobalFinancialParams().pct_impuesto_renta / 100;
  const totalIncome = monthlyIncome.reduce((a, b) => a + toNumber(b), 0);
  const totalFlujo = flujoAntesImpuestos.reduce((a, b) => a + toNumber(b), 0);
  if (totalIncome <= 0 || totalFlujo <= 0) return monthly;
  // Simplificación: distribuir el impuesto proporcional a escrituraciones, con desfase de 12 meses
  const startDate = getCostStartDate();
  const baseYear = startDate.getFullYear();
  // Agrupar ingresos por año calendario
  const anual = {};
  monthlyIncome.forEach((v, i) => {
    const d = addMonths(startDate, i);
    const key = d.getFullYear();
    anual[key] = (anual[key] || 0) + toNumber(v);
  });
  const margen = totalFlujo / totalIncome;
  Object.keys(anual).forEach((yearKey) => {
    const ingresos = anual[yearKey];
    const year = Number(yearKey);
    const tributo = -tasa * ingresos * margen;
    // Pagadero en abril del año siguiente: mes relativo desde startDate
    const payDate = new Date(year + 1, 3, 1); // April (mes index 3)
    const monthIndex = (payDate.getFullYear() - baseYear) * 12 + (payDate.getMonth() - startDate.getMonth());
    if (monthIndex >= 0 && monthIndex < monthCount) monthly[monthIndex] += tributo;
  });
  return monthly;
}

function getMunicipalUsefulPerUnit(interior, terraza, pct = state.proyecto?.terraza_util_pct) {
  return toNumber(interior) + (toNumber(terraza) * toNumber(pct) / 100);
}

function getSellableAreaPerUnit(interior, terraza, pct = state.proyecto?.terraza_util_pct) {
  return getMunicipalUsefulPerUnit(interior, terraza, pct);
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
  const unitRows = getBaseUnitRows();
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
    pct_inicio_construccion: data.pct_inicio_construccion ?? 25,
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
    pct_alzamiento: data.pct_alzamiento ?? 90,
    ...data,
  };
}

function normalizeCapital(data = {}) {
  return {
    ...data,
    caja_minima_buffer: data.caja_minima_buffer ?? 2000,
    proyeccion_meses: data.proyeccion_meses ?? 6,
    llamado_minimo: data.llamado_minimo ?? 5000,
    caja_fuerte_retencion: data.caja_fuerte_retencion ?? 10000,
    devolucion_minima: data.devolucion_minima ?? 3000,
  };
}

function getConstructionDuration() {
  const hito = getConstructionMilestone();
  return hito ? Math.max(1, toNumber(hito.duracion)) : Math.max(1, toNumber(state.construccion?.plazo_meses || 1));
}

function getConstructionMetrics() {
  const source = normalizeConstruccion(state.construccion);
  const supSobreTierra = toNumber(source.sup_sobre_tierra);
  const supBajoTierra = toNumber(source.sup_bajo_tierra);
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
  const reference = state.sync.lastSavedAt || state.proyecto?.updated_at || state.health?.timestamp;
  return reference
    ? `Ultima sincronizacion: ${fmtDateTime(reference)}`
    : 'Ultima sincronizacion: sin registro';
}

function renderSyncStatus() {
  const badge = $('sync-badge');
  const label = $('sync-label');
  const detail = $('sync-detail');
  if (!badge || !label || !detail) return;

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
}

function scheduleAutosave(scope, delay = 900) {
  if (!state.proyectoId || !scope) return;
  window.clearTimeout(state.autosave.timers[scope]);
  state.autosave.timers[scope] = null;
  state.autosave.queued[scope] = true;
  state.autosave.dirty[scope] = true;
  setSyncStatus('saving', 'GUARDANDO', `Cambios pendientes en ${AUTOSAVE_SCOPE_LABELS[scope] || scope}`);
  state.autosave.timers[scope] = window.setTimeout(() => {
    runAutosave(scope);
  }, delay);
}

async function runAutosave(scope) {
  if (!state.proyectoId || !scope) return;
  window.clearTimeout(state.autosave.timers[scope]);
  state.autosave.timers[scope] = null;

  if (state.autosave.inFlight[scope]) {
    state.autosave.queued[scope] = true;
    return;
  }

  const handlers = {
    proyecto: guardarFormulaOverrides,
    cabida: guardarCabida,
    terreno: guardarTerreno,
    construccion: guardarConstruccion,
    gantt: guardarGantt,
    ventas: guardarVentas,
    costos: guardarCostos,
    capital: guardarCapital,
  };
  const handler = handlers[scope];
  if (!handler) return;

  state.autosave.inFlight[scope] = true;
  state.autosave.queued[scope] = false;
  try {
    await handler({ silent: true });
    state.autosave.dirty[scope] = false;
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
window.scheduleAutosave = scheduleAutosave;

function getPendingAutosaveScopes() {
  return Object.keys(AUTOSAVE_SCOPE_LABELS).filter((scope) => (
    state.autosave.queued[scope]
    || state.autosave.dirty[scope]
    || state.autosave.inFlight[scope]
    || state.autosave.timers[scope]
  ));
}

async function flushPendingAutosaves() {
  const scopes = getPendingAutosaveScopes();
  scopes.forEach((scope) => {
    window.clearTimeout(state.autosave.timers[scope]);
    state.autosave.timers[scope] = null;
  });
  for (const scope of scopes) {
    let guard = 0;
    while (state.autosave.inFlight[scope] && guard < 50) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      guard += 1;
    }
    if (state.autosave.queued[scope] || state.autosave.dirty[scope]) await runAutosave(scope);
  }
}

window.addEventListener('beforeunload', (event) => {
  if (!getPendingAutosaveScopes().length) return;
  event.preventDefault();
  event.returnValue = '';
});

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

  const controlsSlot = $('project-controls-slot');
  if (!controlsSlot) return;

  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.alignItems = 'center';
  controls.style.gap = '8px';
  controls.innerHTML = `
    <select id="project-selector" class="inp" style="min-width:220px;max-width:320px"></select>
  `;

  controlsSlot.appendChild(controls);

  $('project-selector').addEventListener('change', async (event) => {
    await flushPendingAutosaves();
    await loadProject(event.target.value);
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
    const vendiblePorUnidad = getSellableAreaPerUnit(row.sup_interior, row.sup_terrazas);
    const utilPorUnidad = getMunicipalUsefulPerUnit(row.sup_interior, row.sup_terrazas);

    acc.unidades += cantidad;
    acc.interior += toNumber(row.sup_interior) * cantidad;
    acc.terrazas += toNumber(row.sup_terrazas) * cantidad;
    acc.util += utilPorUnidad * cantidad;
    acc.vendible += vendiblePorUnidad * cantidad;
    return acc;
  }, {
    unidades: 0,
    interior: 0,
    terrazas: 0,
    util: 0,
    vendible: 0,
  });
}

function renderCabidaTables(rows) {
  const displayRows = getBaseUnitRows();
  const proyecto = normalizeProject(state.proyecto);
  const totals = getCabidaMetrics(displayRows);
  const commonAreaTotal = getCommonAreaTotal();
  const accessoryTotal = toNumber(proyecto.estacionamientos_cantidad) + toNumber(proyecto.bodegas_cantidad);

  // Tabla fusionada (nueva)
  const fusedRows = displayRows.map((row) => {
    const cantidad = toNumber(row.cantidad);
    const utilPorUnidad = getMunicipalUsefulPerUnit(row.sup_interior, row.sup_terrazas);
    const vendiblePorUnidad = getSellableAreaPerUnit(row.sup_interior, row.sup_terrazas);
    const vendibleTotal = vendiblePorUnidad * cantidad;
    return `
      <tr>
        <td>${escapeHtml(row.uso)}</td>
        <td style="text-align:center">${fmtNumber(row.cantidad)}</td>
        <td style="text-align:center">${fmtNumber(row.sup_interior, 1)}</td>
        <td style="text-align:center">${fmtNumber(row.sup_terrazas, 1)}</td>
        <td style="text-align:center">${fmtNumber(utilPorUnidad, 1)}</td>
        <td style="text-align:center;color:#2563eb">${fmtNumber(vendiblePorUnidad, 1)}</td>
        <td style="text-align:center;color:#16a34a;font-weight:700">${fmtNumber(vendibleTotal, 1)}</td>
      </tr>
    `;
  }).join('');

  setHtml('cabida-tabla-tbody', fusedRows);
  setHtml('cabida-tabla-tfoot', `
    <td>Total</td>
    <td style="text-align:center">${fmtNumber(totals.unidades)}</td>
    <td style="text-align:center">${fmtNumber(totals.unidades ? totals.interior / totals.unidades : 0, 1)}</td>
    <td style="text-align:center">${fmtNumber(totals.unidades ? totals.terrazas / totals.unidades : 0, 1)}</td>
    <td style="text-align:center">${fmtNumber(totals.unidades ? totals.util / totals.unidades : 0, 1)}</td>
    <td style="text-align:center;color:#2563eb">${fmtNumber(totals.unidades ? totals.vendible / totals.unidades : 0, 1)}</td>
    <td style="text-align:center;color:#16a34a;font-weight:700">${fmtNumber(totals.vendible, 1)}</td>
  `);

  // Tablas resumen (sin cambios)
  const unitRows = displayRows.map((row) => `
    <tr>
      <td>${escapeHtml(row.uso)}</td>
      <td style="text-align:center">${fmtNumber(row.cantidad)}</td>
      <td style="text-align:center">${fmtNumber(row.sup_interior, 1)}</td>
      <td style="text-align:center">${fmtNumber(row.sup_terrazas, 1)}</td>
      <td style="text-align:center;color:#2563eb">${fmtNumber(getSellableAreaPerUnit(row.sup_interior, row.sup_terrazas), 1)}</td>
    </tr>
  `).join('');

  setHtml('res-cabida-tbody', unitRows);
  setHtml('res-cabida-tfoot', `
    <td>Total</td>
    <td style="text-align:center">${fmtNumber(totals.unidades)}</td>
    <td style="text-align:center">${fmtNumber(totals.unidades ? totals.interior / totals.unidades : 0, 1)}</td>
    <td style="text-align:center">${fmtNumber(totals.unidades ? totals.terrazas / totals.unidades : 0, 1)}</td>
    <td style="text-align:center">${fmtNumber(totals.unidades ? totals.vendible / totals.unidades : 0, 1)}</td>
  `);

  setHtml('res-sup-tbody', displayRows.map((row) => {
    const cantidad = toNumber(row.cantidad);
    const util = getMunicipalUsefulPerUnit(row.sup_interior, row.sup_terrazas) * cantidad;
    const vendible = getSellableAreaPerUnit(row.sup_interior, row.sup_terrazas) * cantidad;
    return `
      <tr>
        <td>${escapeHtml(row.uso)}</td>
        <td style="text-align:center">${fmtNumber(util, 1)} m2</td>
        <td style="text-align:center;color:#2563eb">${fmtNumber(vendible, 1)} m2</td>
      </tr>
    `;
  }).join(''));
  setHtml('res-sup-tfoot', `
    <td>Total</td>
    <td style="text-align:center">${fmtNumber(totals.util, 1)} m2</td>
    <td style="text-align:center">${fmtNumber(totals.vendible, 1)} m2</td>
  `);
  setHtml('res-sup-extra', `
    <tr>
      <td>M2 comunes totales</td>
      <td style="text-align:center">${fmtNumber(commonAreaTotal, 1)} m2</td>
      <td style="text-align:center">-</td>
    </tr>
  `);

  // Estacionamientos y Bodegas (sin Total)
  const accRows = `
    <tr>
      <td>Estacionamientos</td>
      <td style="text-align:center">${fmtNumber(proyecto.estacionamientos_cantidad)}</td>
    </tr>
    <tr>
      <td>Bodegas</td>
      <td style="text-align:center">${fmtNumber(proyecto.bodegas_cantidad)}</td>
    </tr>
  `;
  setHtml('cabida-acc-tbody', accRows);
  setHtml('res-acc-tbody', accRows);
  setHtml('res-acc-tfoot', `<td>Total</td><td style="text-align:center">${fmtNumber(accessoryTotal)}</td>`);

  setText('cabida-vendible-pct', `${fmtNumber(proyecto.terraza_util_pct, 1)}%`);
  setText('res-cabida-vendible-pct', `${fmtNumber(proyecto.terraza_util_pct, 1)}%`);
  setText('cabida-common-total', `${fmtNumber(commonAreaTotal, 1)} m²`);
  setText('res-cabida-common-total', `${fmtNumber(commonAreaTotal, 1)} m2`);
  setText('cabida-util-total', `${fmtNumber(totals.util, 1)} m²`);
  setText('res-cabida-util-total', `${fmtNumber(totals.util, 1)} m2`);
  setText('cabida-vendible-total', `${fmtNumber(totals.vendible, 1)} m²`);
  setText('res-cabida-vendible-total', `${fmtNumber(totals.vendible, 1)} m2`);
}

function renderCabidaEditor(rows) {
  const proyecto = normalizeProject(state.proyecto);
  setHtml('cabida-editor', `
    <div class="card" style="margin-bottom:12px;background:#f8fafc">
      <div class="sec-title" style="font-size:14px">Parametros Generales de Cabida</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
        <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">% terraza considerada en vendible</label><input id="cabida-terraza-util-pct" class="inp" type="number" step="0.01" value="${toNumber(proyecto.terraza_util_pct)}" onchange="onCabidaInputChange()"/></div>
        <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Comunes modo</label><select id="cabida-comunes-tipo" class="inp" onchange="onCabidaInputChange()"><option value="porcentaje" ${proyecto.comunes_tipo === 'porcentaje' ? 'selected' : ''}>% m2 utiles</option><option value="total" ${proyecto.comunes_tipo === 'total' ? 'selected' : ''}>Total m2</option></select></div>
        <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">M2 comunes totales</label><input id="cabida-comunes-valor" class="inp" type="number" step="0.01" value="${toNumber(proyecto.comunes_valor)}" onchange="onCabidaInputChange()"/></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:12px">
      ${rows.map((row, idx) => `
        <div class="card" data-cabida-row>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <label style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase">Tipo</label>
            <button type="button" onclick="eliminarUso(${idx})" style="background:none;border:1px solid #fecaca;color:#b91c1c;border-radius:6px;padding:2px 8px;font-size:11px;cursor:pointer;line-height:1.5">× Eliminar</button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="grid-column:1 / -1">
              <label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Nombre del tipo</label>
              <input class="inp" data-field="uso" value="${escapeHtml(row.uso)}" onchange="onCabidaInputChange()"/>
            </div>
            <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Cantidad</label><input class="inp" type="number" data-field="cantidad" value="${toNumber(row.cantidad)}" onchange="onCabidaInputChange()"/></div>
            <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">M² interior</label><input class="inp" type="number" step="0.01" data-field="sup_interior" value="${toNumber(row.sup_interior)}" onchange="onCabidaInputChange()"/></div>
            <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">M² terraza</label><input class="inp" type="number" step="0.01" data-field="sup_terrazas" value="${toNumber(row.sup_terrazas)}" onchange="onCabidaInputChange()"/></div>
            <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">M² vendible</label><input class="inp" type="text" value="${fmtNumber(getSellableAreaPerUnit(row.sup_interior, row.sup_terrazas), 2)}" disabled/></div>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="card" style="background:#f8fafc">
      <div class="sec-title" style="font-size:14px">Estacionamientos y Bodegas</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">
        <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Numero de estacionamientos</label><input id="cabida-estacionamientos-cantidad" class="inp" type="number" value="${toNumber(proyecto.estacionamientos_cantidad)}" onchange="onCabidaInputChange()"/></div>
        <div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:6px">Numero de bodegas</label><input id="cabida-bodegas-cantidad" class="inp" type="number" value="${toNumber(proyecto.bodegas_cantidad)}" onchange="onCabidaInputChange()"/></div>
      </div>
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

const GANTT_CANONICAL_NAME_RULES = [
  { canonical: 'Compra terreno', pattern: /^(Compra terreno|Adquisicion de Terreno|Adquisición de Terreno|Compra de Terreno)$/i },
  { canonical: 'Construcción', pattern: /^Construcci[óo]n$/i },
  { canonical: 'Aprobaci\u00f3n PE', pattern: /^(Aprobaci(?:o|\u00f3)n(?: del)? Proyecto(?: de)? Edificaci(?:o|\u00f3)n|Aprobaci(?:o|\u00f3)n(?:\s+del)?\s+Pro(?:yecto)?(?:\s+de)?(?:\s+Edificaci(?:o|\u00f3)n)?|Aprobaci(?:o|\u00f3)n\s*P\.?\s*E\.?|Aprobaci(?:o|\u00f3)n\s*PE|Permiso(?: de)? Edificaci(?:o|\u00f3)n)$/i },
  { canonical: 'Promesas', pattern: /^(Promesas|Inicio promesas)$/i },
  { canonical: 'Postventa', pattern: /^Postventa$/i },
  { canonical: 'Recepción municipal', pattern: /^Recepci[óo]n municipal$/i },
  { canonical: 'Escrituración', pattern: /^Escrituraci[óo]n$/i },
];

const GANTT_PRESET_COLORS = [
  '#2563eb', '#22c55e', '#f97316', '#a855f7', '#0ea5e9',
  '#e11d48', '#14b8a6', '#f59e0b', '#8b5cf6', '#64748b',
];

function canonicalizeGanttName(name) {
  const raw = String(name || '').trim();
  if (!raw) return raw;
  const rule = GANTT_CANONICAL_NAME_RULES.find((item) => item.pattern.test(raw));
  return rule ? rule.canonical : raw;
}

const UNIQUE_GANTT_MILESTONES = new Set(GANTT_CANONICAL_NAME_RULES.map((item) => item.canonical));

function normalizeGanttColor(color) {
  const raw = String(color || '').trim().toLowerCase();
  if (GANTT_PRESET_COLORS.includes(raw)) return raw;
  return GANTT_PRESET_COLORS[0];
}

function getGanttColorOptions(selectedColor) {
  const selected = normalizeGanttColor(selectedColor);
  return GANTT_PRESET_COLORS.map((color, index) => `
    <option value="${color}" ${color === selected ? 'selected' : ''}>Color ${index + 1}</option>
  `).join('');
}

function getGanttColorSwatches(selectedColor) {
  const selected = normalizeGanttColor(selectedColor);
  return `
    <input type="hidden" data-field="color" value="${selected}"/>
    <button
      type="button"
      class="gantt-color-current"
      style="background:${selected}"
      title="Elegir color"
      onclick="onGanttColorButtonClick(this, event)"
    ></button>
  `;
}

let activeGanttColorButton = null;

function closeGanttColorPopup() {
  document.getElementById('gantt-color-popup')?.remove();
  if (activeGanttColorButton) activeGanttColorButton.setAttribute('aria-expanded', 'false');
  activeGanttColorButton = null;
}

function positionGanttColorPopup(popup, trigger) {
  if (!popup || !trigger) return;
  const rect = trigger.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  const margin = 8;
  const left = Math.min(
    window.innerWidth - popupRect.width - margin,
    Math.max(margin, rect.left + (rect.width / 2) - (popupRect.width / 2))
  );
  const spaceBelow = window.innerHeight - rect.bottom;
  const top = spaceBelow >= popupRect.height + margin
    ? rect.bottom + margin
    : Math.max(margin, rect.top - popupRect.height - margin);
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

function onGanttColorButtonClick(button, event) {
  event?.stopPropagation();
  if (activeGanttColorButton === button && document.getElementById('gantt-color-popup')) {
    closeGanttColorPopup();
    return;
  }
  closeGanttColorPopup();
  activeGanttColorButton = button;
  button.setAttribute('aria-expanded', 'true');
  const selected = normalizeGanttColor(button.closest('.gantt-name-wrap')?.querySelector('[data-field="color"]')?.value);
  const popup = document.createElement('div');
  popup.id = 'gantt-color-popup';
  popup.className = 'gantt-color-popup';
  popup.setAttribute('role', 'menu');
  popup.innerHTML = GANTT_PRESET_COLORS.map((color) => `
    <button
      type="button"
      class="gantt-color-swatch ${color === selected ? 'active' : ''}"
      style="background:${color}"
      title="${color}"
      onclick="onGanttFloatingSwatchPick('${color}', event)"
    ></button>
  `).join('');
  document.body.appendChild(popup);
  positionGanttColorPopup(popup, button);
}

function canonicalizeGanttRows(rows = []) {
  const seen = new Set();
  return rows.map((row) => ({
    ...row,
    nombre: canonicalizeGanttName(row.nombre),
    dependencia: row.dependencia ? canonicalizeGanttName(row.dependencia) : row.dependencia,
  })).filter((row) => {
    if (!UNIQUE_GANTT_MILESTONES.has(row.nombre)) return true;
    if (seen.has(row.nombre)) return false;
    seen.add(row.nombre);
    return true;
  });
}

function getGanttMonthWidth() {
  const viewport = window.innerWidth || 1440;
  if (viewport <= 1366) return 34;
  if (viewport <= 1680) return 38;
  return 42;
}

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
  return new Intl.DateTimeFormat('es-CL', { month: 'short', year: '2-digit' })
    .format(date)
    .replace(/\./g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function formatTimelineMonthLabel(month) {
  return formatTimelineQuarterLabel(addMonths(getGanttBaseDate(), Math.max(0, toNumber(month))));
}

function getGanttRangeLabel(startMonth, durationMonths) {
  const start = Math.max(0, toNumber(startMonth));
  const end = Math.max(start, start + Math.max(1, toNumber(durationMonths)) - 1);
  return `Entre ${formatTimelineMonthLabel(start)} y ${formatTimelineMonthLabel(end)}`;
}

function getGanttTimelineMeta(rows = state.gantt, monthWidth = getGanttMonthWidth()) {
  const normalized = normalizeGanttRows(rows);
  const totalMonths = Math.max(12, ...normalized.map((row) => toNumber(row.fin)));
  const timelineWidth = (totalMonths + 1) * monthWidth;
  const baseDate = getGanttBaseDate();
  const monthMarks = [];
  for (let month = 0; month <= totalMonths; month += 1) {
    const showLabel = month % 2 === 0 || month === totalMonths;
    monthMarks.push({
      month,
      left: month * monthWidth,
      label: formatTimelineQuarterLabel(addMonths(baseDate, month)),
      showLabel,
    });
  }
  return { totalMonths, timelineWidth, monthMarks };
}

function renderGanttTimelineScale(containerId, meta, monthWidth = getGanttMonthWidth()) {
  if (!$(containerId)) return;
  setHtml(containerId, `
    <div class="gantt-timeline-scale has-grid" style="width:${meta.timelineWidth}px;--month-width:${monthWidth}px">
      ${meta.monthMarks.map((mark) => `
        <div class="gantt-quarter-mark" style="left:${mark.left}px">
          <span title="Mes ${fmtNumber(mark.month)}">${mark.showLabel ? escapeHtml(mark.label) : ''}</span>
        </div>
      `).join('')}
    </div>
  `);
}

function normalizeGanttRows(rows) {
  const canonicalRows = canonicalizeGanttRows(rows);
  const normalizedRows = [];
  const byName = new Map(canonicalRows.map((row) => [row.nombre, row]));
  canonicalRows.forEach((row) => {
    const dependencia = row.dependencia || '';
    const dependenciaTipo = row.dependencia_tipo || 'fin';
    const dependenciaRow = dependencia ? byName.get(dependencia) : null;
    // Tipo 'fin': la fila dependiente arranca el MES SIGUIENTE al término (fin + 1).
    // Tipo 'inicio': arranca al inicio del mismo mes que la dep.
    const inicioBase = dependenciaRow
      ? (dependenciaTipo === 'inicio'
          ? toNumber(dependenciaRow.inicio)
          : toNumber(dependenciaRow.fin) + 1)
      : toNumber(row.inicio);
    const inicio = dependenciaRow ? inicioBase + toNumber(row.desfase) : toNumber(row.inicio);
    const duracion = Math.max(1, toNumber(row.duracion || 1));
    const fin = inicio + duracion - 1;
    const normalizedRow = {
      ...row,
      color: normalizeGanttColor(row.color),
      dependencia,
      dependencia_tipo: dependenciaTipo,
      desfase: toNumber(row.desfase),
      inicio,
      duracion,
      fin,
    };
    normalizedRows.push(normalizedRow);
    byName.set(normalizedRow.nombre, normalizedRow);
  });
  return normalizedRows;
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

function setupGanttTimelineClip() {
  const shell = document.getElementById('gantt-editor-scroll');
  if (!shell || shell._ganttClipBound) return;
  shell._ganttClipBound = true;
  function applyClip() {
    const th = shell.querySelector('.gantt-timeline-head');
    if (th) th.style.clipPath = shell.scrollLeft > 0 ? `inset(0 0 0 ${shell.scrollLeft}px)` : '';
  }
  shell.addEventListener('scroll', applyClip, { passive: true });
  applyClip();
}

function renderGanttEditor(rows = state.gantt) {
  const normalized = normalizeGanttRows(rows);
  state.gantt = normalized;
  const monthWidth = getGanttMonthWidth();
  const meta = getGanttTimelineMeta(normalized, monthWidth);
  renderGanttTimelineScale('gantt-timeline-head', meta, monthWidth);
  setupGanttTimelineClip();

  setHtml('gantt-tbody', normalized.map((row, index) => {
    const left = toNumber(row.inicio) * monthWidth;
    const width = Math.max(1, toNumber(row.duracion)) * monthWidth;
    const lock = getGanttLockConfig(row);
    return `
      <tr data-gantt-row data-id="${escapeHtml(row.id || '')}" data-index="${index}" ondragover="allowGanttDrop(event)" ondrop="dropGanttRow(event)">
        <td class="gantt-sticky-left gantt-actions" style="left:0;width:34px">
          <span class="drag-handle" ${lock.drag ? '' : 'data-gantt-drag="1" draggable="true" ondragstart="startGanttDrag(event)" ondragend="endGanttDrag(event)"'} title="${escapeHtml(lock.hint || 'Orden manual')}">${lock.drag ? '&#8226;' : '&#8226;&#8226;&#8226;'}</span>
        </td>
        <td class="gantt-sticky-left" style="left:34px;width:170px">
          <div class="gantt-name-wrap">
            ${getGanttColorSwatches(row.color)}
            <input class="inp gantt-name-input" data-field="nombre" value="${escapeHtml(row.nombre)}" ${lock.name ? 'disabled' : ''} onchange="onGanttInputChange()"/>
          </div>
        </td>
        <td class="gantt-sticky-left" style="left:204px;width:132px">
          <div style="display:grid;grid-template-columns:1fr 50px;gap:4px">
            <select class="inp" data-field="dependencia" ${lock.dependency ? 'disabled' : ''} onchange="onGanttInputChange()">
              ${getGanttDependencyOptions(row.nombre).replace(`value="${escapeHtml(row.dependencia || '')}"`, `value="${escapeHtml(row.dependencia || '')}" selected`)}
            </select>
            <select class="inp" data-field="dependencia_tipo" ${lock.dependency ? 'disabled' : ''} onchange="onGanttInputChange()">
              <option value="inicio" ${row.dependencia_tipo === 'inicio' ? 'selected' : ''}>Inicio</option>
              <option value="fin" ${row.dependencia_tipo === 'fin' ? 'selected' : ''}>Fin</option>
            </select>
          </div>
        </td>
        <td class="gantt-sticky-left gantt-cell-tight" style="left:336px;width:72px"><input class="inp" data-field="desfase" type="number" value="${toNumber(row.desfase)}" ${lock.start ? 'disabled' : ''} onchange="onGanttInputChange()"/></td>
        <td class="gantt-sticky-left gantt-cell-tight" style="left:408px;width:72px"><input class="inp" data-field="inicio" type="number" value="${toNumber(row.inicio)}" ${(row.dependencia || lock.start) ? 'disabled' : ''} onchange="onGanttInputChange()"/></td>
        <td class="gantt-sticky-left gantt-cell-tight" style="left:480px;width:78px"><input class="inp" data-field="duracion" type="number" value="${toNumber(row.duracion)}" ${lock.duration ? 'disabled' : ''} onchange="onGanttInputChange()"/></td>
        <td>
          <div class="gantt-editor-track" style="width:${meta.timelineWidth}px;--month-width:${monthWidth}px">
            <div class="gantt-editor-bar" title="Inicio ${fmtNumber(row.inicio)} · Fin ${fmtNumber(row.fin)}" style="left:${left}px;width:${width}px;background:${escapeHtml(row.color || '#3b82f6')}"></div>
          </div>
        </td>
        <td class="gantt-sticky-right" style="width:42px">
          <div class="gantt-actions">
            <button class="btn-outline gantt-delete-btn" type="button" title="${escapeHtml(lock.delete ? (lock.hint || 'Bloque bloqueado') : 'Eliminar fila')}" onclick="${lock.delete ? '' : `removeGanttRow(${index})`}" ${lock.delete ? 'disabled style="opacity:.35;cursor:not-allowed"' : ''}>&times;</button>
          </div>
        </td>
      </tr>
    `;
  }).join(''));
  Array.from(document.querySelectorAll('#gantt-tbody .gantt-editor-bar')).forEach((bar, index) => {
    const row = normalized[index];
    if (!row) return;
    const range = getGanttRangeLabel(row.inicio, row.duracion);
    bar.title = range;
    bar.dataset.range = range;
  });
  renderGanttPreview();
}

function renderGanttPreview() {
  const normalized = normalizeGanttRows(state.gantt);
  const monthWidth = getGanttMonthWidth();
  const meta = getGanttTimelineMeta(normalized, monthWidth);
  setHtml('gantt-preview', `
    <div class="gantt-preview-head">
      <div class="gantt-preview-label-spacer"></div>
      <div class="gantt-timeline-scale has-grid" style="width:${meta.timelineWidth}px;--month-width:${monthWidth}px;margin-bottom:8px">
        ${meta.monthMarks.map((mark) => `
          <div class="gantt-quarter-mark" style="left:${mark.left}px">
            <span title="Mes ${fmtNumber(mark.month)}">${mark.showLabel ? escapeHtml(mark.label) : ''}</span>
          </div>
        `).join('')}
      </div>
    </div>
    ${normalized.map((hito) => {
      const left = toNumber(hito.inicio) * monthWidth;
      const width = Math.max(1, toNumber(hito.duracion)) * monthWidth;
      return `
      <div class="gantt-row">
        <div class="gantt-label">${escapeHtml(hito.nombre)}</div>
        <div class="gantt-track" style="width:${meta.timelineWidth}px;--month-width:${monthWidth}px">
          <div class="gantt-bar" title="Inicio ${fmtNumber(hito.inicio)} · Fin ${fmtNumber(hito.fin)}" style="left:${left}px;width:${width}px;background:${escapeHtml(hito.color || '#3b82f6')}"></div>
        </div>
      </div>
    `;
    }).join('')}
  `);
  Array.from(document.querySelectorAll('#gantt-preview .gantt-bar')).forEach((bar, index) => {
    const row = normalized[index];
    if (!row) return;
    const range = getGanttRangeLabel(row.inicio, row.duracion);
    bar.title = range;
    bar.dataset.range = range;
  });
}

function onGanttFloatingSwatchPick(color, event) {
  event?.stopPropagation();
  const host = activeGanttColorButton?.closest('.gantt-name-wrap');
  if (!host) return;
  const colorInput = host.querySelector('[data-field="color"]');
  if (!colorInput) return;
  const selectedColor = normalizeGanttColor(color);
  colorInput.value = selectedColor;
  activeGanttColorButton.style.background = selectedColor;
  closeGanttColorPopup();
  onGanttInputChange();
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

function isVentasCronogramaType(row, type) {
  return String(row?.tipo || '').trim().toUpperCase() === String(type || '').trim().toUpperCase();
}

function getCronogramaByType(type) {
  return state.ventasCronograma.filter((row) => isVentasCronogramaType(row, type));
}

function getCronogramaForUso(type, uso) {
  return state.ventasCronograma.find((row) => isVentasCronogramaType(row, type) && row.uso === uso) || null;
}

function getVentasMetaRow(type) {
  return state.ventasCronograma.find((row) => isVentasCronogramaType(row, type)) || null;
}

function normalizeVentasVelocity(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return Math.max(1, toNumber(fallback || 1));
}

function getVentasVelocitySettings() {
  return {
    promesas: normalizeVentasVelocity(getVentasMetaRow('META_PROMESAS')?.velocidad, 54),
    escrituracion: normalizeVentasVelocity(getVentasMetaRow('META_ESCRITURACION')?.velocidad, 20),
  };
}

function buildVentasUnitFlowForMonths(months, promiseStart = 0, escrituraStart = 0) {
  const totalUnits = Math.max(0, Math.round(toNumber(getTotalSalesMetrics().totalUnidades)));
  const velocity = getVentasVelocitySettings();
  const promesaMonthly = Math.max(1, Math.round(toNumber(velocity.promesas)));
  const escrituraMonthly = Math.max(1, Math.round(toNumber(velocity.escrituracion)));
  const startPromesas = Math.max(0, Math.round(toNumber(promiseStart)));
  const startEscritura = Math.max(0, Math.round(toNumber(escrituraStart)));
  const promesas = months.map(() => 0);
  const escrituras = months.map(() => 0);
  let promesasAcum = 0;
  let escriturasAcum = 0;

  months.forEach((month, index) => {
    if (month >= startPromesas && promesasAcum < totalUnits) {
      const promesasMes = Math.min(promesaMonthly, totalUnits - promesasAcum);
      promesasAcum += promesasMes;
      promesas[index] = promesasMes;
    }
    if (month >= startEscritura && escriturasAcum < totalUnits) {
      const disponible = Math.max(0, promesasAcum - escriturasAcum);
      const escriturasMes = Math.min(escrituraMonthly, disponible, totalUnits - escriturasAcum);
      escriturasAcum += escriturasMes;
      escrituras[index] = escriturasMes;
    }
  });

  return { promesas, escrituras };
}

function calculateEscrituraDurationWithPromiseCap(escrituraStart, promiseStart = 0) {
  const totalUnits = Math.max(0, Math.round(toNumber(getTotalSalesMetrics().totalUnidades)));
  if (!totalUnits) return 1;
  const velocity = getVentasVelocitySettings();
  const promesaMonthly = Math.max(1, Math.round(toNumber(velocity.promesas)));
  const startEscritura = Math.max(0, Math.round(toNumber(escrituraStart)));
  const maxMonth = startEscritura + totalUnits + Math.ceil(totalUnits / promesaMonthly) + 240;
  const months = Array.from({ length: maxMonth + 1 }, (_, index) => index);
  const { escrituras } = buildVentasUnitFlowForMonths(months, promiseStart, startEscritura);
  const lastIndex = escrituras.reduce((last, value, index) => (toNumber(value) > 0 ? index : last), -1);
  const lastMonth = lastIndex >= 0 ? months[lastIndex] : startEscritura;
  return Math.max(1, lastMonth - startEscritura + 1);
}

function getTotalCommercialUnits() {
  return state.ventasConfig.reduce((sum, row) => sum + getUsoSaleMetrics(row.uso).unidades, 0);
}

function getPreventaUnitsTotal() {
  return getTotalCommercialUnits();
}

function getPromiseMilestone() {
  return state.gantt.find((row) => /INICIO PROMESAS/i.test(String(row.nombre || '').trim())) || null;
}

function getMunicipalReceptionMilestone() {
  return state.gantt.find((row) => /RECEPCI[ÓO]N MUNICIPAL/i.test(String(row.nombre || '').trim())) || null;
}

function getEscrituracionMilestone() {
  return state.gantt.find((row) => /^ESCRITURACI[ÓO]N$/i.test(String(row.nombre || '').trim())) || null;
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
      forma_pago_promesa: ['unico', 'cuotas'].includes(String(existing.forma_pago_promesa || '').trim())
        ? String(existing.forma_pago_promesa).trim()
        : 'unico',
    };
  });

  const ganttNames = state.gantt.map((row) => row.nombre);
  const defaults = [
    { type: 'PREVENTA', label: 'Promesas', percentage: 100 },
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
        porcentaje: item.type === 'PREVENTA' ? 100 : toNumber(existing.porcentaje || item.percentage),
      });
    }
  }

  const escrituracion = getCronogramaByType('ESCRITURACION')[0] || {};
  nextCronograma.push({
    id: escrituracion.id,
    tipo: 'ESCRITURACION',
    uso: 'GLOBAL',
    vinculo_gantt: escrituracion.vinculo_gantt || ganttNames[0] || null,
    mes_inicio: toNumber(escrituracion.mes_inicio),
    duracion: toNumber(escrituracion.duracion),
    porcentaje: 0,
  });

  const metaPromesas = getVentasMetaRow('META_PROMESAS') || {};
  nextCronograma.push({
    id: metaPromesas.id,
    tipo: 'META_PROMESAS',
    uso: 'GLOBAL',
    vinculo_gantt: null,
    mes_inicio: 0,
    duracion: 0,
    porcentaje: 0,
    velocidad: normalizeVentasVelocity(metaPromesas.velocidad, 54),
  });

  const metaEscrituracion = getVentasMetaRow('META_ESCRITURACION') || {};
  nextCronograma.push({
    id: metaEscrituracion.id,
    tipo: 'META_ESCRITURACION',
    uso: 'GLOBAL',
    vinculo_gantt: null,
    mes_inicio: 0,
    duracion: 0,
    porcentaje: 0,
    velocidad: normalizeVentasVelocity(metaEscrituracion.velocidad, 20),
  });

  state.ventasCronograma = nextCronograma;
}

function getUsoSaleMetrics(uso) {
  const cabidaRow = state.cabida.find((row) => row.uso === uso) || {};
  const config = state.ventasConfig.find((row) => row.uso === uso) || {};
  const unidades = toNumber(cabidaRow.cantidad);
  const supVendible = getSellableAreaPerUnit(cabidaRow.sup_interior, cabidaRow.sup_terrazas) * unidades;
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

function getTotalSalesMetrics() {
  const addons = getAddonSalesMetrics();
  const totalDeptos = state.ventasConfig.reduce((sum, row) => sum + getUsoSaleMetrics(row.uso).total, 0);
  const totalAccesorios = addons.estacionamientos.total + addons.bodegas.total;
  const totalUnidades = getTotalCommercialUnits();
  return {
    addons,
    totalDeptos,
    totalAccesorios,
    total: totalDeptos + totalAccesorios,
    totalUnidades,
    precioPromedio: totalUnidades ? (totalDeptos + totalAccesorios) / totalUnidades : 0,
  };
}

function getGlobalPaymentSettings() {
  const source = state.ventasConfig[0] || {};
  return {
    pie_promesa_pct: toNumber(source.pie_promesa_pct),
    pie_cuotas_pct: toNumber(source.pie_cuotas_pct),
    pie_cuoton_pct: Math.max(1, toNumber(source.pie_cuoton_pct) || 1),
    forma_pago_promesa: ['unico', 'cuotas'].includes(String(source.forma_pago_promesa || '').trim())
      ? String(source.forma_pago_promesa).trim()
      : 'unico',
  };
}

function findGanttByName(name) {
  return state.gantt.find((row) => row.nombre === name) || null;
}

function getCronogramaComputed(item) {
  const ganttRef = findGanttByName(item.vinculo_gantt);
  const base = isVentasCronogramaType(item, 'PREVENTA') ? toNumber(ganttRef?.inicio) : toNumber(ganttRef?.fin) + 1;
  const inicio = ganttRef ? base + toNumber(item.mes_inicio) : toNumber(item.mes_inicio);

  // Duración calculada automáticamente basada en velocidad
  let duracion = Math.max(1, toNumber(item.duracion));
  const totals = getTotalSalesMetrics();
  const velocitySettings = getVentasVelocitySettings();
  const velocidadPromesas = toNumber(velocitySettings.promesas);

  if (isVentasCronogramaType(item, 'PREVENTA')) {
    // Promesas: totalUnidades / velocidad_promesas
    if (velocidadPromesas > 0) {
      duracion = Math.ceil(totals.totalUnidades / velocidadPromesas);
    }
  } else if (isVentasCronogramaType(item, 'ESCRITURACION')) {
    // Escrituraciones: velocidad efectiva = min(promesas, escrituración)
    // Limitadas por acumulado de promesas, pero no por una duración fija
    const promesaRow = getCronogramaByType('PREVENTA')[0];
    const promesaComputed = promesaRow ? getCronogramaComputed(promesaRow) : null;
    duracion = calculateEscrituraDurationWithPromiseCap(inicio, promesaComputed?.inicio || 0);
  }

  const fin = inicio + duracion - 1;
  return { inicio, duracion, fin };
}

function renderVentasModule() {
  ensureVentasState();
  syncSalesDrivenMilestones();
  if ($('ventas-velocidad-promesas')) $('ventas-velocidad-promesas').value = getVentasVelocitySettings().promesas;
  if ($('ventas-velocidad-escrituracion')) $('ventas-velocidad-escrituracion').value = getVentasVelocitySettings().escrituracion;
  renderGanttEditor(state.gantt);
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
        <td style="text-align:center;color:#16a34a">${fmtTableAmount(metrics.total, { kind: 'income' })}</td>
        <td style="text-align:center">-</td>
        <td style="text-align:center;color:#ea580c;font-weight:800">${fmtTableAmount(metrics.total, { kind: 'income' })}</td>
        <td style="text-align:center">${fmtTableAmount(metrics.ticket, { kind: 'income' })}</td>
      </tr>
    `;
  }).join('');

  const addons = getAddonSalesMetrics();
  const totalVentas = getTotalSalesMetrics();
  const totalVenta = totalVentas.total;
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
      <td style="text-align:center">-</td>
      <td><div style="display:flex;align-items:center;gap:8px"><span style="font-size:11px;color:#64748b;white-space:nowrap">${fmtNumber(addons.estacionamientos.unidades)} un</span><input id="ventas-precio-estacionamiento-global" class="inp" type="number" step="0.01" value="${toNumber(accessorySales.precio_estacionamiento)}" onchange="onVentasInputChange()"/></div></td>
      <td style="text-align:center;color:#ea580c;font-weight:800">${fmtTableAmount(addons.estacionamientos.total, { kind: 'income' })}</td>
      <td style="text-align:center">-</td>
    </tr>
    <tr style="background:#f8fafc">
      <td style="font-weight:800">BODEGAS</td>
      <td style="text-align:center">${fmtNumber(addons.bodegas.unidades)}</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">-</td>
      <td style="text-align:center">-</td>
      <td><div style="display:flex;align-items:center;gap:8px"><span style="font-size:11px;color:#64748b;white-space:nowrap">${fmtNumber(addons.bodegas.unidades)} un</span><input id="ventas-precio-bodega-global" class="inp" type="number" step="0.01" value="${toNumber(accessorySales.precio_bodega)}" onchange="onVentasInputChange()"/></div></td>
      <td style="text-align:center;color:#ea580c;font-weight:800">${fmtTableAmount(addons.bodegas.total, { kind: 'income' })}</td>
      <td style="text-align:center">-</td>
    </tr>
  `);
  setHtml('ventas-tfoot', `
    <td>Total</td>
    <td>${fmtNumber(totalUnidades)}</td>
    <td>${fmtNumber(totalSup, 1)}</td>
    <td>${fmtNumber(totalUnidades ? totalSup / totalUnidades : 0, 1)}</td>
    <td colspan="4"></td>
    <td style="font-weight:800;color:#22c55e">${fmtTableAmount(totalVenta, { kind: 'income', total: true })}</td>
    <td>${fmtTableAmount(totalVentas.precioPromedio, { kind: 'income', total: true })}</td>
  `);
}

function renderVentasPaymentForms() {
  const settings = getGlobalPaymentSettings();
  const totals = getTotalSalesMetrics();
  const piePct = Math.min(100, Math.max(0, settings.pie_promesa_pct));
  const pieUnidad = totals.precioPromedio * piePct / 100;
  const modeLabels = {
    unico: 'Pago unico',
    cuotas: 'Pago en cuotas',
  };

  setHtml('formas-pago-tbody', `
    <tr data-ventas-payment-global>
      <td><input class="inp" type="number" step="0.01" data-field="pie_promesa_pct" value="${settings.pie_promesa_pct}" onchange="onVentasInputChange()"/></td>
      <td>
        <select class="inp" data-field="forma_pago_promesa" onchange="onVentasInputChange()">
          ${Object.entries(modeLabels).map(([value, label]) => `<option value="${value}" ${settings.forma_pago_promesa === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </td>
      <td style="text-align:center"><input class="inp" type="number" min="1" step="1" data-field="pie_cuoton_pct" value="${settings.pie_cuoton_pct}" onchange="onVentasInputChange()" style="width:70px;text-align:center"/></td>
      <td style="text-align:center">${fmtTableAmount(pieUnidad, { kind: 'income' })}</td>
      <td style="text-align:center;color:#16a34a">${fmtTableAmount(totals.precioPromedio, { kind: 'income' })}</td>
    </tr>
  `);
}

function ganttOptionsHtml(selected) {
  return ['<option value="">Sin vinculo</option>']
    .concat(state.gantt.map((item) => `<option value="${escapeHtml(item.nombre)}">${escapeHtml(item.nombre)}</option>`))
    .join('')
    .replace(`value="${escapeHtml(selected || '')}"`, `value="${escapeHtml(selected || '')}" selected`);
}

function renderVentasSchedules() {
  // Cronograma de Promesas: fila única global (auto-calculada)
  const preventaRows = getCronogramaByType('PREVENTA');
  const totalUnidadesPromesas = preventaRows.reduce((sum, row) => {
    const metrics = getUsoSaleMetrics(row.uso);
    return sum + Math.round(metrics.unidades * toNumber(row.porcentaje) / 100);
  }, 0);
  const primeraPreventa = preventaRows[0];
  const computedPreventa = primeraPreventa ? getCronogramaComputed(primeraPreventa) : { inicio: 0, fin: 0, duracion: 0 };
  const velPromesas = computedPreventa.duracion ? totalUnidadesPromesas / computedPreventa.duracion : 0;

  setHtml('preventa-tbody', primeraPreventa ? `
    <tr>
      <td style="color:#64748b">${escapeHtml(primeraPreventa.vinculo_gantt || 'Promesas')}</td>
      <td style="text-align:center;font-weight:700">${fmtNumber(computedPreventa.inicio)}</td>
      <td style="text-align:center;color:#16a34a;font-weight:700">${fmtNumber(computedPreventa.fin)}</td>
      <td style="text-align:center">${fmtNumber(totalUnidadesPromesas)} un</td>
      <td style="text-align:center">${fmtNumber(velPromesas, 1)} un/mes</td>
    </tr>
  ` : '<tr><td colspan="5" style="text-align:center;color:#94a3b8">Sin unidades configuradas</td></tr>');

  // Cronograma de Escrituración: fila única global (auto-calculada)
  const escrRow = getCronogramaByType('ESCRITURACION')[0];
  const totalUnidadesEscr = state.ventasConfig.reduce((sum, item) => sum + getUsoSaleMetrics(item.uso).unidades, 0);
  const computedEscr = escrRow ? getCronogramaComputed(escrRow) : { inicio: 0, fin: 0, duracion: 0 };
  const velEscr = computedEscr.duracion ? totalUnidadesEscr / computedEscr.duracion : 0;

  setHtml('escrituracion-tbody', escrRow ? `
    <tr>
      <td style="color:#64748b">${escapeHtml(escrRow.vinculo_gantt || 'Escrituración')}</td>
      <td style="text-align:center;font-weight:700">${fmtNumber(computedEscr.inicio)}</td>
      <td style="text-align:center;color:#16a34a;font-weight:700">${fmtNumber(computedEscr.fin)}</td>
      <td style="text-align:center">${fmtNumber(totalUnidadesEscr)} un</td>
      <td style="text-align:center">${fmtNumber(velEscr, 1)} un/mes</td>
    </tr>
  ` : '<tr><td colspan="5" style="text-align:center;color:#94a3b8">Sin datos de escrituración</td></tr>');
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

function renderVentasSummaryCardsLegacy() {
  const totalVenta = state.ventasConfig.reduce((sum, row) => sum + getUsoSaleMetrics(row.uso).total, 0);
  const preRows = getCronogramaByType('PREVENTA');
  const escrRow = getCronogramaByType('ESCRITURACION')[0];

  const promesasPct = preRows.length ? 100 : 0;
  const ventaRows = [];
  const preventaPct = promesasPct;
  const ventaPct = 0;
  const escrituraInicio = escrRow ? getCronogramaComputed(escrRow).inicio : 0;
  const escrituraFin = escrRow ? getCronogramaComputed(escrRow).fin : 0;
  const escrituraDuracion = escrRow ? getCronogramaComputed(escrRow).duracion : 0;
  const totalUnidades = state.ventasConfig.reduce((sum, row) => sum + getUsoSaleMetrics(row.uso).unidades, 0);
  const velEntregas = escrituraDuracion ? totalUnidades / escrituraDuracion : 0;
  const promesaDuracion = preRows.length ? getCronogramaComputed(preRows[0]).duracion : 0;
  const velPromesas = promesaDuracion ? totalUnidades / promesaDuracion : 0;

  const analysisStart = escrituraDuracion > 0
    ? escrituraInicio
    : Math.min(
      ...preRows.concat(ventaRows).map((row) => getCronogramaComputed(row).inicio),
      escrituraInicio || 999999
    );
  const analysisEnd = escrituraDuracion > 0
    ? escrituraFin
    : Math.max(
      ...preRows.concat(ventaRows).map((row) => getCronogramaComputed(row).fin),
      escrituraFin || 0
    );
  const duration = analysisEnd >= analysisStart ? analysisEnd - analysisStart + 1 : 1;
  const velUf = totalVenta / duration;
  const velUn = totalUnidades / duration;

  drawSpeedometer(velUf, Math.max(velUf * 1.3, 1));
  setText('vel-global-uf', fmtNumber(velUf));
  setText('vel-global-un', `${fmtNumber(velUn, 1)} un/m`);
  setText('vel-duracion', `${fmtNumber(duration)} meses`);
  setText('vel-analisis', `Analisis desde ${formatTimelineMonthLabel(analysisStart)} a ${formatTimelineMonthLabel(analysisEnd)}`);
  setText('vel-entregas', fmtNumber(velEntregas, 1));
  setText('vel-promesas-mini', `Vel. promesas: ${fmtNumber(velPromesas, 1)} un/mes`);
  setText('escrit-inicio', formatTimelineMonthLabel(escrituraInicio));
  setText('escrit-fin', formatTimelineMonthLabel(escrituraFin));
  setText('escrit-dur', `Duracion: ${fmtNumber(escrituraDuracion)} meses`);

  setHtml('mix-ventas-list', `
    <div class="etapa-card" style="border-color:#3b82f6"><div style="font-weight:800">Preventa</div><div style="font-size:12px;color:#64748b">${fmtPct(preventaPct)} del stock · ${fmtUf(totalVenta * preventaPct / 100)}</div></div>
    <div class="etapa-card" style="border-color:#22c55e"><div style="font-weight:800">Venta</div><div style="font-size:12px;color:#64748b">${fmtPct(ventaPct)} del stock · ${fmtUf(totalVenta * ventaPct / 100)}</div></div>
    <div class="etapa-card" style="border-color:#f97316"><div style="font-weight:800">Escrituracion</div><div style="font-size:12px;color:#64748b">Desde ${escapeHtml(formatTimelineMonthLabel(escrituraInicio))} hasta ${escapeHtml(formatTimelineMonthLabel(escrituraFin))}</div></div>
  `);
}

function buildTimelineMonths(extraEnd = 0) {
  const ranges = state.ventasCronograma
    .filter((row) => isVentasCronogramaType(row, 'PREVENTA') || isVentasCronogramaType(row, 'ESCRITURACION'))
    .map((row) => getCronogramaComputed(row));
  if (!ranges.length) return [0];
  const start = Math.max(1, Math.min(...ranges.map((row) => row.inicio), 1));
  const end = Math.max(start, toNumber(extraEnd), ...ranges.map((row) => Math.max(row.inicio, row.fin)));
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function formatVentasCashflowMonth(month) {
  return formatTimelineMonthLabel(month);
}

function getScheduledWholeUnits(totalUnits, computed, month) {
  if (!computed || month < computed.inicio || month > computed.fin) return 0;
  const units = Math.max(0, Math.round(toNumber(totalUnits)));
  const duration = Math.max(1, Math.round(toNumber(computed.duracion)));
  const elapsed = Math.max(0, month - computed.inicio);
  const base = Math.floor(units / duration);
  const remainder = units % duration;
  return base + (elapsed < remainder ? 1 : 0);
}

function getPromesasEscrituracionUnidades(monthCountOrMonths) {
  // Retorna arrays de promesas y escrituras capeados
  // Las escrituras nunca pueden exceder el acumulado de promesas acumuladas
  // Escrituras usa velocidad definida por usuario (ej: 20/mes exacto)
  // Acepta monthCount (número) o array de meses
  const promesaRows = getCronogramaByType('PREVENTA');
  const escrituraRow = getCronogramaByType('ESCRITURACION')[0];
  const promesaComputed = promesaRows.length ? getCronogramaComputed(promesaRows[0]) : null;
  const escrituraComputed = escrituraRow ? getCronogramaComputed(escrituraRow) : null;

  const isArrayInput = Array.isArray(monthCountOrMonths);
  const months = isArrayInput ? monthCountOrMonths : Array.from({ length: monthCountOrMonths }, (_, i) => i);
  const emptyFlow = { promesas: months.map(() => 0), escrituras: months.map(() => 0) };

  if (!promesaComputed || !escrituraComputed) return emptyFlow;

  return buildVentasUnitFlowForMonths(
    months,
    promesaComputed.inicio,
    escrituraComputed.inicio
  );
}

function renderVentasSummaryCards() {
  const addons = getAddonSalesMetrics();
  const totalVentaDeptos = state.ventasConfig.reduce((sum, row) => sum + getUsoSaleMetrics(row.uso).total, 0);
  const totalVentaAccesorios = addons.estacionamientos.total + addons.bodegas.total;
  const totalVenta = totalVentaDeptos + totalVentaAccesorios;
  const preRows = getCronogramaByType('PREVENTA');
  const escrRow = getCronogramaByType('ESCRITURACION')[0];

  const promesasPct = preRows.length ? 100 : 0;
  const escrituraInicio = escrRow ? getCronogramaComputed(escrRow).inicio : 0;
  const escrituraFin = escrRow ? getCronogramaComputed(escrRow).fin : 0;
  const escrituraDuracion = escrRow ? getCronogramaComputed(escrRow).duracion : 0;
  const totalUnidades = state.ventasConfig.reduce((sum, row) => sum + getUsoSaleMetrics(row.uso).unidades, 0);
  const velEntregas = escrituraDuracion ? totalUnidades / escrituraDuracion : 0;
  const promesaDuracion = preRows.length ? getCronogramaComputed(preRows[0]).duracion : 0;
  const velPromesas = promesaDuracion ? totalUnidades / promesaDuracion : 0;

  const analysisPoints = preRows.map((row) => getCronogramaComputed(row));
  const analysisStart = escrituraDuracion > 0
    ? escrituraInicio
    : Math.min(
      ...analysisPoints.map((row) => row.inicio),
      escrituraInicio || 999999
    );
  const analysisEnd = escrituraDuracion > 0
    ? escrituraFin
    : Math.max(
      ...analysisPoints.map((row) => row.fin),
      escrituraFin || 0
    );
  const duration = analysisEnd >= analysisStart ? analysisEnd - analysisStart + 1 : 1;
  const velUf = totalVenta / duration;
  const velUn = totalUnidades / duration;

  drawSpeedometer(velUf, Math.max(velUf * 1.3, 1));
  setText('vel-global-uf', fmtNumber(velUf));
  setText('vel-global-un', `${fmtNumber(velUn, 1)} un/m`);
  setText('vel-duracion', `${fmtNumber(duration)} meses`);
  setText('vel-analisis', `Analisis desde ${formatTimelineMonthLabel(analysisStart)} a ${formatTimelineMonthLabel(analysisEnd)}`);
  setText('vel-entregas', fmtNumber(velEntregas, 1));
  setText('vel-promesas-mini', `Vel. promesas: ${fmtNumber(velPromesas, 1)} un/mes`);
  setText('escrit-inicio', formatTimelineMonthLabel(escrituraInicio));
  setText('escrit-fin', formatTimelineMonthLabel(escrituraFin));
  setText('escrit-dur', `Duracion: ${fmtNumber(escrituraDuracion)} meses`);

  setHtml('mix-ventas-list', `
    <div class="etapa-card" style="border-color:#3b82f6"><div style="font-weight:800">Promesas departamentos</div><div style="font-size:12px;color:#64748b">${fmtPct(promesasPct)} del stock deptos · ${fmtUf(totalVentaDeptos)}</div></div>
    <div class="etapa-card" style="border-color:#8b5cf6"><div style="font-weight:800">Estac. y bodegas</div><div style="font-size:12px;color:#64748b">${fmtNumber(addons.estacionamientos.unidades)} estac. + ${fmtNumber(addons.bodegas.unidades)} bod. · ${fmtUf(totalVentaAccesorios)}</div></div>
    <div class="etapa-card" style="border-color:#f97316"><div style="font-weight:800">Escrituracion</div><div style="font-size:12px;color:#64748b">Desde ${escapeHtml(formatTimelineMonthLabel(escrituraInicio))} hasta ${escapeHtml(formatTimelineMonthLabel(escrituraFin))}</div></div>
  `);
}

function renderVentasCashflowLegacy() {
  const months = buildTimelineMonths();
  setHtml('flujo-ventas-header', months.map((month) => `<th>M${fmtNumber(month)}</th>`).join(''));

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
        if (month >= computed.inicio && month <= computed.fin) {
          totalReserva += toNumber(config.reserva_uf) * (metrics.unidades * toNumber(preventa.porcentaje) / 100) / computed.duracion;
          totalCuotas += (metrics.ticket * toNumber(config.pie_cuotas_pct) / 100) * (metrics.unidades * toNumber(preventa.porcentaje) / 100) / computed.duracion;
        }
      }

      if (venta) {
        const computed = getCronogramaComputed(venta);
        if (month >= computed.inicio && month <= computed.fin) {
          totalCuotas += (metrics.ticket * toNumber(config.pie_promesa_pct) / 100) * (metrics.unidades * toNumber(venta.porcentaje) / 100) / computed.duracion;
        }
      }

      if (escritura) {
        const computed = getCronogramaComputed(escritura);
        if (month >= computed.inicio && month <= computed.fin) {
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
      ${row.values.map((value) => `<td>${fmtTableAmount(value, { kind: 'income' })}</td>`).join('')}
    </tr>
  `).join(''));

  const totals = months.map((_, index) => rows.reduce((sum, row) => sum + row.values[index], 0));
  renderFinanceFixedColumn('flujo-ventas', rows, { footerLabel: 'Total' });
  setHtml('flujo-ventas-tfoot', totals.map((value) => `<td>${fmtTableAmount(value, { kind: 'income', total: true })}</td>`).join(''));
}

function renderVentasCashflow() {
  const totals = getTotalSalesMetrics();
  const settings = getGlobalPaymentSettings();
  const piePct = Math.min(100, Math.max(0, settings.pie_promesa_pct));
  const escrituraPct = Math.max(0, 100 - piePct);
  const cuotaMonths = Math.max(1, Math.round(toNumber(settings.pie_cuoton_pct) || 1));
  const promesaRow = getCronogramaByType('PREVENTA')[0];
  const escrituraRow = getCronogramaByType('ESCRITURACION')[0];
  const promesaComputed = promesaRow ? getCronogramaComputed(promesaRow) : null;
  const escrituraComputed = escrituraRow ? getCronogramaComputed(escrituraRow) : null;
  const cuotaEndMonth = promesaComputed ? promesaComputed.fin + cuotaMonths - 1 : 0;
  const months = buildTimelineMonths(cuotaEndMonth);
  const monthIndex = new Map(months.map((month, index) => [month, index]));
  setHtml('flujo-ventas-header', months.map((month) => `<th>${escapeHtml(formatVentasCashflowMonth(month))}</th>`).join(''));

  const pieUnidad = totals.precioPromedio * piePct / 100;
  const montoEscrituraUnidad = totals.precioPromedio * escrituraPct / 100;
  const { promesas: promesasUnidadesArr, escrituras: escrituracionUnidadesArr } = getPromesasEscrituracionUnidades(months);
  const promesasUnidades = months.map(() => 0);
  const escrituracionUnidades = months.map(() => 0);
  const promesasUf = months.map(() => 0);
  const escrituracionUf = months.map(() => 0);
  const acumuladoPromesasUnidades = [];
  const acumuladoEscriturasUnidades = [];
  const acumuladoPromesas = [];
  const acumuladoEscrituras = [];
  let promesasAcum = 0;
  let escriturasAcum = 0;
  let promesasUnidadesAcum = 0;
  let escriturasUnidadesAcum = 0;

  months.forEach((month, index) => {
    const unidadesPromesaMes = promesasUnidadesArr[index];
    const unidadesEscrituraMes = escrituracionUnidadesArr[index];
    const ufPromesaTotalMes = unidadesPromesaMes * pieUnidad;
    const ufEscrituraMes = unidadesEscrituraMes * montoEscrituraUnidad;
    const mode = settings.forma_pago_promesa;

    if (mode === 'unico') {
      promesasUf[index] += ufPromesaTotalMes;
    } else {
      const cuotaMensual = cuotaMonths ? ufPromesaTotalMes / cuotaMonths : ufPromesaTotalMes;
      for (let offset = 0; offset < cuotaMonths; offset += 1) {
        const targetIndex = monthIndex.get(month + offset);
        if (targetIndex !== undefined) promesasUf[targetIndex] += cuotaMensual;
      }
    }

    escriturasAcum += ufEscrituraMes;
    promesasUnidadesAcum += unidadesPromesaMes;
    escriturasUnidadesAcum += unidadesEscrituraMes;
    promesasUnidades[index] = unidadesPromesaMes;
    escrituracionUnidades[index] = unidadesEscrituraMes;
    escrituracionUf[index] = ufEscrituraMes;
    acumuladoPromesasUnidades.push(promesasUnidadesAcum);
    acumuladoEscriturasUnidades.push(escriturasUnidadesAcum);
    acumuladoEscrituras.push(escriturasAcum);
  });

  months.forEach((_, index) => {
    promesasAcum += promesasUf[index];
    acumuladoPromesas[index] = promesasAcum;
  });

  const rows = [
    { label: 'Promesas unidades', values: promesasUnidades, kind: 'units' },
    { label: 'Escrituracion unidades', values: escrituracionUnidades, kind: 'units' },
    { label: 'Acum. promesas unidades', values: acumuladoPromesasUnidades, kind: 'units' },
    { label: 'Acum. escrituras unidades', values: acumuladoEscriturasUnidades, kind: 'units' },
    { label: 'Promesas UF', values: promesasUf, kind: 'income' },
    { label: 'Escrituracion UF', values: escrituracionUf, kind: 'income' },
    { label: 'Acum. promesas UF', values: acumuladoPromesas, kind: 'income' },
    { label: 'Acum. escrituras UF', values: acumuladoEscrituras, kind: 'income' },
  ];

  setHtml('flujo-ventas-tbody', rows.map((row) => `
    <tr>
      ${row.values.map((value) => `<td>${row.kind === 'units' ? fmtNumber(value) : fmtTableAmount(value, { kind: 'income' })}</td>`).join('')}
    </tr>
  `).join(''));

  const ingresos = months.map((_, index) => promesasUf[index] + escrituracionUf[index]);
  renderFinanceFixedColumn('flujo-ventas', rows, { footerLabel: 'Total ingresos UF' });
  setHtml('flujo-ventas-tfoot', ingresos.map((value) => `<td>${fmtTableAmount(value, { kind: 'income', total: true })}</td>`).join(''));
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

  if ($('constr-sup-st') && !$('constr-sup-st').matches(':focus')) $('constr-sup-st').value = toNumber(state.construccion?.sup_sobre_tierra) || '';
  if ($('constr-sup-bt') && !$('constr-sup-bt').matches(':focus')) $('constr-sup-bt').value = toNumber(state.construccion?.sup_bajo_tierra) || '';
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
  if ($('constr-pct-inicio')) $('constr-pct-inicio').value = toNumber(metrics.pct_inicio_construccion ?? 25);

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
  if ($('cfg-tasa-terreno')) $('cfg-tasa-terreno').value = toNumber(state.financiamiento.credito_terreno_tasa);
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
  if ($('fin-constr-alzamiento')) $('fin-constr-alzamiento').value = toNumber(state.financiamiento.pct_alzamiento ?? 90);
  setText('fin-constr-costo', fmtUf(metrics.total_neto));
  setText('fin-constr-monto', fmtUf(approved));
  setText('fin-constr-plazos', `Plazo estimado: mes ${fmtNumber(start)} a mes ${fmtNumber(start + duration)}`);
  setHtml('fin-constr-partidas', `<div>Base financiera tomada desde el total neto de construcción.</div>`);

  // Sync global config inputs
  const cfg = getGlobalFinancialParams();
  if ($('cfg-tasa-terreno')) $('cfg-tasa-terreno').value = cfg.tasa_terreno;
  if ($('cfg-tasa-construccion')) $('cfg-tasa-construccion').value = cfg.tasa_construccion;
  if ($('cfg-pct-timbres')) $('cfg-pct-timbres').value = cfg.pct_timbres;
  if ($('cfg-pct-ceec')) $('cfg-pct-ceec').value = cfg.pct_ceec;
  if ($('cfg-pct-renta')) $('cfg-pct-renta').value = cfg.pct_impuesto_renta;

  // Renderizar tabla EP + GF conectadas
  const epData = renderConstructionEP();
  renderConstructionGF(epData);
}

function computeConstructionEP() {
  // Devuelve arrays mensuales: { ep, anticipo, retenciones, subtotal, ivaBruto, ceec, ivaEfectivo, totalPago }
  const metrics = getConstructionMetrics();
  const meses = Math.max(1, metrics.plazo_meses);
  const monthCount = getCostMonthCount();
  const startMonth = getConstructionStartMonth();
  const dist = buildConstructionSCurve(metrics, meses);
  const cfg = getGlobalFinancialParams();
  const ceecPct = cfg.pct_ceec / 100;
  const anticipoPct = Math.max(0, toNumber(metrics.anticipo_pct)) / 100;
  const anticipoTotal = metrics.total_neto * anticipoPct;
  const anticipoMonth = Math.max(0, Math.min(monthCount - 1, startMonth - 1));

  const ep = createMonthlyArray(monthCount, 0);
  const anticipo = createMonthlyArray(monthCount, 0);
  const retenciones = createMonthlyArray(monthCount, 0);

  // Anticipo: desembolso completo un mes antes del inicio de construcción
  anticipo[anticipoMonth] += anticipoTotal;

  // Durante la obra: EP bruto, descuento anticipo mensual, retención mensual
  for (let i = 0; i < meses; i += 1) {
    const m = Math.min(monthCount - 1, startMonth + i);
    ep[m] += toNumber(dist.monthlyCosts[i]); // EDPP bruto del mes
    anticipo[m] -= toNumber(dist.monthlyAnticipoRecovery[i]); // descuento del anticipo
    retenciones[m] -= toNumber(dist.monthlyRetention[i]); // retención del mes
  }

  // Devolución de retenciones al final de obra
  const totalRet = dist.retentionAmount;
  const finalM = Math.min(monthCount - 1, startMonth + meses);
  retenciones[finalM] += totalRet;

  // Calcular columnas derivadas
  const subtotal = createMonthlyArray(monthCount, 0);
  const ivaBruto = createMonthlyArray(monthCount, 0);
  const ceec = createMonthlyArray(monthCount, 0);
  const ivaEfectivo = createMonthlyArray(monthCount, 0);
  const totalPago = createMonthlyArray(monthCount, 0);

  for (let m = 0; m < monthCount; m += 1) {
    const sub = toNumber(ep[m]) + toNumber(anticipo[m]) + toNumber(retenciones[m]);
    subtotal[m] = sub;
    const ivaB = sub * 0.19;
    ivaBruto[m] = ivaB;
    const ceecVal = ivaB > 0 ? ivaB * ceecPct : 0;
    ceec[m] = ceecVal;
    const ivaE = ivaB - ceecVal;
    ivaEfectivo[m] = ivaE;
    totalPago[m] = sub + ivaE;
  }

  return { ep, anticipo, retenciones, subtotal, ivaBruto, ceec, ivaEfectivo, totalPago, startMonth, meses, anticipoMonth, anticipoTotal };
}

function renderConstructionEP() {
  if (!$('constr-ep-head')) return null;
  const labels = getCostMonthLabels();
  const data = computeConstructionEP();
  const cfg = getGlobalFinancialParams();

  setHtml('constr-ep-head', `
    <tr>
      <th style="width:60px;text-align:center">ƒx</th>
      <th class="finance-total-col" style="width:110px;text-align:right">Total</th>
      ${labels.map((l) => `<th data-month-col>${escapeHtml(l)}</th>`).join('')}
    </tr>
  `);

  const total = (arr) => arr.reduce((a, b) => a + toNumber(b), 0);
  const rows = [
    { label: 'EP (EDPP bruto)', values: data.ep, formula: 'EDPP_bruto(t) desde curva S (sin descontar anticipo ni retención)', color: '#fff' },
    { label: 'Anticipo', values: data.anticipo, formula: `+Anticipo total un mes antes de construcción · −Anticipo% × EDPP(t) durante la obra  (Total = ${fmtUf(data.anticipoTotal)})`, color: '#fbbf24' },
    { label: 'Retenciones', values: data.retenciones, formula: '−Retención% × (EDPP − Anticipo). Devolución total al final de obra.', color: '#fbbf24' },
    { label: 'Subtotal neto', values: data.subtotal, formula: 'EP + Anticipo + Retenciones', bold: true, color: '#22c55e' },
    { label: 'IVA bruto (19%)', values: data.ivaBruto, formula: 'Subtotal neto × 19%', color: '#94a3b8' },
    { label: `CEEC (${cfg.pct_ceec}%)`, values: data.ceec, formula: `IVA bruto × ${cfg.pct_ceec}%  ·  Beneficio que reduce el IVA`, color: '#a855f7' },
    { label: 'IVA efectivo', values: data.ivaEfectivo, formula: 'IVA bruto − CEEC', color: '#94a3b8' },
    { label: 'TOTAL A PAGO (c/IVA)', values: data.totalPago, formula: 'Subtotal neto + IVA efectivo  →  alimenta GIROS', bold: true, color: '#22c55e' },
  ];

  setHtml('constr-ep-tbody', rows.map((r) => {
    const popId = `fpop-ep-${Math.random().toString(36).slice(2, 8)}`;
    const bg = r.bold ? 'background:#f0fdf4' : '';
    return `
      <tr class="${r.bold ? 'finance-total-row' : ''}" style="${bg}">
        <td style="text-align:center;position:relative" class="formula-host">
          <button type="button" onclick="toggleFormulaPop('${popId}', event)" style="background:none;border:1px solid #cbd5e1;color:#3b82f6;border-radius:4px;padding:1px 6px;font-size:10px;cursor:pointer">ƒx</button>
          <div id="${popId}" class="formula-pop" style="display:none;position:absolute;z-index:50;left:0;top:100%;margin-top:4px;background:#0f172a;color:#fff;border-radius:8px;padding:10px 12px;min-width:260px;max-width:360px;text-align:left;box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:11px">
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;margin-bottom:4px">Fórmula</div>
            <div style="font-family:'Courier New',monospace;background:#1e293b;padding:6px 8px;border-radius:6px">${escapeHtml(r.formula)}</div>
          </div>
        </td>
        <td class="finance-total-col" style="text-align:right;font-weight:${r.bold ? 800 : 600};color:${r.color || '#334155'}">${fmtUf(total(r.values))}</td>
        ${r.values.map((v) => `<td data-month-cell style="text-align:center;color:${r.color === '#22c55e' ? '#16a34a' : '#334155'};${r.bold ? 'font-weight:700' : ''}">${fmtTableAmount(v, { kind: 'income' })}</td>`).join('')}
      </tr>`;
  }).join(''));

  renderFinanceFixedColumn('constr-ep', rows.map((r) => ({
    label: r.label,
    bold: r.bold,
    color: r.bold ? '#166534' : '#334155',
    bg: r.bold ? '#f0fdf4' : '#fff',
  })));
  setHtml('constr-ep-tfoot', '');
  return data;
}

function renderConstructionGF(epData) {
  if (!$('constr-fin-planilla-head')) return;
  const labels = getCostMonthLabels();
  const monthCount = getCostMonthCount();
  const cfg = getGlobalFinancialParams();
  const tasaMensual = (cfg.tasa_construccion / 100) / 12;
  const timbrePct = cfg.pct_timbres / 100;

  const giros = epData ? epData.totalPago.slice() : createMonthlyArray(monthCount, 0);
  const pctAlzamiento = toNumber(state.financiamiento.pct_alzamiento ?? 90) / 100;
  // Escrituración income al 100% del valor de la propiedad (para alzamiento)
  const totalesVentas = getTotalSalesMetrics();
  const { escrituras: escriturasArr } = getPromesasEscrituracionUnidades(monthCount);
  const escrituracionIncome100 = escriturasArr.map((u) => u * totalesVentas.precioPromedio);

  const pagosLinea = createMonthlyArray(monthCount, 0);
  const acumulado = createMonthlyArray(monthCount, 0);
  const interesMensual = createMonthlyArray(monthCount, 0);
  const impTimbres = createMonthlyArray(monthCount, 0);

  let prevAcum = 0;
  for (let t = 0; t < monthCount; t += 1) {
    const g = toNumber(giros[t]);
    impTimbres[t] = g * timbrePct;
    // Pago línea = % alzamiento × escrituración 100% del mes anterior
    const prevEscrit = t > 0 ? toNumber(escrituracionIncome100[t - 1]) : 0;
    let pago = pctAlzamiento * prevEscrit;
    const newAcum = prevAcum + g - pago;
    if (newAcum < 0) pago = Math.max(0, prevAcum + g); // no superar deuda
    pagosLinea[t] = -pago;
    acumulado[t] = prevAcum + g + pagosLinea[t];
    interesMensual[t] = acumulado[t] * tasaMensual;
    prevAcum = acumulado[t];
  }

  setHtml('constr-fin-planilla-head', `
    <tr>
      <th style="width:60px;text-align:center">ƒx</th>
      <th class="finance-total-col" style="width:110px;text-align:right">Total</th>
      ${labels.map((l) => `<th data-month-col>${escapeHtml(l)}</th>`).join('')}
    </tr>
  `);

  const total = (arr) => arr.reduce((a, b) => a + toNumber(b), 0);
  const rows = [
    { label: 'GIROS (desde EP)', values: giros, formula: 'GIROS(t) = TOTAL_A_PAGO_c_IVA(t)  [conectado a tabla EP]', color: '#22c55e' },
    { label: 'ACUMULADO', values: acumulado, formula: 'ACUMULADO(t) = ACUMULADO(t−1) + GIROS(t) + PAGOS_LINEA(t)', bold: true, color: '#0f172a' },
    { label: `INTERÉS (${cfg.tasa_construccion}% anual)`, values: interesMensual, formula: `INTERÉS(t) = ACUMULADO(t) × ${cfg.tasa_construccion}%/12`, color: '#f59e0b' },
    { label: `IMP. TIMBRES (${cfg.pct_timbres}%)`, values: impTimbres, formula: `IMP_TIMBRES(t) = GIROS(t) × ${cfg.pct_timbres}%`, color: '#f59e0b' },
  ];

  setHtml('constr-fin-planilla-tbody', rows.map((r) => {
    const popId = `fpop-gf-${Math.random().toString(36).slice(2, 8)}`;
    const bg = r.bold ? 'background:#f8fafc' : '';
    return `
      <tr class="${r.bold ? 'finance-total-row' : ''}" style="${bg}">
        <td style="text-align:center;position:relative" class="formula-host">
          <button type="button" onclick="toggleFormulaPop('${popId}', event)" style="background:none;border:1px solid #cbd5e1;color:#3b82f6;border-radius:4px;padding:1px 6px;font-size:10px;cursor:pointer">ƒx</button>
          <div id="${popId}" class="formula-pop" style="display:none;position:absolute;z-index:50;left:0;top:100%;margin-top:4px;background:#0f172a;color:#fff;border-radius:8px;padding:10px 12px;min-width:260px;max-width:360px;text-align:left;box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:11px">
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;margin-bottom:4px">Fórmula</div>
            <div style="font-family:'Courier New',monospace;background:#1e293b;padding:6px 8px;border-radius:6px">${escapeHtml(r.formula)}</div>
          </div>
        </td>
        <td class="finance-total-col" style="text-align:right;font-weight:${r.bold ? 800 : 600};color:${r.color}">${fmtUf(total(r.values))}</td>
        ${r.values.map((v) => `<td data-month-cell style="text-align:center;color:#334155;${r.bold ? 'font-weight:700' : ''}">${fmtTableAmount(v, { kind: 'income' })}</td>`).join('')}
      </tr>`;
  }).join(''));

  renderFinanceFixedColumn('constr-fin-planilla', rows.map((r) => ({
    label: r.label,
    bold: r.bold,
    color: r.color,
    bg: r.bold ? '#f8fafc' : '#fff',
  })));
  setHtml('constr-fin-planilla-tfoot', '');
}

function onConfigParamChange() {
  if (!state.proyecto) return;
  const fields = [
    ['cfg-tasa-terreno', 'tasa_interes_terreno'],
    ['cfg-tasa-construccion', 'tasa_interes_construccion'],
    ['cfg-pct-timbres', 'pct_timbres'],
    ['cfg-pct-ceec', 'pct_ceec'],
    ['cfg-pct-renta', 'pct_impuesto_renta'],
  ];
  fields.forEach(([inputId, field]) => {
    const el = $(inputId);
    if (el) state.proyecto[field] = toNumber(el.value);
  });
  // Propagar tasas a financiamiento legacy
  state.financiamiento.credito_terreno_tasa = toNumber(state.proyecto.tasa_interes_terreno);
  state.financiamiento.linea_construccion_tasa = toNumber(state.proyecto.tasa_interes_construccion);
  scheduleAutosave('proyecto');
  scheduleAutosave('terreno');
  scheduleAutosave('costos');
  renderConstruccion();
  if (typeof renderTerrainModule === 'function') renderTerrainModule();
  if (typeof renderProjectCashflow === 'function') renderProjectCashflow();
}
window.onConfigParamChange = onConfigParamChange;

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
          onClick(event, legendItem, legend) {
            const chart = legend.chart;
            const datasetIndex = legendItem.datasetIndex;
            if (typeof datasetIndex !== 'number') return;
            const meta = chart.getDatasetMeta(datasetIndex);
            meta.hidden = meta.hidden === null ? !chart.data.datasets[datasetIndex].hidden : null;
            chart.update();
          },
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

  // Terreno: patrón unificado GIROS / ACUMULADO / INTERÉS / TIMBRES con fórmulas visibles
  if (sourceType === 'terreno') {
    const labels = getCostMonthLabels();
    const monthCount = getCostMonthCount();
    const cfg = getGlobalFinancialParams();
    const tasaTerreno = toNumber(state.financiamiento.credito_terreno_tasa);
    const tasaMensual = (tasaTerreno / 100) / 12;
    const timbrePct = cfg.pct_timbres / 100;

    const terrainBase = getTerrainBaseCost();
    const approved = state.financiamiento.credito_terreno_activo
      ? terrainBase * toNumber(state.financiamiento.credito_terreno_pct) / 100
      : 0;
    // Giro: mismo mes de compra de terreno (desde Gantt)
    const terrainPurchaseMonth = Math.min(monthCount - 1, Math.max(0, toNumber(getTerrainMilestone()?.inicio || 0)));
    // Pago línea: mismo mes del anticipo de construcción (mes antes del inicio de obra)
    const anticipoLineaMonth = Math.max(0, Math.min(monthCount - 1, getConstructionStartMonth() - 1));

    const giros = createMonthlyArray(monthCount, 0);
    giros[terrainPurchaseMonth] = approved;

    const pagosLinea = createMonthlyArray(monthCount, 0);
    pagosLinea[anticipoLineaMonth] = -approved;

    const acumulado = createMonthlyArray(monthCount, 0);
    const impTimbres = createMonthlyArray(monthCount, 0);
    let prevAcum = 0;
    // Pass 1: acumulado de capital
    for (let t = 0; t < monthCount; t += 1) {
      impTimbres[t] = toNumber(giros[t]) * timbrePct;
      acumulado[t] = prevAcum + toNumber(giros[t]) + toNumber(pagosLinea[t]);
      prevAcum = acumulado[t];
    }
    // Pass 2: interés anual — se paga en el aniversario del giro (o al cierre anticipado)
    const interesAnual = createMonthlyArray(monthCount, 0);
    let accrued = 0;
    for (let t = 0; t < monthCount; t += 1) {
      accrued += Math.max(0, acumulado[t]) * tasaMensual;
      const monthsSinceGiro = t - terrainPurchaseMonth;
      const isAnniversary = monthsSinceGiro > 0 && monthsSinceGiro % 12 === 0;
      const isCreditPaidOff = acumulado[t] <= 0 && t > 0 && acumulado[t - 1] > 0;
      if ((isAnniversary || isCreditPaidOff) && accrued > 0) {
        interesAnual[t] = accrued;
        accrued = 0;
      }
    }
    if (accrued > 0) interesAnual[monthCount - 1] += accrued;

    setHtml('terreno-fin-planilla-head', `
      <tr>
        <th style="width:60px;text-align:center">ƒx</th>
        ${labels.map((l) => `<th data-month-col>${escapeHtml(l)}</th>`).join('')}
      </tr>
    `);

    // Buscar índices en GASTOS FINANCIEROS para habilitar Plan de pago en GIROS y PAGO LINEA
    const gfCategory = ensureCostosState().find((item) => item.nombre === 'GASTOS FINANCIEROS');
    const gfPartidas = gfCategory?.partidas || [];
    const gfLineaIdx = gfPartidas.findIndex((p) => /Terreno.*Linea aprobada/i.test(p.nombre || ''));
    const gfPagoIdx = gfPartidas.findIndex((p) => /Terreno.*Pago de linea/i.test(p.nombre || ''));
    const makeGfPlanBtn = (idx, label) => idx >= 0
      ? `<button type="button" title="Plan de pago: ${label}" onclick="openPaymentPlanModal('GASTOS FINANCIEROS',${idx})" style="font-size:9px;padding:1px 5px;background:#eff6ff;border:1px solid #93c5fd;color:#1d4ed8;border-radius:3px;cursor:pointer;flex-shrink:0">plan</button>`
      : '';

    const rows = [
      { label: 'GIROS', values: giros, formula: `GIROS = % línea × Costo terreno · desembolso en mes compra`, color: '#22c55e', actionHtml: makeGfPlanBtn(gfLineaIdx, 'Giro línea terreno') },
      { label: 'PAGO LÍNEA', values: pagosLinea, formula: `PAGO_LÍNEA(t) = pago al vencimiento del plazo de la línea de terreno`, color: '#ef4444', actionHtml: makeGfPlanBtn(gfPagoIdx, 'Pago de línea terreno') },
      { label: 'ACUMULADO', values: acumulado, formula: 'ACUMULADO(t) = ACUMULADO(t−1) + GIROS(t) + PAGOS_LINEA(t)', bold: true, color: '#0f172a' },
      { label: `INTERÉS ANUAL (${tasaTerreno}%)`, values: interesAnual, formula: `Acumulado anual de interés · pagado en aniversario del giro o al cierre anticipado`, color: '#f59e0b' },
      { label: `IMP. TIMBRES (${cfg.pct_timbres}%)`, values: impTimbres, formula: `IMP_TIMBRES(t) = GIROS(t) × ${cfg.pct_timbres}%`, color: '#f59e0b' },
    ];

    setHtml('terreno-fin-planilla-tbody', rows.map((r) => {
      const popId = `fpop-tf-${Math.random().toString(36).slice(2, 8)}`;
      const bg = r.bold ? 'background:#f8fafc' : '';
      return `
        <tr class="${r.bold ? 'finance-total-row' : ''}" style="${bg}">
          <td style="text-align:center;position:relative" class="formula-host">
            <button type="button" onclick="toggleFormulaPop('${popId}', event)" style="background:none;border:1px solid #cbd5e1;color:#3b82f6;border-radius:4px;padding:1px 6px;font-size:10px;cursor:pointer">ƒx</button>
            <div id="${popId}" class="formula-pop" style="display:none;position:absolute;z-index:50;left:0;top:100%;margin-top:4px;background:#0f172a;color:#fff;border-radius:8px;padding:10px 12px;min-width:260px;max-width:360px;text-align:left;box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:11px">
              <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;margin-bottom:4px">Fórmula</div>
              <div style="font-family:'Courier New',monospace;background:#1e293b;padding:6px 8px;border-radius:6px">${escapeHtml(r.formula)}</div>
            </div>
          </td>
          ${r.values.map((v) => `<td data-month-cell style="text-align:center;color:#334155;${r.bold ? 'font-weight:700' : ''}">${fmtTableAmount(v, { kind: 'income' })}</td>`).join('')}
        </tr>`;
    }).join(''));

    renderFinanceFixedColumn('terreno-fin-planilla', rows.map((r) => ({
      label: r.label,
      bold: r.bold,
      color: r.color,
      bg: r.bold ? '#f8fafc' : '#fff',
      actionHtml: r.actionHtml || '',
    })));
    setHtml('terreno-fin-planilla-tfoot', '');
    return;
  }

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
          <div class="formula-chip-cell is-clickable" onclick="openCostFormulaModal('GASTOS FINANCIEROS', ${partida._costIndex})" title="Click para editar la fórmula">
            ${renderFormulaChipsForCell(partida, false)}
          </div>
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
    rows[index].fin = toNumber(rows[index].inicio) + targetDuration - 1;
    // Limpiar dependencia si apunta a una fila que ya no existe
    const depRef = rows[index].dependencia;
    if (depRef && !rows.some((r, i) => i !== index && String(r.nombre || '').trim() === depRef)) {
      rows[index].dependencia = '';
      rows[index].desfase = 0;
    }
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
      fin: 1 + targetDuration - 1,
    });
  }
  state.gantt = normalizeGanttRows(rows);
}

function getEstudiosMilestone() {
  return state.gantt.find((row) => /^Estudios$/i.test(String(row.nombre || '').trim()))
    || state.gantt.find((row) => /^(Estudios previos|Estudios y permisos|Estudios\/Permisos|Estudios\/permisos)$/i.test(String(row.nombre || '').trim()))
    || null;
}

function isBuildingApprovalMilestoneName(name) {
  return canonicalizeGanttName(name) === 'Aprobaci\u00f3n PE';
}

function getBuildingApprovalMilestone(rows = state.gantt) {
  return rows.find((row) => isBuildingApprovalMilestoneName(row.nombre)) || null;
}

function getConstructionStartFromPreventa() {
  const pctReq = toNumber(state.construccion?.pct_inicio_construccion ?? 25) / 100;
  const totalUnits = Math.max(1, getTotalCommercialUnits());
  const threshold = totalUnits * pctReq;
  const velocity = getVentasVelocitySettings();
  const velocidadPromesas = Math.max(0.01, toNumber(velocity.promesas));
  const promesaRow = state.gantt.find((r) => /^(Promesas|Inicio promesas)$/i.test(String(r.nombre || '').trim()));
  const inicioPromesas = toNumber(promesaRow?.inicio ?? 0);
  if (threshold <= 0) return inicioPromesas;
  const monthsNeeded = Math.ceil(threshold / velocidadPromesas);
  return inicioPromesas + monthsNeeded;
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
    dependencia: baseRow.dependencia || null,
    dependencia_tipo: baseRow.dependencia_tipo || 'fin',
    desfase: toNumber(baseRow.desfase),
    inicio: indexSafeNumber(baseRow.inicio, 0),
    duracion: Math.max(1, toNumber(baseRow.duracion || 1)),
    fin: indexSafeNumber(baseRow.inicio, 0) + Math.max(1, toNumber(baseRow.duracion || 1)) - 1,
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

function syncSalesDrivenMilestones() {
  const approvalName = 'Aprobaci\u00f3n PE';
  const velocity = getVentasVelocitySettings();
  const preventaUnits = Math.max(0, getPreventaUnitsTotal());
  const promiseDuration = Math.max(1, Math.ceil(preventaUnits / Math.max(1, velocity.promesas)));
  let escrituraDuration = 1;
  const rows = Array.isArray(state.gantt) ? state.gantt.map((row) => ({ ...row })) : [];

  const ensureMilestone = (matcher, buildRow) => {
    const index = rows.findIndex((row) => matcher.test(String(row.nombre || '').trim()));
    const baseRow = index >= 0 ? rows[index] : {};
    const nextRow = buildRow(baseRow);
    if (index >= 0) rows[index] = nextRow;
    else rows.push(nextRow);
    return nextRow;
  };

  const terrainMilestone = rows.find((row) => /^Compra terreno$/i.test(String(row.nombre || '').trim()))
    || getTerrainMilestone()
    || rows.find((row) => /ADQUISICION DE TERRENO|COMPRA DE TERRENO|TERRENO/i.test(String(row.nombre || '').trim()));
  const estudiosMilestone = rows.find((row) => /^(Estudios|Estudios previos|Estudios y permisos)$/i.test(String(row.nombre || '').trim()));
  // Promesas parte el mes siguiente al fin de la aprobacion del proyecto de edificacion.
  // El +1 viene de normalizeGanttRows con dependencia_tipo 'fin'; desfase queda bloqueado en 0.
  let buildingApprovalRow = getBuildingApprovalMilestone(rows);
  if (!buildingApprovalRow) {
    buildingApprovalRow = {
      id: '',
      nombre: approvalName,
      color: '#64748b',
      dependencia: estudiosMilestone?.nombre || terrainMilestone?.nombre || '',
      dependencia_tipo: 'fin',
      desfase: 0,
      inicio: 0,
      duracion: 1,
      fin: 0,
    };
    rows.push(buildingApprovalRow);
  }
  const promiseDependency = buildingApprovalRow.nombre;
  const promiseDesfase = 0;

  const promiseRow = ensureMilestone(/^(Promesas|Inicio promesas)$/i, (baseRow) => ({
    id: baseRow.id || '',
    nombre: 'Promesas',
    color: baseRow.color || '#2563eb',
    dependencia: promiseDependency,
    dependencia_tipo: 'fin',
    desfase: promiseDesfase,
    inicio: toNumber(baseRow.inicio),
    duracion: promiseDuration,
    fin: toNumber(baseRow.inicio) + promiseDuration - 1,
  }));

  // Actualizar gantt temporalmente para que getConstructionStartFromPreventa use inicio_promesas correcto
  state.gantt = normalizeGanttRows(rows);

  const constructionRow = getConstructionMilestone() || rows.find((row) => /CONSTRUCCI[ÓO]N/i.test(String(row.nombre || '').trim()));
  const defaultReceptionStart = constructionRow ? toNumber(constructionRow.fin) + 1 : 1;
  const receptionRow = ensureMilestone(/^Recepción municipal$/i, (baseRow) => ({
    id: baseRow.id || '',
    nombre: 'Recepción municipal',
    color: baseRow.color || '#0ea5e9',
    dependencia: baseRow.dependencia || null,
    dependencia_tipo: baseRow.dependencia_tipo || 'fin',
    desfase: toNumber(baseRow.desfase),
    inicio: indexSafeNumber(baseRow.inicio, defaultReceptionStart),
    duracion: Math.max(1, toNumber(baseRow.duracion || 1)),
    fin: 0,
  }));

  const escrituraRow = ensureMilestone(/^Escrituración$/i, (baseRow) => ({
    id: baseRow.id || '',
    nombre: 'Escrituración',
    color: baseRow.color || '#f97316',
    dependencia: baseRow.dependencia || 'Recepción municipal',
    dependencia_tipo: baseRow.dependencia_tipo || 'fin',
    desfase: toNumber(baseRow.desfase),
    inicio: toNumber(baseRow.inicio),
    duracion: escrituraDuration,
    fin: 0,
  }));

  escrituraRow.dependencia = 'Recepci\u00f3n municipal';
  escrituraRow.dependencia_tipo = 'fin';
  escrituraRow.desfase = 0;
  state.gantt = normalizeGanttRows(rows);
  const normalizedPromise = state.gantt.find((row) => /^(Promesas|Inicio promesas)$/i.test(String(row.nombre || '').trim())) || promiseRow;
  const normalizedEscritura = state.gantt.find((row) => /^Escrituraci[óo]n$/i.test(String(row.nombre || '').trim())) || escrituraRow;
  escrituraDuration = calculateEscrituraDurationWithPromiseCap(normalizedEscritura.inicio, normalizedPromise.inicio);
  const escrituraIndex = rows.findIndex((row) => /^Escrituraci[óo]n$/i.test(String(row.nombre || '').trim()));
  if (escrituraIndex >= 0) rows[escrituraIndex].duracion = escrituraDuration;

  // Construcción: si el usuario NO definió dependencia manual, se usa el cálculo
  // automático desde % de promesas acumuladas. Si SÍ tiene dependencia manual,
  // se respeta y normalizeGanttRows calculará el inicio.
  const constrIdx = rows.findIndex((r) => /CONSTRUCCI[ÓO]N/i.test(String(r.nombre || '').trim()));
  if (constrIdx >= 0) {
    const existingDep = String(rows[constrIdx].dependencia || '').trim();
    const depExists = existingDep && rows.some((r, i) => i !== constrIdx && String(r.nombre || '').trim() === existingDep);
    if (!depExists) {
      // Sin dependencia válida: usar cálculo automático desde preventa%
      const constrStart = getConstructionStartFromPreventa();
      rows[constrIdx] = {
        ...rows[constrIdx],
        dependencia: '',
        desfase: 0,
        inicio: constrStart,
        fin: constrStart + Math.max(1, toNumber(rows[constrIdx].duracion)) - 1,
      };
    }
    // Con dependencia manual válida: no tocar — normalizeGanttRows hace el resto
  }

  state.gantt = normalizeGanttRows(rows);
  state.ventasCronograma = (state.ventasCronograma || []).map((row) => {
    if (isVentasCronogramaType(row, 'PREVENTA')) {
      return {
        ...row,
        vinculo_gantt: promiseRow.nombre,
        mes_inicio: 0,
        duracion: promiseDuration,
      };
    }
    if (isVentasCronogramaType(row, 'ESCRITURACION')) {
      return {
        ...row,
        vinculo_gantt: receptionRow.nombre,
        mes_inicio: 0,
        duracion: escrituraDuration,
      };
    }
    return row;
  });
}

function indexSafeNumber(value, fallback) {
  const parsed = toNumber(value);
  return parsed || parsed === 0 ? parsed : fallback;
}

function getGanttLockConfig(row) {
  const name = String(row?.nombre || '').trim();
  if (/^(Promesas|Inicio promesas)$/i.test(name)) return { fixed: true, name: true, dependency: true, start: true, duration: true, delete: true, drag: false, hint: 'Inicio ligado al mes siguiente del fin de Aprobacion del Proyecto de Edificacion; duracion calculada desde Ventas.' };
  if (/^Escrituraci(?:o|\u00f3)n$/i.test(name)) return { fixed: true, name: true, dependency: true, start: true, duration: true, delete: true, drag: false, hint: 'Inicio ligado al mes siguiente del fin de Recepcion municipal; duracion calculada desde Ventas con techo de promesas acumuladas.' };
  if (isBuildingApprovalMilestoneName(name)) return { fixed: true, name: true, dependency: false, start: false, duration: false, delete: true, drag: false, hint: 'Nombre protegido (referencia clave). Dependencia y fechas editables.' };
  // Filas clave: nombre y borrado bloqueados; dependencia, fechas y duración editables.
  if (/^Compra terreno$/i.test(name)) return { fixed: true, name: true, dependency: false, start: false, duration: false, delete: true, drag: false, hint: 'Nombre protegido (referencia clave). Dependencia y fechas editables.' };
  if (/^Construcci[óo]n$/i.test(name)) return { fixed: true, name: true, dependency: false, start: false, duration: true, delete: true, drag: false, hint: 'Nombre protegido. Duración viene de la hoja de Construcción.' };
  if (/^(Promesas|Inicio promesas)$/i.test(name)) return { fixed: true, name: true, dependency: false, start: false, duration: true, delete: true, drag: false, hint: 'Duración calculada desde la hoja Ventas.' };
  if (/^Recepci[óo]n municipal$/i.test(name)) return { fixed: true, name: true, dependency: false, start: false, duration: false, delete: true, drag: false, hint: 'Nombre protegido (referencia clave). Dependencia y fechas editables.' };
  if (/^Escrituraci[óo]n$/i.test(name)) return { fixed: true, name: true, dependency: false, start: false, duration: true, delete: true, drag: false, hint: 'Duración calculada desde Ventas con techo de promesas acumuladas.' };
  return { fixed: false, name: true, dependency: false, start: false, duration: false, delete: false, drag: false, hint: 'Nombre bloqueado para evitar romper dependencias; usa este hito auxiliar para controlar costos o fechas.' };
}

function getPartidaFormulaText(partida) {
  if (partida.auto_origen) return partida.formula_display || 'extraido';
  if (partida.formula_tipo === 'expr') return partida.formula_referencia || '';
  if (partida.formula_tipo === 'manual') return partida.formula_valor ? String(partida.formula_valor) : '';
  return partida.formula_referencia || partida.formula_tipo || '';
}

function mapLegacyCategoryName(name, partidaName = '') {
  if (COST_CATEGORY_ORDER.includes(name)) return name;
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
  const proyecto = normalizeProject(state.proyecto);
  const construccionMetrics = getConstructionMetrics();
  const accessorySales = getAccessorySalesConfig();
  const salesMetrics = getTotalSalesMetrics();
  const totalInterior = state.cabida.reduce((sum, row) => sum + (toNumber(row.sup_interior) * toNumber(row.cantidad)), 0);
  const totalTerrazas = state.cabida.reduce((sum, row) => sum + (toNumber(row.sup_terrazas) * toNumber(row.cantidad)), 0);
  const totalUnidades = state.cabida.reduce((sum, row) => sum + toNumber(row.cantidad), 0);
  const totalTerrenoCalculado = toNumber(proyecto.terreno_m2_neto) * toNumber(proyecto.terreno_precio_uf_m2);
  return {
    meses_construccion: getConstructionDuration(),
    m2_utiles: getUsefulMunicipalAreaTotal(),
    m2_municipales: getUsefulMunicipalAreaTotal(),
    m2_comunes: getCommonAreaTotal(),
    m2_interior_total: totalInterior,
    m2_terrazas_total: totalTerrazas,
    m2_sobre_cota_0: getAboveGradeAreaTotal(),
    m2_subterraneo: construccionMetrics.sup_bajo_tierra,
    m2_losa_total: construccionMetrics.sup_total,
    m2_vendible_deptos: state.cabida.reduce((sum, row) => sum + (getSellableAreaPerUnit(row.sup_interior, row.sup_terrazas) * toNumber(row.cantidad)), 0),
    unidades_totales: totalUnidades,
    terreno_m2_bruto: toNumber(proyecto.terreno_m2_bruto),
    terreno_m2_afectacion: toNumber(proyecto.terreno_m2_afectacion),
    terreno_m2_neto: toNumber(proyecto.terreno_m2_neto),
    terreno_precio_uf_m2: toNumber(proyecto.terreno_precio_uf_m2),
    terreno_total_calculado: totalTerrenoCalculado,
    construccion_uf_m2_sobre_tierra: toNumber(construccionMetrics.costo_uf_m2_sobre_tierra),
    construccion_uf_m2_bajo_tierra: toNumber(construccionMetrics.costo_uf_m2_bajo_tierra),
    construccion_uf_m2_promedio: toNumber(construccionMetrics.uf_prom),
    precio_promedio_unidad: toNumber(salesMetrics.precioPromedio),
    precio_estacionamiento: toNumber(accessorySales.precio_estacionamiento),
    precio_bodega: toNumber(accessorySales.precio_bodega),
    ventas_totales: toNumber(salesMetrics.total),
    ventas_totales_deptos: toNumber(salesMetrics.totalDeptos),
    ventas_totales_accesorios: toNumber(salesMetrics.totalAccesorios),
    total_construccion: construccionMetrics.total_neto,
    total_terreno: terrenoBase,
    ventas_brutas: toNumber(state.calculos.ventas_brutas),
  };
}
function convertSiToTernary(expression) {
  let result = String(expression || '');
  let iterations = 0;
  while (iterations++ < 20) {
    const match = result.match(/\bSI\s*\(/i);
    if (!match) break;
    const openParenIdx = match.index + match[0].length - 1;
    const args = [];
    let depth = 1;
    let argStart = openParenIdx + 1;
    let i = openParenIdx + 1;
    while (i < result.length && depth > 0) {
      const c = result[i];
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) { args.push(result.slice(argStart, i).trim()); break; }
      } else if (c === ',' && depth === 1) {
        args.push(result.slice(argStart, i).trim());
        argStart = i + 1;
      }
      i++;
    }
    if (args.length >= 2) {
      const [cond, valTrue, valFalse = '0'] = args;
      result = result.slice(0, match.index) + `((${cond}) ? (${valTrue}) : (${valFalse}))` + result.slice(i + 1);
    } else {
      break;
    }
  }
  return result;
}

function evaluateExpressionFormula(expression, context) {
  if (!expression) return 0;
  let normalized = convertSiToTernary(String(expression));
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
  // Permite operadores de comparación y ternario además de aritméticos
  expr = expr.replace(/[^0-9+\-*/(). ,<>=!?:]/g, '');
  if (!expr.trim()) return 0;
  try {
    // eslint-disable-next-line no-new-func
    return Function(`"use strict"; return (${expr});`)();
  } catch {
    return 0;
  }
}

function buildMonthlyContext(monthIndex, monthCount) {
  const baseContext = buildCostContext();
  const { promesas, escrituras } = getPromesasEscrituracionUnidades(monthCount);
  const income = getProjectMonthlyIncome(monthCount);
  const totals = getTotalSalesMetrics();
  const settings = getGlobalPaymentSettings();
  const piePct = Math.min(100, Math.max(0, settings.pie_promesa_pct));
  const escrituraPct = Math.max(0, 100 - piePct);
  const pieUnidad = totals.precioPromedio * piePct / 100;
  const escrituraUnidad = totals.precioPromedio * escrituraPct / 100;
  const unidadesPromesa = toNumber(promesas[monthIndex]);
  const unidadesEscritura = toNumber(escrituras[monthIndex]);
  return {
    ...baseContext,
    unidades_promesadas_mes: unidadesPromesa,
    unidades_escrituradas_mes: unidadesEscritura,
    ingresos_promesa_mes: unidadesPromesa * pieUnidad,
    ingresos_escrituracion_mes: unidadesEscritura * escrituraUnidad,
    ingresos_mes: toNumber(income[monthIndex]),
    mes: monthIndex,
  };
}

function evaluateMonthlyExpressionFormula(expression, monthCount) {
  return Array.from({ length: monthCount }, (_, month) => {
    const ctx = buildMonthlyContext(month, monthCount);
    return toNumber(evaluateExpressionFormula(expression, ctx));
  });
}

function getMonthlyDistributionForPartida(partida, monthCount) {
  if (partida.formula_tipo === 'expr_mensual' && partida.formula_referencia) {
    const monthly = evaluateMonthlyExpressionFormula(partida.formula_referencia, monthCount);
    if (monthly.length < monthCount) {
      return [...monthly, ...Array(monthCount - monthly.length).fill(0)];
    }
    return monthly;
  }
  const total = evaluateCostPartida(partida, buildCostContext());
  return normalizeDistribution(partida.distribucion_mensual, total, partida.plan_pago);
}

function evaluateCostPartida(partida, context) {
  if (partida.auto_origen) return toNumber(partida.total_neto);
  if (partida.formula_tipo === 'expr') return evaluateExpressionFormula(partida.formula_referencia, context);
  if (partida.formula_tipo === 'expr_mensual') {
    const monthly = evaluateMonthlyExpressionFormula(partida.formula_referencia, getCostMonthCount());
    return monthly.reduce((a, b) => a + toNumber(b), 0);
  }
  if (partida.formula_tipo === 'manual') return toNumber(partida.formula_valor || partida.total_neto);
  if (partida.formula_tipo === 'pct_ventas' || partida.formula_tipo === 'pct_ventas_mensual') return toNumber(context.ventas_brutas) * toNumber(partida.formula_valor);
  if (partida.formula_tipo === 'curva_s') return toNumber(context.total_construccion);
  return toNumber(partida.total_neto);
}

function getProjectFinalMonth() {
  const ganttEnd = state.gantt.reduce((max, row) => Math.max(max, toNumber(row.fin), toNumber(row.inicio) + Math.max(1, toNumber(row.duracion || 1)) - 1), 0);
  const ventasEnd = state.ventasCronograma.reduce((max, row) => Math.max(max, toNumber(row.mes_inicio) + Math.max(1, toNumber(row.duracion || 1)) - 1), 0);
  const constructionEnd = getConstructionStartMonth() + getConstructionDuration() - 1;
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

  const autoRows = defaults.map((row) => ({
    id: '',
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
    const normalizedCategoryName = COST_CATEGORY_ORDER.includes(category.nombre)
      ? category.nombre
      : null;
    if (normalizedCategoryName && category.id && byCategory.get(normalizedCategoryName)) {
      byCategory.get(normalizedCategoryName).id = category.id;
    }
    (category.partidas || []).forEach((partida) => {
      const target = mapLegacyCategoryName(category.nombre, partida.nombre);
      const current = byCategory.get(target);
      current.partidas.push({
        ...partida,
        id: partida.id || makeClientId('cost'),
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
        ? buildFinancialCostRows(manualRows)
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

  // TERRENO, CONSTRUCCIÓN y GASTOS FINANCIEROS se gestionan en sus propias pestañas
  // y no se muestran en la planilla de costos general.
  // Sin embargo, sus total_neto SÍ se actualizan para que las fórmulas cruzadas funcionen.
  const HIDDEN_CATEGORIES = new Set(['TERRENO', 'CONSTRUCCIÓN', 'CONSTRUCCION', 'GASTOS FINANCIEROS']);
  categorias.forEach((categoria) => {
    if (!HIDDEN_CATEGORIES.has(String(categoria.nombre || '').toUpperCase().trim())) return;
    (categoria.partidas || []).forEach((partida) => {
      const t = evaluateCostPartida(partida, context);
      partida.total_neto = t;
      partida.distribucion_mensual = getMonthlyDistributionForPartida(partida, monthCount);
    });
  });

  setHtml('planilla-tbody', categorias.map((categoria) => {
    if (HIDDEN_CATEGORIES.has(String(categoria.nombre || '').toUpperCase().trim())) return '';
    const isCollapsed = Object.prototype.hasOwnProperty.call(collapsedState, categoria.nombre)
      ? !!collapsedState[categoria.nombre]
      : true;
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
      const distribucion = getMonthlyDistributionForPartida(partida, monthCount);
      partida.total_neto = total;
      partida.distribucion_mensual = distribucion;
      totalNeto += total;
      totalIva += partida.tiene_iva ? total * 0.19 : 0;
      categoryTotalNeto += total;
      categoryTotalIva += partida.tiene_iva ? total * 0.19 : 0;
      distribucion.forEach((value, monthIndex) => { monthlyTotals[monthIndex] += value; });
      distribucion.forEach((value, monthIndex) => { categoryMonthlyTotals[monthIndex] += value; });

      categoryRows.push(`
        <tr class="partida-row" data-cost-row data-category="${escapeHtml(categoria.nombre)}" data-index="${index}" data-cost-id="${escapeHtml(partida.id || '')}" ${rowReadOnly ? 'data-auto="1" data-readonly="1"' : 'draggable="true" ondragstart="startCostDrag(event)" ondragover="allowCostDrop(event)" ondrop="dropCostRow(event)" ondragend="endCostDrag(event)"'}>
          <td style="text-align:center">${rowReadOnly ? '' : `<span class="row-tools"><button class="btn-outline btn-delete-inline" type="button" title="Eliminar subpartida" onclick="removeCostPartida('${escapeHtml(categoria.nombre)}', ${index})">&times;</button><span class="drag-handle" title="Orden manual">&#8226;&#8226;&#8226;</span></span>`}</td>
          <td><input class="inp" data-field="nombre" value="${escapeHtml(partida.nombre || '')}" ${rowReadOnly ? 'disabled' : ''}/></td>
          <td style="text-align:center">
            <div class="formula-chip-cell ${rowReadOnly ? 'is-readonly' : 'is-clickable'}" ${rowReadOnly ? '' : `onclick="openCostFormulaModal('${escapeHtml(categoria.nombre)}', ${index})"`} title="${rowReadOnly ? 'Fórmula automática' : 'Click para editar la fórmula'}">
              ${renderFormulaChipsForCell(partida, rowReadOnly)}
            </div>
            <input type="hidden" class="cost-hidden-formula" data-field="formula" value="${escapeHtml(getPartidaFormulaText(partida))}"/>
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

function getProjectMonthlyCosts(includeFinancial = true) {
  const monthCount = getCostMonthCount();
  const monthly = createMonthlyArray(monthCount, 0);
  const context = buildCostContext();
  ensureCostosState().forEach((category) => {
    if (!includeFinancial && category.nombre === 'GASTOS FINANCIEROS') return;
    (category.partidas || []).forEach((partida) => {
      if (category.nombre === 'GASTOS FINANCIEROS' && /Linea aprobada|Pago de linea/i.test(partida.nombre || '')) return;
      const distribution = getMonthlyDistributionForPartida(partida, monthCount);
      distribution.forEach((value, index) => {
        if (index < monthly.length) monthly[index] += toNumber(value);
      });
    });
  });
  return monthly;
}

function getProjectMonthlyIncome(monthCount) {
  const income = createMonthlyArray(monthCount, 0);
  const totals = getTotalSalesMetrics();
  const settings = getGlobalPaymentSettings();
  const piePct = Math.min(100, Math.max(0, settings.pie_promesa_pct));
  const escrituraPct = Math.max(0, 100 - piePct);
  const cuotaMonths = Math.max(1, Math.round(toNumber(settings.pie_cuoton_pct) || 1));
  const pieUnidad = totals.precioPromedio * piePct / 100;
  const escrituraUnidad = totals.precioPromedio * escrituraPct / 100;
  const { promesas: promesasArr, escrituras: escriturasArr } = getPromesasEscrituracionUnidades(monthCount);

  Array.from({ length: monthCount }, (_, month) => {
    const unidadesPromesa = promesasArr[month];
    const unidadesEscritura = escriturasArr[month];
    const promesaTotal = unidadesPromesa * pieUnidad;
    if (settings.forma_pago_promesa === 'unico') {
      income[month] += promesaTotal;
    } else {
      const cuotaMensual = cuotaMonths ? promesaTotal / cuotaMonths : promesaTotal;
      for (let offset = 0; offset < cuotaMonths; offset += 1) {
        if (month + offset < income.length) income[month + offset] += cuotaMensual;
      }
    }
    income[month] += unidadesEscritura * escrituraUnidad;
  });
  return income;
}

function cumulativeSeries(values) {
  return values.reduce((acc, value, index) => {
    acc.push((acc[index - 1] || 0) + toNumber(value));
    return acc;
  }, []);
}

function renderProjectCashflow() {
  if (!$('flujo-tabla')) return;
  const monthCount = getCostMonthCount();
  const labels = getCostMonthLabels();
  const income = getProjectMonthlyIncome(monthCount);
  const costs = getProjectMonthlyCosts(false);
  const financialCosts = getProjectMonthlyCosts(true).map((value, index) => Math.max(0, value - costs[index]));
  const costsTotal = costs.map((v, i) => v + financialCosts[i]);

  // Flujo operativo bruto = Ingresos - Costos
  const flujoOperativoBruto = income.map((v, i) => v - costsTotal[i]);

  // IVA
  const ivaCredito = getMonthlyIvaCredito();
  const ivaDebito = getMonthlyIvaDebito(income);

  // Flujo antes de impuestos = operativo + iva_credito - iva_debito
  const flujoAntesImpuestos = flujoOperativoBruto.map((v, i) => v + toNumber(ivaCredito[i]) - toNumber(ivaDebito[i]));

  // PPM + Impuesto Renta
  const ppm = getMonthlyPPM(income);
  const impRenta = getMonthlyImpuestoRenta(flujoAntesImpuestos, income);

  // Flujo después de impuestos
  const flujoDespuesImpuestos = flujoAntesImpuestos.map((v, i) => v + toNumber(ppm[i]) + toNumber(impRenta[i]));

  const cumulative = cumulativeSeries(flujoDespuesImpuestos);
  const cumulativeBruto = cumulativeSeries(flujoOperativoBruto);
  const totalIncome = income.reduce((sum, value) => sum + value, 0);
  const totalCosts = costs.reduce((sum, value) => sum + value, 0);
  const totalFinancial = financialCosts.reduce((sum, value) => sum + value, 0);
  const totalFlujoBruto = flujoOperativoBruto.reduce((a, b) => a + b, 0);
  const totalFlujoAntes = flujoAntesImpuestos.reduce((a, b) => a + b, 0);
  const totalFlujoDespues = flujoDespuesImpuestos.reduce((a, b) => a + b, 0);
  const margin = totalFlujoDespues;
  const capitalNeed = Math.abs(Math.min(0, ...cumulative));
  const capitalNeedSin = Math.abs(Math.min(0, ...cumulativeBruto));
  const payback = cumulative.findIndex((value) => value >= 0);

  // TIR real (mensual → anual)
  const tirNetaAnual = irrAnualFromMensual(flujoDespuesImpuestos);
  const tirBrutaAnual = irrAnualFromMensual(flujoOperativoBruto);

  setText('flujo-margen-sin', fmtUf(totalFlujoBruto));
  setText('flujo-margen-sin-pct', `${fmtPct(totalIncome ? totalFlujoBruto / totalIncome * 100 : 0)} s/ventas`);
  setText('flujo-margen-con', fmtUf(margin));
  setText('flujo-margen-con-pct', `${fmtPct(totalIncome ? margin / totalIncome * 100 : 0)} s/ventas`);
  setText('flujo-k-sin', fmtUf(capitalNeedSin));
  setText('flujo-k-con', fmtUf(capitalNeed));
  setText('flujo-roe-sin', fmtPct(capitalNeedSin ? totalFlujoBruto / capitalNeedSin * 100 : 0));
  setText('flujo-roe-con', fmtPct(capitalNeed ? margin / capitalNeed * 100 : 0));
  setText('flujo-tir-sin', fmtPct(tirBrutaAnual * 100));
  setText('flujo-tir-con', fmtPct(tirNetaAnual * 100));
  setText('flujo-payback-sin', payback >= 0 ? formatTimelineMonthLabel(payback) : 'Sin recupero');
  setText('flujo-payback-con', payback >= 0 ? formatTimelineMonthLabel(payback) : 'Sin recupero');
  setText('flujo-leverage', `${fmtNumber(capitalNeed && totalIncome ? capitalNeed / totalIncome : 0, 2)}x`);

  setHtml('estructura-proyecto-list', [
    ['Ventas', totalIncome, '#16a34a'],
    ['Costos base', totalCosts, '#ef4444'],
    ['Gastos financieros', totalFinancial, '#f59e0b'],
    ['Margen neto', margin, '#2563eb'],
  ].map(([label, value, color]) => {
    const pct = totalIncome ? toNumber(value) / totalIncome * 100 : 0;
    return `<div class="dist-row"><div class="dist-label">${escapeHtml(label)}</div><div class="dist-bar-wrap"><div class="dist-bar" style="width:${Math.max(2, Math.min(100, Math.abs(pct)))}%;background:${color}"></div></div><div class="dist-pct">${fmtPct(pct)}</div></div>`;
  }).join(''));

  setHtml('flujo-tabla-header', `<tr><th style="text-align:left;min-width:220px">Concepto</th><th style="text-align:center;min-width:90px">Fórmula</th>${labels.map((label) => `<th>${escapeHtml(label)}</th>`).join('')}</tr>`);

  const rows = [
    { label: 'Ingresos (Ventas)', values: income, sign: '+', formula: 'SUMA(Ventas por mes)', refs: [{ label: 'Total ingresos', value: fmtUf(totalIncome) }] },
    { label: 'Costos base', values: costs.map((v) => -v), sign: '-', formula: 'SUMA(Costos proyecto sin gastos financieros)', refs: [{ label: 'Total costos', value: fmtUf(totalCosts) }] },
    { label: 'Gastos financieros', values: financialCosts.map((v) => -v), sign: '-', formula: 'Intereses + Timbres + Alzamiento', refs: [{ label: 'Total GF', value: fmtUf(totalFinancial) }] },
    { label: 'Flujo operativo bruto', values: flujoOperativoBruto, sign: '=', bold: true, formula: 'Ingresos - Costos - Gastos financieros', refs: [{ label: 'Total', value: fmtUf(totalFlujoBruto) }] },
    { label: 'IVA crédito', values: ivaCredito, sign: '+', formula: 'SUMA(Egresos con check IVA × 19%)', refs: [{ label: 'Total IVA crédito', value: fmtUf(ivaCredito.reduce((a, b) => a + b, 0)) }] },
    { label: 'IVA débito', values: ivaDebito.map((v) => -v), sign: '-', formula: 'Ventas escrituradas × 19%', refs: [{ label: 'Total IVA débito', value: fmtUf(ivaDebito.reduce((a, b) => a + b, 0)) }] },
    { label: 'Flujo antes de impuestos', values: flujoAntesImpuestos, sign: '=', bold: true, formula: 'Flujo operativo bruto + IVA crédito - IVA débito', refs: [{ label: 'Total', value: fmtUf(totalFlujoAntes) }] },
    { label: 'PPM', values: ppm, sign: '-', formula: '-1% × Ingresos escrituración / (1 + factor_IVA)', refs: [{ label: 'Total PPM', value: fmtUf(ppm.reduce((a, b) => a + b, 0)) }] },
    { label: 'Impuesto Renta', values: impRenta, sign: '-', formula: `-${getGlobalFinancialParams().pct_impuesto_renta}% × (Escrituras año × Valor prom. × Margen). Pago abril año siguiente`, refs: [{ label: 'Total Renta', value: fmtUf(impRenta.reduce((a, b) => a + b, 0)) }] },
    { label: 'Flujo después de impuestos', values: flujoDespuesImpuestos, sign: '=', bold: true, formula: 'Flujo antes de impuestos + PPM + Impuesto Renta', refs: [{ label: 'Total', value: fmtUf(totalFlujoDespues) }] },
    { label: 'Flujo acumulado', values: cumulative, sign: '∑', bold: true, formula: 'ACUMULADO(t) = ACUMULADO(t-1) + Flujo después impuestos(t)', refs: [] },
  ];

  setHtml('flujo-tabla-tbody', rows.map((row) => {
    const popId = `fpop-flow-${Math.random().toString(36).slice(2, 9)}`;
    const refsHtml = (row.refs || []).map((r) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:2px 0"><span style="color:#94a3b8">${escapeHtml(String(r.label))}</span><strong>${escapeHtml(String(r.value))}</strong></div>`).join('');
    const bgRow = row.bold ? 'background:#0f172a' : '';
    const sign = row.sign ? `<span style="color:#94a3b8;font-weight:600;margin-right:4px">${row.sign}</span>` : '';
    return `
      <tr style="${bgRow}">
        <td style="text-align:left;font-weight:${row.bold ? 800 : 600};color:${row.bold ? '#22c55e' : '#fff'}">${sign}${escapeHtml(row.label)}</td>
        <td style="text-align:center;position:relative" class="formula-host">
          <button type="button" onclick="toggleFormulaPop('${popId}', event)" style="background:none;border:1px solid #475569;color:#3b82f6;border-radius:4px;padding:1px 6px;font-size:10px;cursor:pointer">ƒx</button>
          <div id="${popId}" class="formula-pop" style="display:none;position:absolute;z-index:50;left:0;top:100%;margin-top:4px;background:#fff;color:#0f172a;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;min-width:260px;max-width:380px;text-align:left;box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:11px">
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Fórmula</div>
            <div style="font-family:'Courier New',monospace;background:#f1f5f9;padding:6px 8px;border-radius:6px;margin-bottom:6px">${escapeHtml(row.formula)}</div>
            ${refsHtml}
          </div>
        </td>
        ${row.values.map((value) => `<td style="text-align:center;color:${row.bold ? '#22c55e' : '#fff'}">${fmtTableAmount(value, { kind: 'income' })}</td>`).join('')}
      </tr>`;
  }).join(''));
}

function getCostFormulaCatalog() {
  const context = buildCostContext();
  const mesesPreventa = Math.max(0, ...getCronogramaByType('PREVENTA').map((row) => toNumber(row.duracion)));
  const mesesVenta = Math.max(0, ...getCronogramaByType('VENTA').map((row) => toNumber(row.duracion)));
  const mesesEscrituracion = Math.max(0, ...getCronogramaByType('ESCRITURACION').map((row) => toNumber(row.duracion)));
  const rawCatalog = [
    // Variables mensuales (se usan en expr_mensual, varían por mes)
    { label: 'Unidades promesadas mes', token: '_unidades_promesadas_mes', value: 0, unit: 'un' },
    { label: 'Unidades escrituradas mes', token: '_unidades_escrituradas_mes', value: 0, unit: 'un' },
    { label: 'Ingresos promesa mes', token: '_ingresos_promesa_mes', value: 0, unit: 'UF' },
    { label: 'Ingresos escrituracion mes', token: '_ingresos_escrituracion_mes', value: 0, unit: 'UF' },
    { label: 'Ingresos totales mes', token: '_ingresos_mes', value: 0, unit: 'UF' },
    // Alias convenientes
    { label: 'm2 construccion total', token: '_m2_construccion_total', value: context.m2_losa_total, unit: 'm2' },
    { label: 'Meses construccion (alias)', token: '_tiempo_construccion', value: context.meses_construccion, unit: 'mes' },
    { label: 'Meses construccion', token: '_meses_construccion', value: context.meses_construccion, unit: 'mes' },
    { label: 'Meses preventa (alias)', token: '_meses_preventa', value: mesesPreventa, unit: 'mes' },
    { label: 'Meses promesas', token: '_meses_promesas', value: mesesPreventa, unit: 'mes' },
    { label: 'Meses venta (alias)', token: '_meses_venta', value: mesesVenta, unit: 'mes' },
    { label: 'Meses escrituracion', token: '_meses_escrituracion', value: mesesEscrituracion, unit: 'mes' },
    { label: 'm2 utiles', token: '_m2_utiles', value: context.m2_utiles, unit: 'm2' },
    { label: 'm2 municipales', token: '_m2_municipales', value: context.m2_municipales, unit: 'm2' },
    { label: 'm2 comunes', token: '_m2_comunes', value: context.m2_comunes, unit: 'm2' },
    { label: 'm2 interior total', token: '_m2_interior_total', value: context.m2_interior_total, unit: 'm2' },
    { label: 'm2 terrazas total', token: '_m2_terrazas_total', value: context.m2_terrazas_total, unit: 'm2' },
    { label: 'm2 sobre cota 0', token: '_m2_sobre_cota_0', value: context.m2_sobre_cota_0, unit: 'm2' },
    { label: 'm2 subterraneo', token: '_m2_subterraneo', value: context.m2_subterraneo, unit: 'm2' },
    { label: 'm2 losa total', token: '_m2_losa_total', value: context.m2_losa_total, unit: 'm2' },
    { label: 'm2 vendible deptos', token: '_m2_vendible_deptos', value: context.m2_vendible_deptos, unit: 'm2' },
    { label: 'Terreno m2 bruto', token: '_terreno_m2_bruto', value: context.terreno_m2_bruto, unit: 'm2' },
    { label: 'Terreno m2 afectacion', token: '_terreno_m2_afectacion', value: context.terreno_m2_afectacion, unit: 'm2' },
    { label: 'Terreno m2 neto', token: '_terreno_m2_neto', value: context.terreno_m2_neto, unit: 'm2' },
    { label: 'Terreno precio UF/m2', token: '_terreno_precio_uf_m2', value: context.terreno_precio_uf_m2, unit: 'UF/m2' },
    { label: 'Terreno total calculado', token: '_terreno_total_calculado', value: context.terreno_total_calculado, unit: 'UF' },
    { label: 'Construccion UF/m2 sobre tierra', token: '_construccion_uf_m2_sobre_tierra', value: context.construccion_uf_m2_sobre_tierra, unit: 'UF/m2' },
    { label: 'Construccion UF/m2 bajo tierra', token: '_construccion_uf_m2_bajo_tierra', value: context.construccion_uf_m2_bajo_tierra, unit: 'UF/m2' },
    { label: 'Construccion UF/m2 promedio', token: '_construccion_uf_m2_promedio', value: context.construccion_uf_m2_promedio, unit: 'UF/m2' },
    { label: 'Unidades totales', token: '_unidades_totales', value: context.unidades_totales, unit: 'un' },
    { label: 'Precio promedio unidad', token: '_precio_promedio_unidad', value: context.precio_promedio_unidad, unit: 'UF/un' },
    { label: 'Precio estacionamiento', token: '_precio_estacionamiento', value: context.precio_estacionamiento, unit: 'UF/un' },
    { label: 'Precio bodega', token: '_precio_bodega', value: context.precio_bodega, unit: 'UF/un' },
    { label: 'Ventas totales', token: '_ventas_totales', value: context.ventas_totales, unit: 'UF' },
    { label: 'Ventas deptos', token: '_ventas_totales_deptos', value: context.ventas_totales_deptos, unit: 'UF' },
    { label: 'Ventas accesorios', token: '_ventas_totales_accesorios', value: context.ventas_totales_accesorios, unit: 'UF' },
    { label: 'Total construccion', token: '_total_construccion', value: context.total_construccion, unit: 'UF' },
    { label: 'Total terreno', token: '_total_terreno', value: context.total_terreno, unit: 'UF' },
    { label: 'Ventas brutas', token: '_ventas_brutas', value: context.ventas_brutas, unit: 'UF' },
    // Ingresos por tipo de venta (para calcular comisiones, gastos comerciales, etc.)
    { label: 'Ingresos promesas total', token: '_ingresos_promesas_total', value: (() => { const totals = getTotalSalesMetrics(); const settings = getGlobalPaymentSettings(); const piePct = Math.min(100, Math.max(0, settings.pie_promesa_pct)); const unidades = state.cabida.reduce((s, r) => s + toNumber(r.cantidad), 0); const promesaUnidad = totals.precioPromedio * piePct / 100; return unidades * promesaUnidad; })(), unit: 'UF' },
    { label: 'Ingresos escrituracion total', token: '_ingresos_escrituracion_total', value: (() => { const totals = getTotalSalesMetrics(); const settings = getGlobalPaymentSettings(); const piePct = Math.min(100, Math.max(0, settings.pie_promesa_pct)); const escrituraPct = Math.max(0, 100 - piePct); const unidades = state.cabida.reduce((s, r) => s + toNumber(r.cantidad), 0); return unidades * totals.precioPromedio * escrituraPct / 100; })(), unit: 'UF' },
    { label: 'Pct pie promesa', token: '_pct_pie_promesa', value: toNumber(getGlobalPaymentSettings().pie_promesa_pct), unit: '%' },
    { label: 'Pct escrituracion', token: '_pct_escrituracion', value: Math.max(0, 100 - toNumber(getGlobalPaymentSettings().pie_promesa_pct)), unit: '%' },
    ...COST_CATEGORY_ORDER.map((name) => ({
      label: `Total categoria ${name.toLowerCase()}`,
      token: `_total_categoria_${String(name).toLowerCase().replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}`,
      value: ((state.costos.find((item) => item.nombre === name)?.partidas || []).reduce((sum, partida) => sum + toNumber(partida.total_neto), 0)),
      unit: 'UF',
    })),
    // Referencias cruzadas a subpartidas individuales: _total_partida_<nombre_normalizado>
    ...state.costos.flatMap((cat) => (cat.partidas || []).map((p) => ({
      label: `Total partida ${String(p.nombre || '').toLowerCase()}`,
      token: `_total_partida_${String(p.nombre || '').toLowerCase().replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}`,
      value: toNumber(p.total_neto),
      unit: 'UF',
    }))),
    ...state.gantt.flatMap((row) => ([
      {
        label: `Inicio ${String(row.nombre || '').toLowerCase()}`,
        token: `_inicio_${String(row.nombre || '').toLowerCase().replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}`,
        value: toNumber(row.inicio),
        unit: 'mes',
      },
      {
        label: `Fin ${String(row.nombre || '').toLowerCase()}`,
        token: `_fin_${String(row.nombre || '').toLowerCase().replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}`,
        value: toNumber(row.fin),
        unit: 'mes',
      },
      {
        label: `Duracion ${String(row.nombre || '').toLowerCase()}`,
        token: `_duracion_${String(row.nombre || '').toLowerCase().replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}`,
        value: toNumber(row.duracion),
        unit: 'mes',
      },
    ])),
  ];
  const uniqueByToken = new Map();
  rawCatalog.forEach((entry) => {
    const key = String(entry.token || '').toLowerCase();
    if (key && !uniqueByToken.has(key)) uniqueByToken.set(key, entry);
  });
  return Array.from(uniqueByToken.values());
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

function formatFormulaCatalogValue(entry) {
  const value = toNumber(entry?.value);
  const unit = String(entry?.unit || '').trim();
  const decimals = ['m2', 'UF', 'UF/m2', 'UF/un'].includes(unit) ? 2 : 0;
  return unit ? `${fmtNumber(value, decimals)} ${unit}` : fmtNumber(value, decimals);
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
    return `<span class="formula-token reference" data-tech-token="${escapeHtml(match.token)}" title="${escapeHtml(`${match.label} = ${formatFormulaCatalogValue(match)}`)}">${escapeHtml(String(match.label || value).replace(/^_+/, ''))}</span>`;
  }
  if (/^[0-9.,]+$/.test(value)) return `<span class="formula-token number">${escapeHtml(value)}</span>`;
  return `<span class="formula-token">${escapeHtml(value.replace(/^_+/, ''))}</span>`;
}

function renderFormulaChipsForCell(partida, isReadOnly = false) {
  const rawValue = getPartidaFormulaText(partida);
  const value = String(rawValue || '').trim();
  if (!value) return '<span class="formula-chip-empty">Sin fórmula · click para editar</span>';
  const isAuto = !!partida?.auto_origen && !partida?.editable_source;
  const tokens = splitFormulaTokens(value);
  const chips = tokens.map((token) => renderFormulaToken(token, isAuto || isReadOnly)).join('');
  return `<div class="formula-chip-row">${chips}</div>`;
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
      : formulaType === 'expr_mensual'
        ? 'formula-status formula-status-mensual'
        : 'formula-status formula-status-expr';
  const statusText = isAuto
    ? 'Automatico'
    : formulaType === 'manual'
      ? 'Manual'
      : formulaType === 'expr_mensual'
        ? 'Formula mensual'
        : 'Formula';
  const note = isAuto
    ? 'Origen calculado automaticamente por el modelo.'
    : formulaType === 'manual'
      ? 'Monto fijo editable para esta subpartida.'
      : formulaType === 'expr_mensual'
        ? 'Formula calculada mes a mes con variables mensuales (unidades, ingresos). El total es la suma de todos los meses.'
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
  const resultEl = $('cost-formula-modal-result');
  const modeBadge = $('cost-formula-mode-badge');
  if (!input || !preview) return;
  const isAuto = !!input.dataset.auto;
  const rawValue = input.value || '';
  const parsed = parseFormulaInput(rawValue);
  const isMensual = !isAuto && parsed.formula_tipo === 'expr_mensual';
  preview.innerHTML = renderCostFormulaPreviewContent(
    rawValue,
    isAuto ? 'expr' : parsed.formula_tipo,
    isAuto
  );

  if (modeBadge) {
    modeBadge.textContent = isMensual ? 'MENSUAL ∑' : 'GLOBAL';
    modeBadge.className = `formula-mode-badge ${isMensual ? 'formula-mode-mensual' : 'formula-mode-global'}`;
  }

  if (resultEl) {
    try {
      if (rawValue && !isAuto) {
        let result;
        if (isMensual) {
          const monthly = evaluateMonthlyExpressionFormula(rawValue, getCostMonthCount());
          result = monthly.reduce((a, b) => a + toNumber(b), 0);
        } else {
          result = evaluateExpressionFormula(rawValue, buildCostContext());
        }
        resultEl.textContent = `= UF ${fmtNumber(result)}`;
        resultEl.style.color = '#0f172a';
      } else {
        resultEl.textContent = '= UF';
        resultEl.style.color = '#0f172a';
      }
    } catch (e) {
      resultEl.textContent = '= Error';
      resultEl.style.color = '#475569';
    }
  }
}

function renderCostFormulaOptions() {
  setHtml('cost-formula-refs', getCostFormulaCatalog().map((entry) => (
    `<option value="${escapeHtml(entry.token)}">${escapeHtml(entry.label)} (${escapeHtml(formatFormulaCatalogValue(entry))})</option>`
  )).join(''));
}

function toggleCostCategoryCollapse(categoryName) {
  const collapsedState = state.costosUi.collapsed || {};
  const currentValue = Object.prototype.hasOwnProperty.call(collapsedState, categoryName)
    ? !!collapsedState[categoryName]
    : true;
  state.costosUi.collapsed[categoryName] = !currentValue;
  renderCostosModule();
}

function setCostFlowMode(mode) {
  state.costosUi.costFlowMode = ['monthly', 'cumulative', 'both'].includes(mode) ? mode : 'both';
  renderCostosModule();
}

function scrollTableById(containerId, offset) {
  const container = $(containerId);
  if (!container) return;
  const scroller = container.querySelector?.('.finance-split-scroll') || container;
  scroller.scrollBy({ left: offset, behavior: 'smooth' });
}

function scrollCostPlanilla(offset) {
  scrollTableById('cost-planilla-scroll', offset);
}

function scrollFinancialPlanilla(containerId, offset) {
  scrollTableById(containerId, offset);
}

const FORMULA_REF_GROUPS = [
  {
    label: 'Variables mensuales',
    monthly: true,
    tokens: ['_unidades_promesadas_mes', '_unidades_escrituradas_mes', '_ingresos_promesa_mes', '_ingresos_escrituracion_mes', '_ingresos_mes'],
  },
  {
    label: 'm² Construcción',
    tokens: ['_m2_construccion_total', '_m2_losa_total', '_m2_utiles', '_m2_municipales', '_m2_sobre_cota_0', '_m2_subterraneo', '_m2_interior_total', '_m2_terrazas_total', '_m2_vendible_deptos'],
  },
  {
    label: 'Tiempo',
    tokens: ['_meses_construccion', '_meses_preventa', '_meses_escrituracion'],
  },
  {
    label: 'Precios y Unidades',
    tokens: ['_precio_promedio_unidad', '_precio_estacionamiento', '_precio_bodega', '_unidades_totales'],
  },
  {
    label: 'Ingresos globales',
    tokens: ['_ventas_totales', '_ventas_brutas', '_ingresos_promesas_total', '_ingresos_escrituracion_total', '_ventas_totales_deptos', '_ventas_totales_accesorios'],
  },
  {
    label: 'Terreno',
    tokens: ['_terreno_m2_bruto', '_terreno_m2_neto', '_terreno_precio_uf_m2', '_terreno_total_calculado', '_total_terreno'],
  },
  {
    label: 'Construcción',
    tokens: ['_total_construccion', '_construccion_uf_m2_sobre_tierra', '_construccion_uf_m2_bajo_tierra', '_construccion_uf_m2_promedio'],
  },
  {
    label: 'Porcentajes',
    tokens: ['_pct_pie_promesa', '_pct_escrituracion'],
  },
  {
    label: 'Categorías de costo',
    tokenPrefix: '_total_categoria_',
  },
  {
    label: 'Subpartidas individuales',
    tokenPrefix: '_total_partida_',
  },
];

function renderFormulaRefPanel() {
  const panel = $('cost-formula-ref-panel');
  if (!panel) return;
  const catalog = getCostFormulaCatalog();
  const catalogMap = new Map(catalog.map((e) => [e.token, e]));

  const html = FORMULA_REF_GROUPS.map((group, groupIdx) => {
    let entries;
    if (group.tokens) {
      entries = group.tokens.map((t) => catalogMap.get(t)).filter(Boolean);
    } else if (group.tokenPrefix) {
      entries = catalog.filter((e) => String(e.token || '').startsWith(group.tokenPrefix));
    } else {
      entries = [];
    }
    if (!entries.length) return '';

    const isMonthly = !!group.monthly;
    const itemsHtml = entries.map((entry) => {
      const shortLabel = String(entry.label || '').replace(/^Total (partida|categoria) /i, '');
      return `<button type="button" class="formula-ref-item" onmousedown="event.preventDefault(); insertCostFormulaReference($('cost-formula-modal-input'), '${escapeHtml(entry.token)}'); updateCostFormulaModalPreview(); autosaveCostFormulaModal()">
        <span class="ref-label" title="${escapeHtml(entry.label)}">${escapeHtml(shortLabel)}</span>
        ${isMonthly ? '<span class="ref-monthly-badge">∑mes</span>' : ''}
        <span class="ref-value">${escapeHtml(formatFormulaCatalogValue(entry))}</span>
      </button>`;
    }).join('');

    return `<div class="formula-ref-group">
      <button type="button" class="formula-ref-group-title" onclick="toggleFormulaRefGroup(${groupIdx})">
        <span>${escapeHtml(group.label)}</span>
        <span style="font-weight:400;color:#94a3b8">${entries.length}</span>
      </button>
      <div class="formula-ref-items" id="formula-ref-group-${groupIdx}"${groupIdx === 0 ? '' : ' style="display:none"'}>${itemsHtml}</div>
    </div>`;
  }).filter(Boolean).join('');

  panel.innerHTML = html || '<div style="padding:12px;font-size:11px;color:#94a3b8">Sin referencias disponibles</div>';
}

function toggleFormulaRefGroup(groupIdx) {
  const items = $(`formula-ref-group-${groupIdx}`);
  if (!items) return;
  items.style.display = items.style.display === 'none' ? '' : 'none';
}

function insertFormulaTemplate(type) {
  const input = $('cost-formula-modal-input');
  if (!input) return;
  const templates = { SI: 'SI(_ingresos_mes > 0, , 0)' };
  const template = templates[type];
  if (!template) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + template + input.value.slice(end);
  const cursorPos = start + template.indexOf(', ,') + 2;
  input.focus();
  input.setSelectionRange(cursorPos, cursorPos);
  input.dispatchEvent(new Event('input', { bubbles: true }));
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
  if (!input || !title || !subtitle) return;

  const formulaText = getPartidaFormulaText(partida);
  input.value = formulaText;
  const readOnlyAuto = !!partida.auto_origen && !partida.editable_source;
  input.dataset.auto = readOnlyAuto ? '1' : '';
  input.disabled = readOnlyAuto;
  title.textContent = `Fórmula · ${partida.nombre || 'Subpartida'}`;
  subtitle.textContent = readOnlyAuto
    ? 'Fórmula calculada automáticamente.'
    : 'Edita la fórmula. Los cambios se guardan automáticamente.';
  updateCostFormulaModalPreview();
  $('cost-formula-modal').style.display = 'flex';
  renderFormulaRefPanel();
}

function closeCostFormulaModal() {
  const wasActive = state.costosUi.activeFormulaCategory != null;
  state.costosUi.activeFormulaCategory = null;
  state.costosUi.activeFormulaIndex = null;
  const input = $('cost-formula-modal-input');
  if (input) {
    input.value = '';
    input.disabled = false;
    delete input.dataset.auto;
  }
  $('cost-formula-modal').style.display = 'none';
  if (wasActive && typeof renderCostosModule === 'function') {
    renderCostosModule();
  }
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

  panel.innerHTML = options.map((entry) => (
    `<button type="button" onmousedown="event.preventDefault(); pickCostFormulaSuggestion(this)" data-token="${escapeHtml(entry.token)}" data-tech-token="${escapeHtml(entry.token)}" data-input-id="${escapeHtml(input.id)}">${escapeHtml(entry.label)}<small>${escapeHtml(formatFormulaCatalogValue(entry))}</small></button>`
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

function applyQuickPaymentTemplate(templateType) {
  const category = state.costos.find((item) => item.nombre === state.costosUi.activePaymentCategory);
  const partida = category?.partidas?.[state.costosUi.activePaymentIndex];
  if (!partida) return;

  // Get first available Gantt reference for smart defaults
  const firstGanttStart = state.gantt[0] ? `START:${state.gantt[0].id || state.gantt[0].nombre}` : 'MANUAL_0';
  const firstGanttEnd = state.gantt[0] ? `END:${state.gantt[0].id || state.gantt[0].nombre}` : 'MANUAL_0';
  const escrituracionRow = state.gantt.find((r) => /escrit/i.test(r.nombre));
  const escrituracionEnd = escrituracionRow ? `END:${escrituracionRow.id || escrituracionRow.nombre}` : firstGanttEnd;

  let plan = { tramos: [], hitos: [] };

  switch (templateType) {
    case 'monto_unico':
      // 100% en un hito puntual (por defecto al inicio del proyecto)
      plan.hitos = [{ pct: 100, ref: 'MANUAL_0', offset: 0 }];
      break;

    case 'cuotas_meses':
      // 100% distribuido en cuotas durante N meses desde mes 0
      plan.tramos = [{ pct: 100, inicio_ref: 'MANUAL_0', inicio_offset: 0, fin_ref: 'MANUAL_0', fin_offset: 12 }];
      break;

    case 'cuotas_fechas':
      // 100% distribuido entre dos hitos del Gantt
      plan.tramos = [{ pct: 100, inicio_ref: firstGanttStart, inicio_offset: 0, fin_ref: escrituracionEnd, fin_offset: 0 }];
      break;

    case 'pagos_puntuales':
      // 3 pagos iguales en hitos específicos del Gantt
      plan.hitos = [
        { pct: 33, ref: 'MANUAL_0', offset: 0 },
        { pct: 33, ref: firstGanttEnd, offset: 0 },
        { pct: 34, ref: escrituracionEnd, offset: 0 },
      ];
      break;

    case 'inicial_cuotas':
      // Pago inicial (20%) + cuotas mensuales (80%)
      plan.hitos = [{ pct: 20, ref: 'MANUAL_0', offset: 0 }];
      plan.tramos = [{ pct: 80, inicio_ref: 'MANUAL_0', inicio_offset: 1, fin_ref: firstGanttEnd, fin_offset: 0 }];
      break;

    case 'final_cuotas':
      // Cuotas mensuales (80%) + pago final al cierre (20%)
      plan.tramos = [{ pct: 80, inicio_ref: 'MANUAL_0', inicio_offset: 0, fin_ref: escrituracionEnd, fin_offset: -1 }];
      plan.hitos = [{ pct: 20, ref: escrituracionEnd, offset: 0 }];
      break;

    case 'hito_pct':
      // Pagos contra hitos del Gantt (ejemplo: 3 hitos principales)
      {
        const ganttRows = state.gantt.slice(0, 3);
        const pctPerHito = ganttRows.length ? Math.floor(100 / ganttRows.length) : 100;
        const remainder = 100 - pctPerHito * (ganttRows.length - 1);
        plan.hitos = ganttRows.map((row, idx) => ({
          pct: idx === ganttRows.length - 1 ? remainder : pctPerHito,
          ref: `END:${row.id || row.nombre}`,
          offset: 0,
        }));
        if (!plan.hitos.length) plan.hitos = [{ pct: 100, ref: 'MANUAL_0', offset: 0 }];
      }
      break;

    default:
      return;
  }

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

function renderCapitalModule() {
  state.capital = normalizeCapital(state.capital);
  const bindings = [
    ['cap-buffer', 'caja_minima_buffer'],
    ['cap-proyeccion', 'proyeccion_meses'],
    ['cap-llamado-min', 'llamado_minimo'],
    ['cap-caja-fuerte', 'caja_fuerte_retencion'],
    ['cap-dev-min', 'devolucion_minima'],
  ];
  bindings.forEach(([inputId, field]) => {
    const input = $(inputId);
    if (input && !input.matches(':focus')) input.value = toNumber(state.capital[field]);
  });
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
  renderProjectCashflow();
  renderKpis();
  renderCapitalModule();
}

function prepareStateForSave({ includeCostos = true } = {}) {
  if (!state.proyectoId || !state.proyecto) return;

  if ($('cabida-editor')) {
    state.proyecto = normalizeProject(getCabidaProjectSettingsFromEditor());
    state.cabida = getCabidaRowsFromEditor().filter((row) => row.uso);
  }

  if ($('terreno-m2-bruto')) {
    state.proyecto = normalizeProject(readTerrenoProjectSettingsFromEditor());
    state.financiamiento = readTerrenoFinanciamientoFromEditor();
    state.proyecto = normalizeProject({
      ...state.proyecto,
      tasa_interes_terreno: toNumber(state.financiamiento.credito_terreno_tasa),
    });
  }

  if ($('constr-sup-st')) {
    state.construccion = readConstruccionFromEditor();
    state.financiamiento = readConstruccionFinanciamientoFromEditor();
    state.proyecto = normalizeProject({
      ...state.proyecto,
      tasa_interes_construccion: toNumber(state.financiamiento.linea_construccion_tasa),
    });
  }

  if ($('gantt-tbody')) state.gantt = readGanttEditor();
  syncTerrainPurchaseMilestone();
  syncConstructionMilestone(state.construccion?.plazo_meses || 1);

  if ($('ventas-tbody')) {
    state.ventasConfig = readVentasConfigEditor();
    state.ventasCronograma = readVentasCronogramaEditor();
  }
  syncSalesDrivenMilestones();

  if (includeCostos && $('planilla-table')) state.costos = readCostosEditor();
  if ($('cap-buffer')) state.capital = readCapitalFromEditor();
  state.proyecto = getProjectSavePayload();
}

async function finishSave({ silent = false } = {}) {
  state.sync.lastSavedAt = new Date().toISOString();
  if (silent) {
    setSyncStatus('ok', 'GUARDADO', `Ultima sync ${new Date().toLocaleTimeString()}`);
    return;
  }
  if (state.proyectoId) {
    state.calculos = await api(`/api/proyectos/${state.proyectoId}/calculos`).catch(() => state.calculos);
  }
  renderAll();
  await refreshHealthStatus();
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
    estacionamientos_sup_interior: 0,
    estacionamientos_sup_terrazas: 0,
    bodegas_cantidad: toNumber($('cabida-bodegas-cantidad')?.value),
    bodegas_sup_interior: 0,
    bodegas_sup_terrazas: 0,
  };
}

function readTerrenoProjectSettingsFromEditor() {
  const terrenoM2Bruto = toNumber($('terreno-m2-bruto')?.value);
  const terrenoM2Afectacion = toNumber($('terreno-m2-afectacion')?.value);
  const terrenoM2Neto = Math.max(0, terrenoM2Bruto - terrenoM2Afectacion);
  const terrenoPrecioUfM2 = toNumber($('terreno-precio-uf-m2')?.value);
  const terrenoPrecioTotal = terrenoM2Neto * terrenoPrecioUfM2;
  const tasaInteresTerreno = toNumber($('fin-terreno-tasa')?.value || state.proyecto?.tasa_interes_terreno);
  return {
    ...state.proyecto,
    compra_terreno_fecha: fromMonthInputValue($('terreno-fecha-compra')?.value || ''),
    terreno_m2_bruto: terrenoM2Bruto,
    terreno_m2_bruto_afecto: terrenoM2Bruto,
    terreno_m2_afectacion: terrenoM2Afectacion,
    terreno_m2_neto: terrenoM2Neto,
    terreno_precio_uf_m2: terrenoPrecioUfM2,
    terreno_precio_total: terrenoPrecioTotal,
    tasa_interes_terreno: tasaInteresTerreno,
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
    pct_alzamiento: toNumber($('fin-constr-alzamiento')?.value ?? state.financiamiento.pct_alzamiento ?? 90),
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
  renderProjectCashflow();
  scheduleAutosave('cabida');
  scheduleAutosave('ventas');
  scheduleAutosave('costos');
}

function onTerrenoInputChange() {
  state.proyecto = normalizeProject(readTerrenoProjectSettingsFromEditor());
  state.financiamiento = readTerrenoFinanciamientoFromEditor();
  state.proyecto = normalizeProject({
    ...state.proyecto,
    tasa_interes_terreno: toNumber(state.financiamiento.credito_terreno_tasa),
  });
  syncTerrainPurchaseMilestone();
  renderGanttEditor(state.gantt);
  renderTerrainModule();
  renderCostosModule();
  renderProjectCashflow();
  renderKpis();
  scheduleAutosave('terreno');
  scheduleAutosave('costos');
}

function readConstruccionFromEditor() {
  return normalizeConstruccion({
    ...state.construccion,
    sup_sobre_tierra: toNumber($('constr-sup-st')?.value),
    sup_bajo_tierra: toNumber($('constr-sup-bt')?.value),
    costo_uf_m2_sobre_tierra: toNumber($('constr-uf-st')?.value),
    pct_bajo_tierra_sobre_cota_0: toNumber($('constr-pct-bt')?.value),
    costo_uf_m2_bajo_tierra: toNumber($('constr-uf-bt')?.value),
    plazo_meses: Math.max(1, toNumber($('constr-plazo-meses')?.value || getConstructionDuration())),
    anticipo_pct: toNumber($('anticipo-slider')?.value),
    retencion_pct: toNumber($('retencion-slider')?.value),
    ancho_curva: state.construccion?.ancho_curva ?? 0.5,
    peak_gasto: state.construccion?.peak_gasto ?? 0.5,
    pct_inicio_construccion: toNumber($('constr-pct-inicio')?.value ?? state.construccion?.pct_inicio_construccion ?? 25),
  });
}

function updateConstrParams() {
  state.construccion = readConstruccionFromEditor();
  state.financiamiento = readConstruccionFinanciamientoFromEditor();
  syncConstructionMilestone(state.construccion.plazo_meses);
  syncSalesDrivenMilestones();
  renderGanttEditor(state.gantt);
  renderConstruccion();
  renderCostosModule();
  renderProjectCashflow();
  renderKpis();
  scheduleAutosave('construccion');
  scheduleAutosave('gantt');
  scheduleAutosave('costos');
}

function onGanttInputChange() {
  state.gantt = readGanttEditor();
  syncSalesDrivenMilestones();
  renderTerrainModule();
  renderGanttEditor(state.gantt);
  renderConstruccion();
  ensureVentasState();
  if ($('ventas-velocidad-promesas')) $('ventas-velocidad-promesas').value = getVentasVelocitySettings().promesas;
  if ($('ventas-velocidad-escrituracion')) $('ventas-velocidad-escrituracion').value = getVentasVelocitySettings().escrituracion;
  renderVentasSchedules();
  renderVentasSummaryCards();
  renderVentasCashflow();
  renderCostosModule();
  renderProjectCashflow();
  scheduleAutosave('gantt');
  scheduleAutosave('ventas');
  scheduleAutosave('costos');
}

function agregarHito() {
  const next = readGanttEditor();
  next.push({
    id: '',
    nombre: `Hito auxiliar ${next.length + 1}`,
    color: '#3b82f6',
    dependencia: null,
    dependencia_tipo: 'fin',
    desfase: 0,
    inicio: 0,
    duracion: 1,
    fin: 0,
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
  const paymentInputs = document.querySelector('[data-ventas-payment-global]');
  const globalPayment = {};
  if (paymentInputs) {
    paymentInputs.querySelectorAll('[data-field]').forEach((input) => {
      globalPayment[input.dataset.field] = input.dataset.field === 'forma_pago_promesa'
        ? String(input.value || 'unico')
        : toNumber(input.value);
    });
  }
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
    if (Object.keys(globalPayment).length) {
      if (globalPayment.pie_promesa_pct !== undefined) target.pie_promesa_pct = globalPayment.pie_promesa_pct;
      if (globalPayment.pie_cuotas_pct !== undefined) target.pie_cuotas_pct = globalPayment.pie_cuotas_pct;
      if (globalPayment.pie_cuoton_pct !== undefined) target.pie_cuoton_pct = globalPayment.pie_cuoton_pct;
      target.forma_pago_promesa = globalPayment.forma_pago_promesa || 'unico';
    }
  });
  return Array.from(map.values());
}

function readVentasCronogramaEditor() {
  const rows = [];
  const currentPromesasVelocidad = getVentasMetaRow('META_PROMESAS')?.velocidad;
  const currentEscrituracionVelocidad = getVentasMetaRow('META_ESCRITURACION')?.velocidad;
  const promesasInputRaw = String($('ventas-velocidad-promesas')?.value || '').trim();
  const escrituracionInputRaw = String($('ventas-velocidad-escrituracion')?.value || '').trim();
  const promesasVelocidad = promesasInputRaw === ''
    ? normalizeVentasVelocity(currentPromesasVelocidad, 54)
    : normalizeVentasVelocity(promesasInputRaw, normalizeVentasVelocity(currentPromesasVelocidad, 54));
  const escrituracionVelocidad = escrituracionInputRaw === ''
    ? normalizeVentasVelocity(currentEscrituracionVelocidad, 20)
    : normalizeVentasVelocity(escrituracionInputRaw, normalizeVentasVelocity(currentEscrituracionVelocidad, 20));

  // PREVENTA y ESCRITURACION se calculan desde la Carta Gantt y las velocidades.
  state.ventasCronograma
    .filter((row) => isVentasCronogramaType(row, 'PREVENTA') || isVentasCronogramaType(row, 'ESCRITURACION'))
    .forEach((row) => rows.push({ ...row }));

  rows.push({
    id: getVentasMetaRow('META_PROMESAS')?.id || '',
    tipo: 'META_PROMESAS',
    uso: 'GLOBAL',
    vinculo_gantt: null,
    mes_inicio: 0,
    duracion: 0,
    porcentaje: 0,
    velocidad: promesasVelocidad,
  });
  rows.push({
    id: getVentasMetaRow('META_ESCRITURACION')?.id || '',
    tipo: 'META_ESCRITURACION',
    uso: 'GLOBAL',
    vinculo_gantt: null,
    mes_inicio: 0,
    duracion: 0,
    porcentaje: 0,
    velocidad: escrituracionVelocidad,
  });
  return rows;
}

function onVentasInputChange() {
  state.ventasConfig = readVentasConfigEditor();
  state.ventasCronograma = readVentasCronogramaEditor();
  syncSalesDrivenMilestones();
  renderGanttEditor(state.gantt);
  renderVentasModule();
  renderCostosModule();
  renderProjectCashflow();
  scheduleAutosave('ventas');
  scheduleAutosave('gantt');
  scheduleAutosave('costos');
}

function onVentasVelocityChange() {
  state.ventasCronograma = readVentasCronogramaEditor();
  syncSalesDrivenMilestones();
  renderGanttEditor(state.gantt);
  renderVentasSchedules();
  renderVentasSummaryCards();
  renderVentasCashflow();
  renderCostosModule();
  renderProjectCashflow();
  scheduleAutosave('ventas');
  scheduleAutosave('gantt');
  scheduleAutosave('costos');
}

const MONTHLY_FORMULA_TOKENS = [
  '_unidades_promesadas_mes', '_unidades_escrituradas_mes',
  '_ingresos_promesa_mes', '_ingresos_escrituracion_mes', '_ingresos_mes',
];

function parseFormulaInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return { formula_tipo: 'manual', formula_valor: 0, formula_referencia: '' };
  if (/^[0-9.,]+$/.test(raw)) return { formula_tipo: 'manual', formula_valor: toNumber(raw.replace(',', '.')), formula_referencia: '' };
  const isMensual = MONTHLY_FORMULA_TOKENS.some((token) => raw.toLowerCase().includes(token));
  return { formula_tipo: isMensual ? 'expr_mensual' : 'expr', formula_valor: 0, formula_referencia: raw };
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
    const target = row.dataset.costId
      ? category?.partidas?.find((partida) => String(partida.id || '') === row.dataset.costId)
      : category?.partidas?.[index];
    if (!target) return;

    const formula = parseFormulaInput(row.querySelector('[data-field="formula"]')?.value);
    target.nombre = row.querySelector('[data-field="nombre"]')?.value?.trim() || 'Nueva subpartida';
    target.formula_tipo = formula.formula_tipo;
    target.formula_valor = formula.formula_valor;
    target.formula_referencia = formula.formula_referencia;
    target.plan_pago = target.plan_pago || '';
    target.tiene_iva = !!row.querySelector('[data-field="tiene_iva"]')?.checked;
    const esTerrenoInput = row.querySelector('[data-field="es_terreno"]');
    target.es_terreno = esTerrenoInput
      ? !!esTerrenoInput.checked
      : !!target.es_terreno;
    const monthInputs = Array.from(row.querySelectorAll('[data-month]'));
    if (monthInputs.length) {
      target.distribucion_mensual = monthInputs.map((input) => toNumber(input.value));
    }
    target.total_neto = evaluateCostPartida(target, buildCostContext());
    target.distribucion_mensual = getMonthlyDistributionForPartida(target, getCostMonthCount());
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
    category = { id: makeClientId('cat'), nombre: categoryName, partidas: [] };
    state.costos.push(category);
  }
  category.partidas.push({
    id: makeClientId('cost'),
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
  state.costosUi.collapsed[categoryName] = false;
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
  const monthCount = getCostMonthCount();
  let normalized;
  if (parsed.formula_tipo === 'expr_mensual') {
    normalized = evaluateMonthlyExpressionFormula(parsed.formula_referencia || formulaText, monthCount);
  } else {
    const total = parsed.formula_tipo === 'manual'
      ? toNumber(parsed.formula_valor)
      : evaluateExpressionFormula(parsed.formula_referencia || formulaText, buildCostContext()) || 0;
    normalized = normalizeDistribution([], total, planText);
  }
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
  if (typeof window.applyPersistedFormulaOverrides === 'function') {
    window.applyPersistedFormulaOverrides(state.proyecto.formula_overrides);
  }
  state.cabida = cabida;
  state.gantt = normalizeGanttRows(gantt);
  state.ventasConfig = ventasData.config || [];
  state.ventasCronograma = ventasData.cronograma || [];
  state.construccion = normalizeConstruccion(construccion);
  state.costos = costos;
  state.financiamiento = normalizeFinanciamiento(financiamiento);
  state.capital = normalizeCapital(capital);
  state.calculos = calculos;

  renderAll();
}

function readCapitalFromEditor() {
  return normalizeCapital({
    ...(state.capital || {}),
    caja_minima_buffer: toNumber($('cap-buffer')?.value ?? state.capital?.caja_minima_buffer ?? 2000),
    proyeccion_meses: Math.max(1, toNumber($('cap-proyeccion')?.value ?? state.capital?.proyeccion_meses ?? 6)),
    llamado_minimo: toNumber($('cap-llamado-min')?.value ?? state.capital?.llamado_minimo ?? 5000),
    caja_fuerte_retencion: toNumber($('cap-caja-fuerte')?.value ?? state.capital?.caja_fuerte_retencion ?? 10000),
    devolucion_minima: toNumber($('cap-dev-min')?.value ?? state.capital?.devolucion_minima ?? 3000),
  });
}

function calcularCapital() {
  state.capital = readCapitalFromEditor();
  scheduleAutosave('capital');
}

async function guardarCapital({ silent = false } = {}) {
  if (!state.proyectoId) return;
  state.capital = readCapitalFromEditor();
  setSyncStatus('saving', 'GUARDANDO', 'Persistiendo parametros de capital');
  await api(`/api/proyectos/${state.proyectoId}/capital`, {
    method: 'POST',
    body: JSON.stringify(state.capital),
  });
  await finishSave({ silent });
}

async function guardarFormulaOverrides({ silent = false } = {}) {
  if (!state.proyectoId) return;
  state.proyecto = getProjectSavePayload();
  setSyncStatus('saving', 'GUARDANDO', 'Persistiendo formulas editables');
  await api(`/api/proyectos/${state.proyectoId}/formula-overrides`, {
    method: 'POST',
    body: JSON.stringify(state.proyecto.formula_overrides || {}),
  });
  await finishSave({ silent });
}

async function guardarCabida({ silent = false } = {}) {
  if (!state.proyectoId) return;
  prepareStateForSave();
  const rows = state.cabida.filter((row) => row.uso);
  const proyecto = getProjectSavePayload();
  setSyncStatus('saving', 'GUARDANDO', 'Persistiendo cambios en la base');
  const requests = [
    api(`/api/proyectos/${state.proyectoId}`, {
      method: 'PUT',
      body: JSON.stringify(proyecto),
    }),
    api(`/api/proyectos/${state.proyectoId}/cabida`, {
      method: 'POST',
      body: JSON.stringify(rows),
    }),
  ];
  if (!silent) {
    requests.push(
      api(`/api/proyectos/${state.proyectoId}/ventas/config`, {
        method: 'POST',
        body: JSON.stringify(state.ventasConfig),
      }),
      api(`/api/proyectos/${state.proyectoId}/ventas/cronograma`, {
        method: 'POST',
        body: JSON.stringify(state.ventasCronograma),
      }),
      api(`/api/proyectos/${state.proyectoId}/costos`, {
        method: 'POST',
        body: JSON.stringify(state.costos),
      })
    );
  }
  await Promise.all(requests);
  await finishSave({ silent });
}

async function guardarTerreno({ silent = false } = {}) {
  if (!state.proyectoId) return;
  prepareStateForSave();
  const proyecto = getProjectSavePayload();
  const financiamiento = state.financiamiento;
  setSyncStatus('saving', 'GUARDANDO', 'Actualizando terreno y financiamiento terreno');
  const requests = [
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
  ];
  if (!silent) {
    requests.push(api(`/api/proyectos/${state.proyectoId}/costos`, {
      method: 'POST',
      body: JSON.stringify(state.costos),
    }));
  }
  await Promise.all(requests);
  await finishSave({ silent });
}

async function guardarConstruccion({ silent = false } = {}) {
  if (!state.proyectoId) return;
  prepareStateForSave();
  const payload = { ...state.construccion };
  const financiamiento = state.financiamiento;
  const proyecto = getProjectSavePayload();
  setSyncStatus('saving', 'GUARDANDO', 'Actualizando parametros de construccion');
  const requests = [
    api(`/api/proyectos/${state.proyectoId}`, {
      method: 'PUT',
      body: JSON.stringify(proyecto),
    }),
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
  ];
  if (!silent) {
    requests.push(api(`/api/proyectos/${state.proyectoId}/costos`, {
      method: 'POST',
      body: JSON.stringify(state.costos),
    }));
  }
  await Promise.all(requests);
  await finishSave({ silent });
}

async function guardarGantt({ silent = false } = {}) {
  if (!state.proyectoId) return;
  prepareStateForSave();
  const rows = state.gantt;
  setSyncStatus('saving', 'GUARDANDO', 'Actualizando cronograma del proyecto');
  const requests = [
    api(`/api/proyectos/${state.proyectoId}/gantt`, {
      method: 'POST',
      body: JSON.stringify(rows),
    }),
  ];
  if (!silent) {
    requests.push(api(`/api/proyectos/${state.proyectoId}/costos`, {
      method: 'POST',
      body: JSON.stringify(state.costos),
    }));
  }
  await Promise.all(requests);
  await finishSave({ silent });
}

async function guardarVentas({ silent = false } = {}) {
  if (!state.proyectoId) return;
  prepareStateForSave();
  const config = state.ventasConfig;
  const cronograma = state.ventasCronograma;
  setSyncStatus('saving', 'GUARDANDO', 'Actualizando estrategia comercial y cronogramas');
  const requests = [
    api(`/api/proyectos/${state.proyectoId}/ventas/config`, {
      method: 'POST',
      body: JSON.stringify(config),
    }),
    api(`/api/proyectos/${state.proyectoId}/ventas/cronograma`, {
      method: 'POST',
      body: JSON.stringify(cronograma),
    }),
  ];
  if (!silent) {
    requests.push(api(`/api/proyectos/${state.proyectoId}/costos`, {
      method: 'POST',
      body: JSON.stringify(state.costos),
    }));
  }
  await Promise.all(requests);
  await finishSave({ silent });
}

async function guardarCostos({ silent = false } = {}) {
  if (!state.proyectoId) return;
  prepareStateForSave();
  const payload = readCostosEditor();
  setSyncStatus('saving', 'GUARDANDO', 'Persistiendo planilla de costos');
  await api(`/api/proyectos/${state.proyectoId}/costos`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  await finishSave({ silent });
}

function eliminarUso(index) {
  const rows = getCabidaRowsFromEditor();
  if (rows.length <= 1) return;
  rows.splice(index, 1);
  renderCabidaEditor(rows);
  onCabidaInputChange();
}

function agregarUso(defaultLabel = 'Departamento') {
  const rows = getCabidaRowsFromEditor();
  const baseLabel = String(defaultLabel || 'Departamento').trim() || 'Departamento';
  const existingLabels = new Set(rows.map((row) => String(row.uso || '').trim().toLowerCase()));
  let nextLabel = baseLabel;
  let counter = 2;
  while (existingLabels.has(nextLabel.toLowerCase())) {
    nextLabel = `${baseLabel} ${counter}`;
    counter += 1;
  }
  rows.push({
    uso: nextLabel,
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
  'toggleEstructura',
  'setCostosView',
  'setDeudaView',
  'setInteresView',
  'setCapTab',
  'exportarExcel',
  'handleFileUpload',
].forEach((fnName) => {
  window[fnName] = createPendingAction(fnName);
});

window.showTab = showTab;
window.onCabidaInputChange = onCabidaInputChange;
window.onTerrenoInputChange = onTerrenoInputChange;
window.guardarFormulaOverrides = guardarFormulaOverrides;
window.guardarCabida = guardarCabida;
window.guardarTerreno = guardarTerreno;
window.guardarConstruccion = guardarConstruccion;
window.guardarGantt = guardarGantt;
window.guardarVentas = guardarVentas;
window.guardarCapital = guardarCapital;
window.calcularCapital = calcularCapital;
window.updateConstrParams = updateConstrParams;
window.guardarCostos = guardarCostos;
window.agregarPartidaLinea = agregarPartidaLinea;
window.redistribuirPartida = redistribuirPartida;
window.aplicarPlanPagoFila = aplicarPlanPagoFila;
window.setCostFlowMode = setCostFlowMode;
window.scrollCostPlanilla = scrollCostPlanilla;
window.scrollFinancialPlanilla = scrollFinancialPlanilla;
window.openCostFormulaModal = openCostFormulaModal;
window.renderFormulaRefPanel = renderFormulaRefPanel;
window.toggleFormulaRefGroup = toggleFormulaRefGroup;
window.insertFormulaTemplate = insertFormulaTemplate;
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
window.applyQuickPaymentTemplate = applyQuickPaymentTemplate;
window.savePaymentPlanModal = savePaymentPlanModal;
window.removeCostPartida = removeCostPartida;
window.startCostDrag = startCostDrag;
window.allowCostDrop = allowCostDrop;
window.dropCostRow = dropCostRow;
window.endCostDrag = endCostDrag;
window.agregarUso = agregarUso;
window.eliminarUso = eliminarUso;
window.agregarHito = agregarHito;
window.onGanttInputChange = onGanttInputChange;
window.moveGanttRow = moveGanttRow;
window.removeGanttRow = removeGanttRow;
window.onGanttColorButtonClick = onGanttColorButtonClick;
window.onGanttFloatingSwatchPick = onGanttFloatingSwatchPick;
window.startGanttDrag = startGanttDrag;
window.allowGanttDrop = allowGanttDrop;
window.endGanttDrag = endGanttDrag;
window.dropGanttRow = dropGanttRow;
window.onVentasInputChange = onVentasInputChange;
window.onVentasVelocityChange = onVentasVelocityChange;

// getGanttLockConfig is defined once above (line ~2969). No duplicate needed here.

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
