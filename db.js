require('dotenv').config();

const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL no esta configurada. La app necesita una base Postgres para funcionar.');
}

function shouldUseSsl(connectionString) {
  if (!connectionString) return false;
  if (process.env.PGSSL === 'false') return false;
  if (process.env.PGSSL === 'true') return true;
  return /sslmode=require/i.test(connectionString) || /neon\.tech|supabase\.co|render\.com/i.test(connectionString);
}

const poolConfig = {
  connectionString: process.env.DATABASE_URL,
};

if (shouldUseSsl(process.env.DATABASE_URL)) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

let initPromise;

async function query(text, params = []) {
  return pool.query(text, params);
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function initDb() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS proyectos (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        direccion TEXT DEFAULT '',
        tipo TEXT DEFAULT 'Residencial',
        terraza_util_pct DOUBLE PRECISION DEFAULT 50,
        comunes_tipo TEXT DEFAULT 'porcentaje',
        comunes_valor DOUBLE PRECISION DEFAULT 0,
        estacionamientos_cantidad INTEGER DEFAULT 0,
        estacionamientos_sup_interior DOUBLE PRECISION DEFAULT 0,
        estacionamientos_sup_terrazas DOUBLE PRECISION DEFAULT 0,
        bodegas_cantidad INTEGER DEFAULT 0,
        bodegas_sup_interior DOUBLE PRECISION DEFAULT 0,
        bodegas_sup_terrazas DOUBLE PRECISION DEFAULT 0,
        updated_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cabida (
        id TEXT PRIMARY KEY,
        proyecto_id TEXT NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
        uso TEXT NOT NULL,
        cantidad INTEGER DEFAULT 0,
        estacionamientos INTEGER DEFAULT 0,
        bodegas INTEGER DEFAULT 0,
        sup_interior DOUBLE PRECISION DEFAULT 0,
        sup_terrazas DOUBLE PRECISION DEFAULT 0,
        sup_comunes DOUBLE PRECISION DEFAULT 0,
        sup_util_mun DOUBLE PRECISION DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS gantt_hitos (
        id TEXT PRIMARY KEY,
        proyecto_id TEXT NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
        nombre TEXT NOT NULL,
        color TEXT DEFAULT '#3b82f6',
        dependencia TEXT,
        dependencia_tipo TEXT DEFAULT 'fin',
        desfase INTEGER DEFAULT 0,
        inicio INTEGER DEFAULT 0,
        duracion INTEGER DEFAULT 0,
        fin INTEGER DEFAULT 0,
        orden_index INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS ventas_config (
        id TEXT PRIMARY KEY,
        proyecto_id TEXT NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
        uso TEXT NOT NULL,
        precio_uf_m2 DOUBLE PRECISION DEFAULT 0,
        precio_estacionamiento DOUBLE PRECISION DEFAULT 0,
        precio_bodega DOUBLE PRECISION DEFAULT 0,
        reserva_uf DOUBLE PRECISION DEFAULT 0,
        pie_promesa_pct DOUBLE PRECISION DEFAULT 0,
        pie_cuotas_pct DOUBLE PRECISION DEFAULT 0,
        hipotecario_pct DOUBLE PRECISION DEFAULT 0,
        pie_cuoton_pct DOUBLE PRECISION DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS ventas_cronograma (
        id TEXT PRIMARY KEY,
        proyecto_id TEXT NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
        tipo TEXT NOT NULL,
        uso TEXT NOT NULL,
        vinculo_gantt TEXT,
        mes_inicio INTEGER DEFAULT 0,
        duracion INTEGER DEFAULT 0,
        porcentaje DOUBLE PRECISION DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS construccion (
        id TEXT PRIMARY KEY,
        proyecto_id TEXT NOT NULL UNIQUE REFERENCES proyectos(id) ON DELETE CASCADE,
        sup_sobre_tierra DOUBLE PRECISION DEFAULT 0,
        costo_uf_m2_sobre_tierra DOUBLE PRECISION DEFAULT 0,
        sup_bajo_tierra DOUBLE PRECISION DEFAULT 0,
        pct_bajo_tierra_sobre_cota_0 DOUBLE PRECISION DEFAULT 0,
        costo_uf_m2_bajo_tierra DOUBLE PRECISION DEFAULT 0,
        plazo_meses INTEGER DEFAULT 0,
        anticipo_pct DOUBLE PRECISION DEFAULT 0,
        retencion_pct DOUBLE PRECISION DEFAULT 0,
        ancho_curva DOUBLE PRECISION DEFAULT 0.5,
        peak_gasto DOUBLE PRECISION DEFAULT 0.5
      );

      CREATE TABLE IF NOT EXISTS costos_categorias (
        id TEXT PRIMARY KEY,
        proyecto_id TEXT NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
        nombre TEXT NOT NULL,
        orden_index INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS costos_partidas (
        id TEXT PRIMARY KEY,
        categoria_id TEXT NOT NULL REFERENCES costos_categorias(id) ON DELETE CASCADE,
        proyecto_id TEXT NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
        nombre TEXT NOT NULL,
        formula_tipo TEXT DEFAULT 'manual',
        formula_valor DOUBLE PRECISION DEFAULT 0,
        formula_referencia TEXT,
        formula_multiplicador DOUBLE PRECISION DEFAULT 1,
        formula_inicio_gantt TEXT,
        formula_fin_gantt TEXT,
        plan_pago TEXT,
        tiene_iva BOOLEAN DEFAULT FALSE,
        es_terreno BOOLEAN DEFAULT FALSE,
        total_neto DOUBLE PRECISION DEFAULT 0,
        orden_index INTEGER DEFAULT 0,
        distribucion_mensual JSONB DEFAULT '[]'::jsonb
      );

      CREATE TABLE IF NOT EXISTS financiamiento (
        id TEXT PRIMARY KEY,
        proyecto_id TEXT NOT NULL UNIQUE REFERENCES proyectos(id) ON DELETE CASCADE,
        credito_terreno_activo BOOLEAN DEFAULT TRUE,
        credito_terreno_pct DOUBLE PRECISION DEFAULT 70,
        credito_terreno_tasa DOUBLE PRECISION DEFAULT 3.5,
        credito_terreno_pago_intereses TEXT DEFAULT 'Semestral',
        credito_terreno_pago_capital TEXT DEFAULT 'Inicio Construccion',
        linea_construccion_activo BOOLEAN DEFAULT TRUE,
        linea_construccion_pct DOUBLE PRECISION DEFAULT 100,
        linea_construccion_tasa DOUBLE PRECISION DEFAULT 3.5,
        linea_construccion_pago_intereses TEXT DEFAULT 'Anual',
        linea_construccion_pago_capital TEXT DEFAULT 'Contra Escrituraciones',
        linea_adicional_activo BOOLEAN DEFAULT TRUE,
        linea_adicional_monto DOUBLE PRECISION DEFAULT 10000,
        linea_adicional_tasa DOUBLE PRECISION DEFAULT 3,
        linea_adicional_mes_inicio INTEGER DEFAULT 5,
        linea_adicional_mes_fin INTEGER DEFAULT 8,
        linea_adicional_pago_intereses TEXT DEFAULT 'Semestral',
        linea_adicional_pago_capital TEXT DEFAULT 'Contra Escrituraciones',
        activar_tope_deuda BOOLEAN DEFAULT FALSE,
        tope_deuda_uf DOUBLE PRECISION DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS capital_config (
        id TEXT PRIMARY KEY,
        proyecto_id TEXT NOT NULL UNIQUE REFERENCES proyectos(id) ON DELETE CASCADE,
        caja_minima_buffer DOUBLE PRECISION DEFAULT 2000,
        proyeccion_meses INTEGER DEFAULT 6,
        llamado_minimo DOUBLE PRECISION DEFAULT 5000,
        caja_fuerte_retencion DOUBLE PRECISION DEFAULT 10000,
        devolucion_minima DOUBLE PRECISION DEFAULT 3000
      );
    `);

    await query('ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS terraza_util_pct DOUBLE PRECISION DEFAULT 50');
    await query("ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS comunes_tipo TEXT DEFAULT 'porcentaje'");
    await query('ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS comunes_valor DOUBLE PRECISION DEFAULT 0');
    await query('ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS estacionamientos_cantidad INTEGER DEFAULT 0');
    await query('ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS estacionamientos_sup_interior DOUBLE PRECISION DEFAULT 0');
    await query('ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS estacionamientos_sup_terrazas DOUBLE PRECISION DEFAULT 0');
    await query('ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS bodegas_cantidad INTEGER DEFAULT 0');
    await query('ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS bodegas_sup_interior DOUBLE PRECISION DEFAULT 0');
    await query('ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS bodegas_sup_terrazas DOUBLE PRECISION DEFAULT 0');
    await query('ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS updated_by TEXT');
    await query("ALTER TABLE gantt_hitos ADD COLUMN IF NOT EXISTS dependencia_tipo TEXT DEFAULT 'fin'");
    await query('ALTER TABLE construccion ADD COLUMN IF NOT EXISTS pct_bajo_tierra_sobre_cota_0 DOUBLE PRECISION DEFAULT 0');
    await query('ALTER TABLE costos_partidas ADD COLUMN IF NOT EXISTS plan_pago TEXT');
  })();

  return initPromise;
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === '1';
}

async function upsertSingleRow(table, pid, data) {
  const columns = Object.keys(data);
  if (!columns.length) return;

  const insertColumns = ['id', 'proyecto_id', ...columns];
  const insertValues = [uuidv4(), pid, ...columns.map((column) => data[column])];
  const placeholders = insertColumns.map((_, index) => `$${index + 1}`).join(', ');
  const updates = columns.map((column, index) => `${column} = $${index + 3}`).join(', ');

  await query(
    `INSERT INTO ${table} (${insertColumns.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (proyecto_id) DO UPDATE SET ${updates}`,
    insertValues
  );
}

function normalizeUpdatedBy(value) {
  const normalized = String(value || '').trim();
  return normalized ? normalized.slice(0, 120) : null;
}

async function touchProject(pid, updatedBy = null) {
  await query(
    'UPDATE proyectos SET updated_at = NOW(), updated_by = COALESCE($2, updated_by) WHERE id = $1',
    [pid, normalizeUpdatedBy(updatedBy)]
  );
}

const proyectos = {
  async getAll() {
    await initDb();
    const result = await query('SELECT * FROM proyectos ORDER BY created_at DESC');
    return result.rows;
  },

  async getById(id) {
    await initDb();
    const result = await query('SELECT * FROM proyectos WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async create(data, updatedBy = null) {
    await initDb();
    const id = uuidv4();
    await query(
      `INSERT INTO proyectos (
        id, nombre, direccion, tipo, terraza_util_pct, comunes_tipo, comunes_valor,
        estacionamientos_cantidad, estacionamientos_sup_interior, estacionamientos_sup_terrazas,
        bodegas_cantidad, bodegas_sup_interior, bodegas_sup_terrazas, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        id,
        data.nombre,
        data.direccion || '',
        data.tipo || 'Residencial',
        data.terraza_util_pct ?? 50,
        data.comunes_tipo || 'porcentaje',
        data.comunes_valor || 0,
        data.estacionamientos_cantidad || 0,
        data.estacionamientos_sup_interior || 0,
        data.estacionamientos_sup_terrazas || 0,
        data.bodegas_cantidad || 0,
        data.bodegas_sup_interior || 0,
        data.bodegas_sup_terrazas || 0,
        normalizeUpdatedBy(updatedBy),
      ]
    );
    return id;
  },

  async update(id, data, updatedBy = null) {
    await initDb();
    await query(
      `UPDATE proyectos SET
        nombre = $1,
        direccion = $2,
        tipo = $3,
        terraza_util_pct = $4,
        comunes_tipo = $5,
        comunes_valor = $6,
        estacionamientos_cantidad = $7,
        estacionamientos_sup_interior = $8,
        estacionamientos_sup_terrazas = $9,
        bodegas_cantidad = $10,
        bodegas_sup_interior = $11,
        bodegas_sup_terrazas = $12,
        updated_by = COALESCE($13, updated_by),
        updated_at = NOW()
      WHERE id = $14`,
      [
        data.nombre,
        data.direccion || '',
        data.tipo || 'Residencial',
        data.terraza_util_pct ?? 50,
        data.comunes_tipo || 'porcentaje',
        data.comunes_valor || 0,
        data.estacionamientos_cantidad || 0,
        data.estacionamientos_sup_interior || 0,
        data.estacionamientos_sup_terrazas || 0,
        data.bodegas_cantidad || 0,
        data.bodegas_sup_interior || 0,
        data.bodegas_sup_terrazas || 0,
        normalizeUpdatedBy(updatedBy),
        id,
      ]
    );
  },

  async delete(id) {
    await initDb();
    await query('DELETE FROM proyectos WHERE id = $1', [id]);
  },
};

const cabida = {
  async getByProject(pid) {
    await initDb();
    const result = await query('SELECT * FROM cabida WHERE proyecto_id = $1 ORDER BY uso', [pid]);
    return result.rows;
  },

  async upsert(pid, rows, updatedBy = null) {
    await initDb();
    await withTransaction(async (client) => {
      await client.query('DELETE FROM cabida WHERE proyecto_id = $1', [pid]);
      for (const row of rows) {
        await client.query(
          `INSERT INTO cabida (
            id, proyecto_id, uso, cantidad, estacionamientos, bodegas,
            sup_interior, sup_terrazas, sup_comunes, sup_util_mun
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            uuidv4(),
            pid,
            row.uso,
            row.cantidad || 0,
            row.estacionamientos || 0,
            row.bodegas || 0,
            row.sup_interior || 0,
            row.sup_terrazas || 0,
            row.sup_comunes || 0,
            row.sup_util_mun || 0,
          ]
        );
      }
      await client.query(
        'UPDATE proyectos SET updated_at = NOW(), updated_by = COALESCE($2, updated_by) WHERE id = $1',
        [pid, normalizeUpdatedBy(updatedBy)]
      );
    });
  },
};

const gantt = {
  async getByProject(pid) {
    await initDb();
    const result = await query('SELECT * FROM gantt_hitos WHERE proyecto_id = $1 ORDER BY orden_index', [pid]);
    return result.rows;
  },

  async save(pid, hitos, updatedBy = null) {
    await initDb();
    await withTransaction(async (client) => {
      await client.query('DELETE FROM gantt_hitos WHERE proyecto_id = $1', [pid]);
      for (const [index, hito] of hitos.entries()) {
        await client.query(
          `INSERT INTO gantt_hitos (
            id, proyecto_id, nombre, color, dependencia, dependencia_tipo, desfase, inicio, duracion, fin, orden_index
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            hito.id || uuidv4(),
            pid,
            hito.nombre,
            hito.color || '#3b82f6',
            hito.dependencia || null,
            hito.dependencia_tipo || 'fin',
            hito.desfase || 0,
            hito.inicio || 0,
            hito.duracion || 0,
            hito.fin || 0,
            index,
          ]
        );
      }
      await client.query(
        'UPDATE proyectos SET updated_at = NOW(), updated_by = COALESCE($2, updated_by) WHERE id = $1',
        [pid, normalizeUpdatedBy(updatedBy)]
      );
    });
  },
};

const ventas = {
  async getConfig(pid) {
    await initDb();
    const result = await query('SELECT * FROM ventas_config WHERE proyecto_id = $1 ORDER BY uso', [pid]);
    return result.rows;
  },

  async getCronograma(pid) {
    await initDb();
    const result = await query(
      'SELECT * FROM ventas_cronograma WHERE proyecto_id = $1 ORDER BY mes_inicio, tipo',
      [pid]
    );
    return result.rows;
  },

  async saveConfig(pid, rows, updatedBy = null) {
    await initDb();
    await withTransaction(async (client) => {
      await client.query('DELETE FROM ventas_config WHERE proyecto_id = $1', [pid]);
      for (const row of rows) {
        await client.query(
          `INSERT INTO ventas_config (
            id, proyecto_id, uso, precio_uf_m2, precio_estacionamiento, precio_bodega,
            reserva_uf, pie_promesa_pct, pie_cuotas_pct, hipotecario_pct, pie_cuoton_pct
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            uuidv4(),
            pid,
            row.uso,
            row.precio_uf_m2 || 0,
            row.precio_estacionamiento || 0,
            row.precio_bodega || 0,
            row.reserva_uf || 0,
            row.pie_promesa_pct || 0,
            row.pie_cuotas_pct || 0,
            row.hipotecario_pct || 0,
            row.pie_cuoton_pct || 0,
          ]
        );
      }
      await client.query(
        'UPDATE proyectos SET updated_at = NOW(), updated_by = COALESCE($2, updated_by) WHERE id = $1',
        [pid, normalizeUpdatedBy(updatedBy)]
      );
    });
  },

  async saveCronograma(pid, rows, updatedBy = null) {
    await initDb();
    await withTransaction(async (client) => {
      await client.query('DELETE FROM ventas_cronograma WHERE proyecto_id = $1', [pid]);
      for (const row of rows) {
        await client.query(
          `INSERT INTO ventas_cronograma (
            id, proyecto_id, tipo, uso, vinculo_gantt, mes_inicio, duracion, porcentaje
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            uuidv4(),
            pid,
            row.tipo,
            row.uso,
            row.vinculo_gantt || null,
            row.mes_inicio || 0,
            row.duracion || 0,
            row.porcentaje || 0,
          ]
        );
      }
      await client.query(
        'UPDATE proyectos SET updated_at = NOW(), updated_by = COALESCE($2, updated_by) WHERE id = $1',
        [pid, normalizeUpdatedBy(updatedBy)]
      );
    });
  },
};

const construccion = {
  async get(pid) {
    await initDb();
    const result = await query('SELECT * FROM construccion WHERE proyecto_id = $1', [pid]);
    return result.rows[0] || null;
  },

  async save(pid, data, updatedBy = null) {
    await initDb();
    await upsertSingleRow('construccion', pid, {
      sup_sobre_tierra: data.sup_sobre_tierra || 0,
      costo_uf_m2_sobre_tierra: data.costo_uf_m2_sobre_tierra || 0,
      sup_bajo_tierra: data.sup_bajo_tierra || 0,
      pct_bajo_tierra_sobre_cota_0: data.pct_bajo_tierra_sobre_cota_0 || 0,
      costo_uf_m2_bajo_tierra: data.costo_uf_m2_bajo_tierra || 0,
      plazo_meses: data.plazo_meses || 0,
      anticipo_pct: data.anticipo_pct || 0,
      retencion_pct: data.retencion_pct || 0,
      ancho_curva: data.ancho_curva ?? 0.5,
      peak_gasto: data.peak_gasto ?? 0.5,
    });
    await touchProject(pid, updatedBy);
  },
};

const costos = {
  async getCategorias(pid) {
    await initDb();
    const result = await query('SELECT * FROM costos_categorias WHERE proyecto_id = $1 ORDER BY orden_index', [pid]);
    return result.rows;
  },

  async getPartidas(pid) {
    await initDb();
    const result = await query('SELECT * FROM costos_partidas WHERE proyecto_id = $1 ORDER BY orden_index', [pid]);
    return result.rows.map((row) => ({
      ...row,
      distribucion_mensual: Array.isArray(row.distribucion_mensual) ? row.distribucion_mensual : [],
    }));
  },

  async getPartidasByCategoria(catId) {
    await initDb();
    const result = await query('SELECT * FROM costos_partidas WHERE categoria_id = $1 ORDER BY orden_index', [catId]);
    return result.rows;
  },

  async saveAll(pid, categorias, updatedBy = null) {
    await initDb();
    await withTransaction(async (client) => {
      await client.query('DELETE FROM costos_partidas WHERE proyecto_id = $1', [pid]);
      await client.query('DELETE FROM costos_categorias WHERE proyecto_id = $1', [pid]);

      for (const [categoryIndex, categoria] of categorias.entries()) {
        const categoriaId = categoria.id || uuidv4();
        await client.query(
          'INSERT INTO costos_categorias (id, proyecto_id, nombre, orden_index) VALUES ($1, $2, $3, $4)',
          [categoriaId, pid, categoria.nombre, categoryIndex]
        );

        for (const [partidaIndex, partida] of (categoria.partidas || []).entries()) {
          await client.query(
            `INSERT INTO costos_partidas (
              id, categoria_id, proyecto_id, nombre, formula_tipo, formula_valor,
              formula_referencia, formula_multiplicador, formula_inicio_gantt, formula_fin_gantt,
              plan_pago, tiene_iva, es_terreno, total_neto, orden_index, distribucion_mensual
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)`,
            [
              partida.id || uuidv4(),
              categoriaId,
              pid,
              partida.nombre,
              partida.formula_tipo || 'manual',
              partida.formula_valor || 0,
              partida.formula_referencia || null,
              partida.formula_multiplicador || 1,
              partida.formula_inicio_gantt || null,
              partida.formula_fin_gantt || null,
              partida.plan_pago || null,
              normalizeBoolean(partida.tiene_iva),
              normalizeBoolean(partida.es_terreno),
              partida.total_neto || 0,
              partidaIndex,
              JSON.stringify(partida.distribucion_mensual || []),
            ]
          );
        }
      }
      await client.query(
        'UPDATE proyectos SET updated_at = NOW(), updated_by = COALESCE($2, updated_by) WHERE id = $1',
        [pid, normalizeUpdatedBy(updatedBy)]
      );
    });
  },
};

const financiamiento = {
  async get(pid) {
    await initDb();
    const result = await query('SELECT * FROM financiamiento WHERE proyecto_id = $1', [pid]);
    return result.rows[0] || null;
  },

  async save(pid, data, updatedBy = null) {
    await initDb();
    await upsertSingleRow('financiamiento', pid, data);
    await touchProject(pid, updatedBy);
  },
};

const capital = {
  async get(pid) {
    await initDb();
    const result = await query('SELECT * FROM capital_config WHERE proyecto_id = $1', [pid]);
    return result.rows[0] || null;
  },

  async save(pid, data, updatedBy = null) {
    await initDb();
    await upsertSingleRow('capital_config', pid, {
      caja_minima_buffer: data.caja_minima_buffer || 2000,
      proyeccion_meses: data.proyeccion_meses || 6,
      llamado_minimo: data.llamado_minimo || 5000,
      caja_fuerte_retencion: data.caja_fuerte_retencion || 10000,
      devolucion_minima: data.devolucion_minima || 3000,
    });
    await touchProject(pid, updatedBy);
  },
};

async function seedDemoProject() {
  await initDb();

  const existing = await query("SELECT id FROM proyectos WHERE nombre = 'Edificio Residencial Tipo'");
  if (existing.rows[0]) return existing.rows[0].id;

  const pid = uuidv4();
  await query(
    `INSERT INTO proyectos (
      id, nombre, direccion, tipo, terraza_util_pct, comunes_tipo, comunes_valor,
      estacionamientos_cantidad, estacionamientos_sup_interior, estacionamientos_sup_terrazas,
      bodegas_cantidad, bodegas_sup_interior, bodegas_sup_terrazas
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [pid, 'Edificio Residencial Tipo', 'Direccion en Las Condes, Las Condes', 'Residencial', 50, 'porcentaje', 20, 100, 12.5, 0, 50, 3.5, 0]
  );

  await cabida.upsert(pid, [
    { uso: 'DEPARTAMENTOS', cantidad: 50, estacionamientos: 0, bodegas: 0, sup_interior: 110.8, sup_terrazas: 10, sup_comunes: 0, sup_util_mun: 115.8 },
    { uso: 'ESTAC. VISITAS', cantidad: 10, estacionamientos: 0, bodegas: 0, sup_interior: 0, sup_terrazas: 0, sup_comunes: 0, sup_util_mun: 0 },
  ]);

  await gantt.save(pid, [
    { nombre: 'Adquisicion de Terreno', color: '#6366f1', dependencia: null, desfase: 0, inicio: 0, duracion: 1, fin: 1 },
    { nombre: 'Proyectistas', color: '#f59e0b', dependencia: 'Adquisicion de Terreno', desfase: 0, inicio: 1, duracion: 8, fin: 9 },
    { nombre: 'Permiso de Edificacion', color: '#10b981', dependencia: 'Proyectistas', desfase: 0, inicio: 9, duracion: 3, fin: 12 },
    { nombre: 'Licitacion Construccion', color: '#8b5cf6', dependencia: 'Permiso de Edificacion', desfase: 0, inicio: 12, duracion: 3, fin: 15 },
    { nombre: 'Construccion', color: '#ef4444', dependencia: 'Licitacion Construccion', desfase: 0, inicio: 15, duracion: 20, fin: 35 },
    { nombre: 'Recepcion Municipal', color: '#06b6d4', dependencia: 'Construccion', desfase: -1, inicio: 34, duracion: 4, fin: 38 },
    { nombre: 'Pre Ventas', color: '#ec4899', dependencia: 'Adquisicion de Terreno', desfase: 2, inicio: 3, duracion: 7, fin: 10 },
    { nombre: 'Ventas', color: '#3b82f6', dependencia: 'Pre Ventas', desfase: 0, inicio: 10, duracion: 31, fin: 41 },
    { nombre: 'Escrituracion', color: '#f97316', dependencia: 'Recepcion Municipal', desfase: 0, inicio: 38, duracion: 7, fin: 45 },
    { nombre: 'Mantencion Proyecto', color: '#22c55e', dependencia: 'Recepcion Municipal', desfase: 0, inicio: 38, duracion: 7, fin: 45 },
    { nombre: 'Postventa', color: '#a855f7', dependencia: 'Recepcion Municipal', desfase: 0, inicio: 38, duracion: 19, fin: 57 },
  ]);

  await ventas.saveConfig(pid, [
    { uso: 'DEPTOS', precio_uf_m2: 105, precio_estacionamiento: 350, precio_bodega: 100, reserva_uf: 50, pie_promesa_pct: 5, pie_cuotas_pct: 10, hipotecario_pct: 85, pie_cuoton_pct: 0 },
  ]);

  await ventas.saveCronograma(pid, [
    { tipo: 'PREVENTA', uso: 'DEPTOS', vinculo_gantt: 'Adquisicion de Terreno', mes_inicio: 3, duracion: 7, porcentaje: 20 },
    { tipo: 'VENTA', uso: 'DEPTOS', vinculo_gantt: 'Pre Ventas', mes_inicio: 10, duracion: 31, porcentaje: 80 },
    { tipo: 'ESCRITURACION', uso: 'DEPTOS', vinculo_gantt: 'Recepcion Municipal', mes_inicio: 38, duracion: 7, porcentaje: 0 },
  ]);

  await construccion.save(pid, {
    sup_sobre_tierra: 7146,
    costo_uf_m2_sobre_tierra: 27,
    sup_bajo_tierra: 3241,
    pct_bajo_tierra_sobre_cota_0: 45.35,
    costo_uf_m2_bajo_tierra: 15,
    plazo_meses: 20,
    anticipo_pct: 15,
    retencion_pct: 5,
    ancho_curva: 0.5,
    peak_gasto: 0.5,
  });

  await costos.saveAll(pid, [
    { nombre: 'TERRENO', partidas: [
      { nombre: 'Compra del Terreno', formula_tipo: 'm2_terreno_x_valor', formula_valor: 60, formula_multiplicador: 1, es_terreno: true, tiene_iva: false, total_neto: 132000 },
      { nombre: 'Comision Corredor', formula_tipo: 'referencia_x_pct', formula_referencia: 'Compra del Terreno', formula_multiplicador: 0.02, tiene_iva: true, es_terreno: false, total_neto: 2640 },
      { nombre: 'Gastos Legales Terreno', formula_tipo: 'manual', formula_valor: 100, tiene_iva: true, es_terreno: false, total_neto: 100 },
      { nombre: 'Contribuciones', formula_tipo: 'duracion_gantt', formula_valor: 150, formula_referencia: 'Adquisicion de Terreno>Recepcion Municipal', formula_multiplicador: 3, tiene_iva: false, es_terreno: false, total_neto: 1850 },
      { nombre: 'Supresion de Empalmes', formula_tipo: 'manual', formula_valor: 100, tiene_iva: true, es_terreno: false, total_neto: 100 },
    ]},
    { nombre: 'PROYECTISTAS', partidas: [
      { nombre: 'Topografia', formula_tipo: 'manual', formula_valor: 50, tiene_iva: true, total_neto: 50 },
      { nombre: 'Arquitectura', formula_tipo: 'm2_vendible_x_valor', formula_valor: 0.8, formula_referencia: 'm2_vendible_deptos', tiene_iva: true, total_neto: 4632 },
      { nombre: 'Rev. Indep. Arquitectura', formula_tipo: 'referencia_x_pct', formula_valor: 0.3, formula_referencia: 'Permisos y Derechos Mun', formula_multiplicador: 0.7, tiene_iva: false, total_neto: 467 },
      { nombre: 'Mecanica de Suelos', formula_tipo: 'manual', formula_valor: 300, tiene_iva: true, total_neto: 300 },
      { nombre: 'Calculista', formula_tipo: 'm2_losa_x_valor', formula_valor: 0.125, formula_referencia: 'm2_losa_total', tiene_iva: true, total_neto: 1298 },
      { nombre: 'Rev. Indep. Calculo', formula_tipo: 'm2_losa_x_valor', formula_valor: 0.025, formula_referencia: 'm2_losa_total', tiene_iva: false, total_neto: 260 },
      { nombre: 'Sanitario', formula_tipo: 'manual', formula_valor: 125, tiene_iva: true, total_neto: 125 },
      { nombre: 'Electrico y CCDD', formula_tipo: 'manual', formula_valor: 200, tiene_iva: true, total_neto: 200 },
      { nombre: 'Evacuacion', formula_tipo: 'manual', formula_valor: 75, tiene_iva: true, total_neto: 75 },
      { nombre: 'Seguridad', formula_tipo: 'manual', formula_valor: 100, tiene_iva: true, total_neto: 100 },
      { nombre: 'Residuos Solidos', formula_tipo: 'manual', formula_valor: 50, tiene_iva: true, total_neto: 50 },
      { nombre: 'Iluminacion', formula_tipo: 'manual', formula_valor: 150, tiene_iva: true, total_neto: 150 },
      { nombre: 'Cocina', formula_tipo: 'manual', formula_valor: 200, tiene_iva: true, total_neto: 200 },
      { nombre: 'Domotica', formula_tipo: 'manual', formula_valor: 100, tiene_iva: true, total_neto: 100 },
      { nombre: 'Ascensores', formula_tipo: 'manual', formula_valor: 200, tiene_iva: true, total_neto: 200 },
      { nombre: 'Eficiencia Energetica', formula_tipo: 'manual', formula_valor: 400, tiene_iva: true, total_neto: 400 },
      { nombre: 'Impermeabilizacion', formula_tipo: 'manual', formula_valor: 150, tiene_iva: true, total_neto: 150 },
      { nombre: 'Pavimentacion', formula_tipo: 'manual', formula_valor: 125, tiene_iva: true, total_neto: 125 },
      { nombre: 'Paisajismo', formula_tipo: 'manual', formula_valor: 400, tiene_iva: true, total_neto: 400 },
      { nombre: 'Equipamiento Comun', formula_tipo: 'manual', formula_valor: 200, tiene_iva: true, total_neto: 200 },
      { nombre: 'Coordinacion BIM', formula_tipo: 'duracion_gantt', formula_valor: 100, formula_referencia: 'Construccion', tiene_iva: true, total_neto: 2000 },
      { nombre: 'Otros Proyectistas', formula_tipo: 'manual', formula_valor: 500, tiene_iva: true, total_neto: 500 },
    ]},
    { nombre: 'FEES GESTION', partidas: [
      { nombre: 'Fee Gestion Proyecto', formula_tipo: 'pct_ventas_mensual', formula_valor: 0.06, tiene_iva: true, total_neto: 38877 },
    ]},
    { nombre: 'CONSTRUCCION', partidas: [
      { nombre: 'Contrato Construccion', formula_tipo: 'curva_s', formula_valor: 0, tiene_iva: true, total_neto: 241557 },
    ]},
    { nombre: 'MITIGACIONES', partidas: [
      { nombre: 'Mitigacion Vial', formula_tipo: 'manual', formula_valor: 200, tiene_iva: true, total_neto: 200 },
      { nombre: 'Mitigacion MINVU', formula_tipo: 'm2_losa_x_valor', formula_valor: 0.024, tiene_iva: false, total_neto: 2916 },
    ]},
    { nombre: 'SV-PILOTO-MKT', partidas: [
      { nombre: 'Sala de Ventas', formula_tipo: 'manual', formula_valor: 500, tiene_iva: true, total_neto: 500 },
      { nombre: 'Publicidad Digital', formula_tipo: 'manual', formula_valor: 200, tiene_iva: true, total_neto: 4000 },
      { nombre: 'Material Impreso', formula_tipo: 'manual', formula_valor: 120, tiene_iva: true, total_neto: 1941 },
    ]},
    { nombre: 'ESTUDIOS Y ASESORIAS', partidas: [
      { nombre: 'Estudio de Mercado', formula_tipo: 'manual', formula_valor: 100, tiene_iva: true, total_neto: 100 },
      { nombre: 'Asesoria Legal', formula_tipo: 'manual', formula_valor: 300, tiene_iva: true, total_neto: 2500 },
    ]},
    { nombre: 'GASTOS DE VENTA', partidas: [
      { nombre: 'Comision Venta', formula_tipo: 'pct_ventas', formula_valor: 0, tiene_iva: true, total_neto: 0 },
    ]},
    { nombre: 'PERMISOS Y DERECHOS MUN.', partidas: [
      { nombre: 'Permiso de Edificacion', formula_tipo: 'm2_losa_x_valor', formula_valor: 0, tiene_iva: false, total_neto: 0 },
    ]},
    { nombre: 'INTERESES FIN.', partidas: [
      { nombre: 'Intereses Credito Terreno', formula_tipo: 'calculado', formula_valor: 0, tiene_iva: true, total_neto: 3773 },
      { nombre: 'Intereses Linea Construccion', formula_tipo: 'calculado', formula_valor: 0, tiene_iva: true, total_neto: 12157 },
      { nombre: 'Intereses Linea Adicional', formula_tipo: 'calculado', formula_valor: 0, tiene_iva: true, total_neto: 863 },
    ]},
    { nombre: 'MANTENCION', partidas: [
      { nombre: 'Mantencion Mensual', formula_tipo: 'manual', formula_valor: 247, tiene_iva: true, total_neto: 3623 },
    ]},
    { nombre: 'POSTVENTA', partidas: [
      { nombre: 'Fondo Postventa', formula_tipo: 'pct_ventas', formula_valor: 0, tiene_iva: true, total_neto: 0 },
    ]},
    { nombre: 'OTROS', partidas: [
      { nombre: 'Gastos Notariales', formula_tipo: 'manual', formula_valor: 9, tiene_iva: true, total_neto: 1332 },
      { nombre: 'Impuestos Municipales', formula_tipo: 'manual', formula_valor: 41, tiene_iva: false, total_neto: 1184 },
      { nombre: 'Gastos Bancarios', formula_tipo: 'manual', formula_valor: 50, tiene_iva: true, total_neto: 1614 },
    ]},
  ]);

  await financiamiento.save(pid, {
    credito_terreno_activo: true,
    credito_terreno_pct: 70,
    credito_terreno_tasa: 3.5,
    credito_terreno_pago_intereses: 'Semestral',
    credito_terreno_pago_capital: 'Inicio Construccion',
    linea_construccion_activo: true,
    linea_construccion_pct: 100,
    linea_construccion_tasa: 3.5,
    linea_construccion_pago_intereses: 'Anual',
    linea_construccion_pago_capital: 'Contra Escrituraciones',
    linea_adicional_activo: true,
    linea_adicional_monto: 10000,
    linea_adicional_tasa: 3,
    linea_adicional_mes_inicio: 5,
    linea_adicional_mes_fin: 8,
    linea_adicional_pago_intereses: 'Semestral',
    linea_adicional_pago_capital: 'Contra Escrituraciones',
    activar_tope_deuda: false,
    tope_deuda_uf: 0,
  });

  await capital.save(pid, {
    caja_minima_buffer: 2000,
    proyeccion_meses: 6,
    llamado_minimo: 5000,
    caja_fuerte_retencion: 10000,
    devolucion_minima: 3000,
  });

  return pid;
}

module.exports = {
  pool,
  initDb,
  proyectos,
  cabida,
  gantt,
  ventas,
  construccion,
  costos,
  financiamiento,
  capital,
  touchProject,
  seedDemoProject,
};
