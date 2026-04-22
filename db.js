// db.js - Lógica SQLite con better-sqlite3
const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const db = new Database(path.join(__dirname, 'db.sqlite'));

// ─── INICIALIZACIÓN DE TABLAS ───────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS proyectos (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    direccion TEXT,
    tipo TEXT DEFAULT 'Residencial',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cabida (
    id TEXT PRIMARY KEY,
    proyecto_id TEXT NOT NULL,
    uso TEXT NOT NULL,
    cantidad INTEGER DEFAULT 0,
    estacionamientos INTEGER DEFAULT 0,
    bodegas INTEGER DEFAULT 0,
    sup_interior REAL DEFAULT 0,
    sup_terrazas REAL DEFAULT 0,
    sup_comunes REAL DEFAULT 0,
    sup_util_mun REAL DEFAULT 0,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS gantt_hitos (
    id TEXT PRIMARY KEY,
    proyecto_id TEXT NOT NULL,
    nombre TEXT NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    dependencia TEXT,
    desfase INTEGER DEFAULT 0,
    inicio INTEGER DEFAULT 0,
    duracion INTEGER DEFAULT 0,
    fin INTEGER DEFAULT 0,
    orden INTEGER DEFAULT 0,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ventas_config (
    id TEXT PRIMARY KEY,
    proyecto_id TEXT NOT NULL,
    uso TEXT NOT NULL,
    precio_uf_m2 REAL DEFAULT 0,
    precio_estacionamiento REAL DEFAULT 0,
    precio_bodega REAL DEFAULT 0,
    reserva_uf REAL DEFAULT 0,
    pie_promesa_pct REAL DEFAULT 0,
    pie_cuotas_pct REAL DEFAULT 0,
    hipotecario_pct REAL DEFAULT 0,
    pie_cuoton_pct REAL DEFAULT 0,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ventas_cronograma (
    id TEXT PRIMARY KEY,
    proyecto_id TEXT NOT NULL,
    tipo TEXT NOT NULL,
    uso TEXT NOT NULL,
    vinculo_gantt TEXT,
    mes_inicio INTEGER DEFAULT 0,
    duracion INTEGER DEFAULT 0,
    porcentaje REAL DEFAULT 0,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS construccion (
    id TEXT PRIMARY KEY,
    proyecto_id TEXT NOT NULL,
    sup_sobre_tierra REAL DEFAULT 0,
    costo_uf_m2_sobre_tierra REAL DEFAULT 0,
    sup_bajo_tierra REAL DEFAULT 0,
    costo_uf_m2_bajo_tierra REAL DEFAULT 0,
    plazo_meses INTEGER DEFAULT 0,
    anticipo_pct REAL DEFAULT 0,
    retencion_pct REAL DEFAULT 0,
    ancho_curva REAL DEFAULT 0.5,
    peak_gasto REAL DEFAULT 0.5,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS costos_categorias (
    id TEXT PRIMARY KEY,
    proyecto_id TEXT NOT NULL,
    nombre TEXT NOT NULL,
    orden INTEGER DEFAULT 0,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS costos_partidas (
    id TEXT PRIMARY KEY,
    categoria_id TEXT NOT NULL,
    proyecto_id TEXT NOT NULL,
    nombre TEXT NOT NULL,
    formula_tipo TEXT DEFAULT 'manual',
    formula_valor REAL DEFAULT 0,
    formula_referencia TEXT,
    formula_multiplicador REAL DEFAULT 1,
    formula_inicio_gantt TEXT,
    formula_fin_gantt TEXT,
    tiene_iva INTEGER DEFAULT 0,
    es_terreno INTEGER DEFAULT 0,
    total_neto REAL DEFAULT 0,
    orden INTEGER DEFAULT 0,
    distribucion_mensual TEXT DEFAULT '[]',
    FOREIGN KEY (categoria_id) REFERENCES costos_categorias(id) ON DELETE CASCADE,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS financiamiento (
    id TEXT PRIMARY KEY,
    proyecto_id TEXT NOT NULL,
    credito_terreno_activo INTEGER DEFAULT 1,
    credito_terreno_pct REAL DEFAULT 70,
    credito_terreno_tasa REAL DEFAULT 3.5,
    credito_terreno_pago_intereses TEXT DEFAULT 'Semestral',
    credito_terreno_pago_capital TEXT DEFAULT 'Inicio Construccion',
    linea_construccion_activo INTEGER DEFAULT 1,
    linea_construccion_pct REAL DEFAULT 100,
    linea_construccion_tasa REAL DEFAULT 3.5,
    linea_construccion_pago_intereses TEXT DEFAULT 'Anual',
    linea_construccion_pago_capital TEXT DEFAULT 'Contra Escrituraciones',
    linea_adicional_activo INTEGER DEFAULT 1,
    linea_adicional_monto REAL DEFAULT 10000,
    linea_adicional_tasa REAL DEFAULT 3,
    linea_adicional_mes_inicio INTEGER DEFAULT 5,
    linea_adicional_mes_fin INTEGER DEFAULT 8,
    linea_adicional_pago_intereses TEXT DEFAULT 'Semestral',
    linea_adicional_pago_capital TEXT DEFAULT 'Contra Escrituraciones',
    activar_tope_deuda INTEGER DEFAULT 0,
    tope_deuda_uf REAL DEFAULT 0,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS capital_config (
    id TEXT PRIMARY KEY,
    proyecto_id TEXT NOT NULL,
    caja_minima_buffer REAL DEFAULT 2000,
    proyeccion_meses INTEGER DEFAULT 6,
    llamado_minimo REAL DEFAULT 5000,
    caja_fuerte_retencion REAL DEFAULT 10000,
    devolucion_minima REAL DEFAULT 3000,
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
  );
`);

// ─── PROYECTOS ───────────────────────────────────────────────
const proyectos = {
  getAll: () => db.prepare('SELECT * FROM proyectos ORDER BY created_at DESC').all(),
  getById: (id) => db.prepare('SELECT * FROM proyectos WHERE id = ?').get(id),
  create: (data) => {
    const id = uuidv4();
    db.prepare('INSERT INTO proyectos (id, nombre, direccion, tipo) VALUES (?, ?, ?, ?)').run(id, data.nombre, data.direccion || '', data.tipo || 'Residencial');
    return id;
  },
  update: (id, data) => {
    db.prepare('UPDATE proyectos SET nombre=?, direccion=?, tipo=?, updated_at=datetime("now") WHERE id=?').run(data.nombre, data.direccion, data.tipo, id);
  },
  delete: (id) => db.prepare('DELETE FROM proyectos WHERE id=?').run(id)
};

// ─── CABIDA ──────────────────────────────────────────────────
const cabida = {
  getByProject: (pid) => db.prepare('SELECT * FROM cabida WHERE proyecto_id = ?').all(pid),
  upsert: (pid, rows) => {
    const del = db.prepare('DELETE FROM cabida WHERE proyecto_id = ?');
    const ins = db.prepare('INSERT INTO cabida (id,proyecto_id,uso,cantidad,estacionamientos,bodegas,sup_interior,sup_terrazas,sup_comunes,sup_util_mun) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const tx = db.transaction(() => {
      del.run(pid);
      rows.forEach(r => ins.run(uuidv4(), pid, r.uso, r.cantidad||0, r.estacionamientos||0, r.bodegas||0, r.sup_interior||0, r.sup_terrazas||0, r.sup_comunes||0, r.sup_util_mun||0));
    });
    tx();
  }
};

// ─── GANTT ───────────────────────────────────────────────────
const gantt = {
  getByProject: (pid) => db.prepare('SELECT * FROM gantt_hitos WHERE proyecto_id = ? ORDER BY orden').all(pid),
  save: (pid, hitos) => {
    const del = db.prepare('DELETE FROM gantt_hitos WHERE proyecto_id = ?');
    const ins = db.prepare('INSERT INTO gantt_hitos (id,proyecto_id,nombre,color,dependencia,desfase,inicio,duracion,fin,orden) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const tx = db.transaction(() => {
      del.run(pid);
      hitos.forEach((h,i) => ins.run(h.id||uuidv4(), pid, h.nombre, h.color||'#3b82f6', h.dependencia||null, h.desfase||0, h.inicio||0, h.duracion||0, h.fin||0, i));
    });
    tx();
  }
};

// ─── VENTAS ──────────────────────────────────────────────────
const ventas = {
  getConfig: (pid) => db.prepare('SELECT * FROM ventas_config WHERE proyecto_id = ?').all(pid),
  getCronograma: (pid) => db.prepare('SELECT * FROM ventas_cronograma WHERE proyecto_id = ?').all(pid),
  saveConfig: (pid, rows) => {
    const del = db.prepare('DELETE FROM ventas_config WHERE proyecto_id = ?');
    const ins = db.prepare('INSERT INTO ventas_config (id,proyecto_id,uso,precio_uf_m2,precio_estacionamiento,precio_bodega,reserva_uf,pie_promesa_pct,pie_cuotas_pct,hipotecario_pct,pie_cuoton_pct) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    const tx = db.transaction(() => {
      del.run(pid);
      rows.forEach(r => ins.run(uuidv4(), pid, r.uso, r.precio_uf_m2||0, r.precio_estacionamiento||0, r.precio_bodega||0, r.reserva_uf||0, r.pie_promesa_pct||0, r.pie_cuotas_pct||0, r.hipotecario_pct||0, r.pie_cuoton_pct||0));
    });
    tx();
  },
  saveCronograma: (pid, rows) => {
    const del = db.prepare('DELETE FROM ventas_cronograma WHERE proyecto_id = ?');
    const ins = db.prepare('INSERT INTO ventas_cronograma (id,proyecto_id,tipo,uso,vinculo_gantt,mes_inicio,duracion,porcentaje) VALUES (?,?,?,?,?,?,?,?)');
    const tx = db.transaction(() => {
      del.run(pid);
      rows.forEach(r => ins.run(uuidv4(), pid, r.tipo, r.uso, r.vinculo_gantt||null, r.mes_inicio||0, r.duracion||0, r.porcentaje||0));
    });
    tx();
  }
};

// ─── CONSTRUCCIÓN ────────────────────────────────────────────
const construccion = {
  get: (pid) => db.prepare('SELECT * FROM construccion WHERE proyecto_id = ?').get(pid),
  save: (pid, data) => {
    const existing = db.prepare('SELECT id FROM construccion WHERE proyecto_id = ?').get(pid);
    if (existing) {
      db.prepare('UPDATE construccion SET sup_sobre_tierra=?,costo_uf_m2_sobre_tierra=?,sup_bajo_tierra=?,costo_uf_m2_bajo_tierra=?,plazo_meses=?,anticipo_pct=?,retencion_pct=?,ancho_curva=?,peak_gasto=? WHERE proyecto_id=?')
        .run(data.sup_sobre_tierra||0,data.costo_uf_m2_sobre_tierra||0,data.sup_bajo_tierra||0,data.costo_uf_m2_bajo_tierra||0,data.plazo_meses||0,data.anticipo_pct||0,data.retencion_pct||0,data.ancho_curva||0.5,data.peak_gasto||0.5,pid);
    } else {
      db.prepare('INSERT INTO construccion (id,proyecto_id,sup_sobre_tierra,costo_uf_m2_sobre_tierra,sup_bajo_tierra,costo_uf_m2_bajo_tierra,plazo_meses,anticipo_pct,retencion_pct,ancho_curva,peak_gasto) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(uuidv4(),pid,data.sup_sobre_tierra||0,data.costo_uf_m2_sobre_tierra||0,data.sup_bajo_tierra||0,data.costo_uf_m2_bajo_tierra||0,data.plazo_meses||0,data.anticipo_pct||0,data.retencion_pct||0,data.ancho_curva||0.5,data.peak_gasto||0.5);
    }
  }
};

// ─── COSTOS ──────────────────────────────────────────────────
const costos = {
  getCategorias: (pid) => db.prepare('SELECT * FROM costos_categorias WHERE proyecto_id = ? ORDER BY orden').all(pid),
  getPartidas: (pid) => db.prepare('SELECT * FROM costos_partidas WHERE proyecto_id = ? ORDER BY orden').all(pid),
  getPartidasByCategoria: (catId) => db.prepare('SELECT * FROM costos_partidas WHERE categoria_id = ? ORDER BY orden').all(catId),
  saveAll: (pid, categorias) => {
    const delP = db.prepare('DELETE FROM costos_partidas WHERE proyecto_id = ?');
    const delC = db.prepare('DELETE FROM costos_categorias WHERE proyecto_id = ?');
    const insC = db.prepare('INSERT INTO costos_categorias (id,proyecto_id,nombre,orden) VALUES (?,?,?,?)');
    const insP = db.prepare('INSERT INTO costos_partidas (id,categoria_id,proyecto_id,nombre,formula_tipo,formula_valor,formula_referencia,formula_multiplicador,formula_inicio_gantt,formula_fin_gantt,tiene_iva,es_terreno,total_neto,orden,distribucion_mensual) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    const tx = db.transaction(() => {
      delP.run(pid); delC.run(pid);
      categorias.forEach((cat, ci) => {
        const catId = cat.id || uuidv4();
        insC.run(catId, pid, cat.nombre, ci);
        (cat.partidas||[]).forEach((p, pi) => {
          insP.run(p.id||uuidv4(), catId, pid, p.nombre, p.formula_tipo||'manual', p.formula_valor||0, p.formula_referencia||null, p.formula_multiplicador||1, p.formula_inicio_gantt||null, p.formula_fin_gantt||null, p.tiene_iva?1:0, p.es_terreno?1:0, p.total_neto||0, pi, JSON.stringify(p.distribucion_mensual||[]));
        });
      });
    });
    tx();
  }
};

// ─── FINANCIAMIENTO ──────────────────────────────────────────
const financiamiento = {
  get: (pid) => db.prepare('SELECT * FROM financiamiento WHERE proyecto_id = ?').get(pid),
  save: (pid, data) => {
    const existing = db.prepare('SELECT id FROM financiamiento WHERE proyecto_id = ?').get(pid);
    const cols = Object.keys(data).join(',');
    if (existing) {
      const sets = Object.keys(data).map(k => k + '=?').join(',');
      db.prepare(`UPDATE financiamiento SET ${sets} WHERE proyecto_id=?`).run(...Object.values(data), pid);
    } else {
      const id = uuidv4();
      const keys = ['id','proyecto_id',...Object.keys(data)].join(',');
      const placeholders = Array(Object.keys(data).length+2).fill('?').join(',');
      db.prepare(`INSERT INTO financiamiento (${keys}) VALUES (${placeholders})`).run(id, pid, ...Object.values(data));
    }
  }
};

// ─── CAPITAL ─────────────────────────────────────────────────
const capital = {
  get: (pid) => db.prepare('SELECT * FROM capital_config WHERE proyecto_id = ?').get(pid),
  save: (pid, data) => {
    const existing = db.prepare('SELECT id FROM capital_config WHERE proyecto_id = ?').get(pid);
    if (existing) {
      const sets = Object.keys(data).map(k => k+'=?').join(',');
      db.prepare(`UPDATE capital_config SET ${sets} WHERE proyecto_id=?`).run(...Object.values(data), pid);
    } else {
      db.prepare('INSERT INTO capital_config (id,proyecto_id,caja_minima_buffer,proyeccion_meses,llamado_minimo,caja_fuerte_retencion,devolucion_minima) VALUES (?,?,?,?,?,?,?)')
        .run(uuidv4(), pid, data.caja_minima_buffer||2000, data.proyeccion_meses||6, data.llamado_minimo||5000, data.caja_fuerte_retencion||10000, data.devolucion_minima||3000);
    }
  }
};

// ─── SEED DATA ───────────────────────────────────────────────
function seedDemoProject() {
  const existing = db.prepare("SELECT id FROM proyectos WHERE nombre = 'Edificio Residencial Tipo'").get();
  if (existing) return existing.id;

  const pid = uuidv4();
  db.prepare("INSERT INTO proyectos (id,nombre,direccion,tipo) VALUES (?,?,?,?)")
    .run(pid, 'Edificio Residencial Tipo', 'Direccion en Las Condes, Las Condes', 'Residencial');

  // Cabida
  cabida.upsert(pid, [
    { uso:'DEPARTAMENTOS', cantidad:50, estacionamientos:100, bodegas:50, sup_interior:5540, sup_terrazas:500, sup_comunes:1106, sup_util_mun:5540 },
    { uso:'ESTAC. VISITAS', cantidad:0, estacionamientos:10, bodegas:0, sup_interior:0, sup_terrazas:0, sup_comunes:0, sup_util_mun:0 },
  ]);

  // Gantt
  gantt.save(pid, [
    {nombre:'Adquisicion de Terreno',color:'#6366f1',dependencia:null,desfase:0,inicio:0,duracion:1,fin:1},
    {nombre:'Proyectistas',color:'#f59e0b',dependencia:'Adquisicion de Terreno',desfase:0,inicio:1,duracion:8,fin:9},
    {nombre:'Permiso de Edificacion',color:'#10b981',dependencia:'Proyectistas',desfase:0,inicio:9,duracion:3,fin:12},
    {nombre:'Licitacion Construccion',color:'#8b5cf6',dependencia:'Permiso de Edificacion',desfase:0,inicio:12,duracion:3,fin:15},
    {nombre:'Construccion',color:'#ef4444',dependencia:'Licitacion Construccion',desfase:0,inicio:15,duracion:20,fin:35},
    {nombre:'Recepcion Municipal',color:'#06b6d4',dependencia:'Construccion',desfase:-1,inicio:34,duracion:4,fin:38},
    {nombre:'Pre Ventas',color:'#ec4899',dependencia:'Adquisicion de Terreno',desfase:2,inicio:3,duracion:7,fin:10},
    {nombre:'Ventas',color:'#3b82f6',dependencia:'Pre Ventas',desfase:0,inicio:10,duracion:31,fin:41},
    {nombre:'Escrituracion',color:'#f97316',dependencia:'Recepcion Municipal',desfase:0,inicio:38,duracion:7,fin:45},
    {nombre:'Mantencion Proyecto',color:'#22c55e',dependencia:'Recepcion Municipal',desfase:0,inicio:38,duracion:7,fin:45},
    {nombre:'Postventa',color:'#a855f7',dependencia:'Recepcion Municipal',desfase:0,inicio:38,duracion:19,fin:57},
  ]);

  // Ventas
  ventas.saveConfig(pid, [
    { uso:'DEPTOS', precio_uf_m2:105, precio_estacionamiento:350, precio_bodega:100, reserva_uf:50, pie_promesa_pct:5, pie_cuotas_pct:10, hipotecario_pct:85, pie_cuoton_pct:0 }
  ]);
  ventas.saveCronograma(pid, [
    { tipo:'PREVENTA', uso:'DEPTOS', vinculo_gantt:'Adquisicion de Terreno', mes_inicio:3, duracion:7, porcentaje:20 },
    { tipo:'VENTA', uso:'DEPTOS', vinculo_gantt:'Pre Ventas', mes_inicio:10, duracion:31, porcentaje:80 },
    { tipo:'ESCRITURACION', uso:'DEPTOS', vinculo_gantt:'Recepcion Municipal', mes_inicio:38, duracion:7, porcentaje:0 }
  ]);

  // Construccion
  construccion.save(pid, { sup_sobre_tierra:7146, costo_uf_m2_sobre_tierra:27, sup_bajo_tierra:3241, costo_uf_m2_bajo_tierra:15, plazo_meses:20, anticipo_pct:15, retencion_pct:5, ancho_curva:0.5, peak_gasto:0.5 });

  // Costos
  costos.saveAll(pid, [
    { nombre:'TERRENO', partidas:[
      { nombre:'Compra del Terreno', formula_tipo:'m2_terreno_x_valor', formula_valor:60, formula_multiplicador:1, es_terreno:1, tiene_iva:0, total_neto:132000 },
      { nombre:'Comision Corredor', formula_tipo:'referencia_x_pct', formula_referencia:'Compra del Terreno', formula_multiplicador:0.02, tiene_iva:1, es_terreno:0, total_neto:2640 },
      { nombre:'Gastos Legales Terreno', formula_tipo:'manual', formula_valor:100, tiene_iva:1, es_terreno:0, total_neto:100 },
      { nombre:'Contribuciones', formula_tipo:'duracion_gantt', formula_valor:150, formula_referencia:'Adquisicion de Terreno>Recepcion Municipal', formula_multiplicador:3, tiene_iva:0, es_terreno:0, total_neto:1850 },
      { nombre:'Supresion de Empalmes', formula_tipo:'manual', formula_valor:100, tiene_iva:1, es_terreno:0, total_neto:100 },
    ]},
    { nombre:'PROYECTISTAS', partidas:[
      { nombre:'Topografia', formula_tipo:'manual', formula_valor:50, tiene_iva:1, total_neto:50 },
      { nombre:'Arquitectura', formula_tipo:'m2_vendible_x_valor', formula_valor:0.8, formula_referencia:'m2_vendible_deptos', tiene_iva:1, total_neto:4632 },
      { nombre:'Rev. Indep. Arquitectura', formula_tipo:'referencia_x_pct', formula_valor:0.3, formula_referencia:'Permisos y Derechos Mun', formula_multiplicador:0.7, tiene_iva:0, total_neto:467 },
      { nombre:'Mecanica de Suelos', formula_tipo:'manual', formula_valor:300, tiene_iva:1, total_neto:300 },
      { nombre:'Calculista', formula_tipo:'m2_losa_x_valor', formula_valor:0.125, formula_referencia:'m2_losa_total', tiene_iva:1, total_neto:1298 },
      { nombre:'Rev. Indep. Calculo', formula_tipo:'m2_losa_x_valor', formula_valor:0.025, formula_referencia:'m2_losa_total', tiene_iva:0, total_neto:260 },
      { nombre:'Sanitario', formula_tipo:'manual', formula_valor:125, tiene_iva:1, total_neto:125 },
      { nombre:'Electrico y CCDD', formula_tipo:'manual', formula_valor:200, tiene_iva:1, total_neto:200 },
      { nombre:'Evacuacion', formula_tipo:'manual', formula_valor:75, tiene_iva:1, total_neto:75 },
      { nombre:'Seguridad', formula_tipo:'manual', formula_valor:100, tiene_iva:1, total_neto:100 },
      { nombre:'Residuos Solidos', formula_tipo:'manual', formula_valor:50, tiene_iva:1, total_neto:50 },
      { nombre:'Iluminacion', formula_tipo:'manual', formula_valor:150, tiene_iva:1, total_neto:150 },
      { nombre:'Cocina', formula_tipo:'manual', formula_valor:200, tiene_iva:1, total_neto:200 },
      { nombre:'Domotica', formula_tipo:'manual', formula_valor:100, tiene_iva:1, total_neto:100 },
      { nombre:'Ascensores', formula_tipo:'manual', formula_valor:200, tiene_iva:1, total_neto:200 },
      { nombre:'Eficiencia Energetica', formula_tipo:'manual', formula_valor:400, tiene_iva:1, total_neto:400 },
      { nombre:'Impermeabilizacion', formula_tipo:'manual', formula_valor:150, tiene_iva:1, total_neto:150 },
      { nombre:'Pavimentacion', formula_tipo:'manual', formula_valor:125, tiene_iva:1, total_neto:125 },
      { nombre:'Paisajismo', formula_tipo:'manual', formula_valor:400, tiene_iva:1, total_neto:400 },
      { nombre:'Equipamiento Comun', formula_tipo:'manual', formula_valor:200, tiene_iva:1, total_neto:200 },
      { nombre:'Coordinacion BIM', formula_tipo:'duracion_gantt', formula_valor:100, formula_referencia:'Construccion', tiene_iva:1, total_neto:2000 },
      { nombre:'Otros Proyectistas', formula_tipo:'manual', formula_valor:500, tiene_iva:1, total_neto:500 },
    ]},
    { nombre:'FEES GESTION', partidas:[
      { nombre:'Fee Gestion Proyecto', formula_tipo:'pct_ventas_mensual', formula_valor:0.06, tiene_iva:1, total_neto:38877 },
    ]},
    { nombre:'CONSTRUCCION', partidas:[
      { nombre:'Contrato Construccion', formula_tipo:'curva_s', formula_valor:0, tiene_iva:1, total_neto:241557 },
    ]},
    { nombre:'MITIGACIONES', partidas:[
      { nombre:'Mitigacion Vial', formula_tipo:'manual', formula_valor:200, tiene_iva:1, total_neto:200 },
      { nombre:'Mitigacion MINVU', formula_tipo:'m2_losa_x_valor', formula_valor:0.024, tiene_iva:0, total_neto:2916 },
    ]},
    { nombre:'SV-PILOTO-MKT', partidas:[
      { nombre:'Sala de Ventas', formula_tipo:'manual', formula_valor:500, tiene_iva:1, total_neto:500 },
      { nombre:'Publicidad Digital', formula_tipo:'manual', formula_valor:200, tiene_iva:1, total_neto:4000 },
      { nombre:'Material Impreso', formula_tipo:'manual', formula_valor:120, tiene_iva:1, total_neto:1941 },
    ]},
    { nombre:'ESTUDIOS Y ASESORIAS', partidas:[
      { nombre:'Estudio de Mercado', formula_tipo:'manual', formula_valor:100, tiene_iva:1, total_neto:100 },
      { nombre:'Asesoria Legal', formula_tipo:'manual', formula_valor:300, tiene_iva:1, total_neto:2500 },
    ]},
    { nombre:'GASTOS DE VENTA', partidas:[
      { nombre:'Comision Venta', formula_tipo:'pct_ventas', formula_valor:0, tiene_iva:1, total_neto:0 },
    ]},
    { nombre:'PERMISOS Y DERECHOS MUN.', partidas:[
      { nombre:'Permiso de Edificacion', formula_tipo:'m2_losa_x_valor', formula_valor:0, tiene_iva:0, total_neto:0 },
    ]},
    { nombre:'INTERESES FIN.', partidas:[
      { nombre:'Intereses Credito Terreno', formula_tipo:'calculado', formula_valor:0, tiene_iva:1, total_neto:3773 },
      { nombre:'Intereses Linea Construccion', formula_tipo:'calculado', formula_valor:0, tiene_iva:1, total_neto:12157 },
      { nombre:'Intereses Linea Adicional', formula_tipo:'calculado', formula_valor:0, tiene_iva:1, total_neto:863 },
    ]},
    { nombre:'MANTENCION', partidas:[
      { nombre:'Mantencion Mensual', formula_tipo:'manual', formula_valor:247, tiene_iva:1, total_neto:3623 },
    ]},
    { nombre:'POSTVENTA', partidas:[
      { nombre:'Fondo Postventa', formula_tipo:'pct_ventas', formula_valor:0, tiene_iva:1, total_neto:0 },
    ]},
    { nombre:'OTROS', partidas:[
      { nombre:'Gastos Notariales', formula_tipo:'manual', formula_valor:9, tiene_iva:1, total_neto:1332 },
      { nombre:'Impuestos Municipales', formula_tipo:'manual', formula_valor:41, tiene_iva:0, total_neto:1184 },
      { nombre:'Gastos Bancarios', formula_tipo:'manual', formula_valor:50, tiene_iva:1, total_neto:1614 },
    ]},
  ]);

  // Financiamiento
  financiamiento.save(pid, {
    credito_terreno_activo:1, credito_terreno_pct:70, credito_terreno_tasa:3.5,
    credito_terreno_pago_intereses:'Semestral', credito_terreno_pago_capital:'Inicio Construccion',
    linea_construccion_activo:1, linea_construccion_pct:100, linea_construccion_tasa:3.5,
    linea_construccion_pago_intereses:'Anual', linea_construccion_pago_capital:'Contra Escrituraciones',
    linea_adicional_activo:1, linea_adicional_monto:10000, linea_adicional_tasa:3,
    linea_adicional_mes_inicio:5, linea_adicional_mes_fin:8,
    linea_adicional_pago_intereses:'Semestral', linea_adicional_pago_capital:'Contra Escrituraciones',
    activar_tope_deuda:0, tope_deuda_uf:0
  });

  // Capital
  capital.save(pid, { caja_minima_buffer:2000, proyeccion_meses:6, llamado_minimo:5000, caja_fuerte_retencion:10000, devolucion_minima:3000 });

  return pid;
}

module.exports = { db, proyectos, cabida, gantt, ventas, construccion, costos, financiamiento, capital, seedDemoProject };
