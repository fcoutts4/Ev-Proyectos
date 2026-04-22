const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const {
  initDb,
  proyectos,
  cabida,
  gantt,
  ventas,
  construccion,
  costos,
  financiamiento,
  capital,
  seedDemoProject,
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const bootstrapPromise = (async () => {
  await initDb();
  await seedDemoProject();
})();

app.use(asyncHandler(async (_req, _res, next) => {
  await bootstrapPromise;
  next();
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/proyectos', asyncHandler(async (req, res) => {
  res.json(await proyectos.getAll());
}));

app.get('/api/proyectos/:id', asyncHandler(async (req, res) => {
  const proyecto = await proyectos.getById(req.params.id);
  if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });
  res.json(proyecto);
}));

app.post('/api/proyectos', asyncHandler(async (req, res) => {
  const id = await proyectos.create(req.body);
  res.json({ id, ...req.body });
}));

app.put('/api/proyectos/:id', asyncHandler(async (req, res) => {
  await proyectos.update(req.params.id, req.body);
  res.json({ success: true });
}));

app.delete('/api/proyectos/:id', asyncHandler(async (req, res) => {
  await proyectos.delete(req.params.id);
  res.json({ success: true });
}));

app.get('/api/proyectos/:id/cabida', asyncHandler(async (req, res) => {
  res.json(await cabida.getByProject(req.params.id));
}));

app.post('/api/proyectos/:id/cabida', asyncHandler(async (req, res) => {
  await cabida.upsert(req.params.id, req.body);
  res.json({ success: true });
}));

app.get('/api/proyectos/:id/gantt', asyncHandler(async (req, res) => {
  res.json(await gantt.getByProject(req.params.id));
}));

app.post('/api/proyectos/:id/gantt', asyncHandler(async (req, res) => {
  await gantt.save(req.params.id, req.body);
  res.json({ success: true });
}));

app.get('/api/proyectos/:id/ventas', asyncHandler(async (req, res) => {
  res.json({
    config: await ventas.getConfig(req.params.id),
    cronograma: await ventas.getCronograma(req.params.id),
  });
}));

app.post('/api/proyectos/:id/ventas/config', asyncHandler(async (req, res) => {
  await ventas.saveConfig(req.params.id, req.body);
  res.json({ success: true });
}));

app.post('/api/proyectos/:id/ventas/cronograma', asyncHandler(async (req, res) => {
  await ventas.saveCronograma(req.params.id, req.body);
  res.json({ success: true });
}));

app.get('/api/proyectos/:id/construccion', asyncHandler(async (req, res) => {
  res.json((await construccion.get(req.params.id)) || {});
}));

app.post('/api/proyectos/:id/construccion', asyncHandler(async (req, res) => {
  await construccion.save(req.params.id, req.body);
  res.json({ success: true });
}));

app.get('/api/proyectos/:id/costos', asyncHandler(async (req, res) => {
  const categorias = await costos.getCategorias(req.params.id);
  const partidas = await costos.getPartidas(req.params.id);
  const result = categorias.map((categoria) => ({
    ...categoria,
    partidas: partidas.filter((partida) => partida.categoria_id === categoria.id),
  }));
  res.json(result);
}));

app.post('/api/proyectos/:id/costos', asyncHandler(async (req, res) => {
  await costos.saveAll(req.params.id, req.body);
  res.json({ success: true });
}));

app.get('/api/proyectos/:id/financiamiento', asyncHandler(async (req, res) => {
  res.json((await financiamiento.get(req.params.id)) || {});
}));

app.post('/api/proyectos/:id/financiamiento', asyncHandler(async (req, res) => {
  await financiamiento.save(req.params.id, req.body);
  res.json({ success: true });
}));

app.get('/api/proyectos/:id/capital', asyncHandler(async (req, res) => {
  res.json((await capital.get(req.params.id)) || {});
}));

app.post('/api/proyectos/:id/capital', asyncHandler(async (req, res) => {
  await capital.save(req.params.id, req.body);
  res.json({ success: true });
}));

app.get('/api/proyectos/:id/calculos', asyncHandler(async (req, res) => {
  const pid = req.params.id;
  const cab = await cabida.getByProject(pid);
  const ventasConfig = await ventas.getConfig(pid);
  const partidas = await costos.getPartidas(pid);

  let supVendible = 0;
  let supLosa = 0;
  cab.forEach((row) => {
    const cantidad = row.cantidad || 1;
    const vendible = (row.sup_interior || 0) + (row.sup_terrazas || 0);
    const losa = vendible + (row.sup_comunes || 0);
    supVendible += vendible * cantidad;
    supLosa += losa * cantidad;
  });

  let ventasBrutas = 0;
  ventasConfig.forEach((venta) => {
    const cabRow = cab.find((row) => row.uso.toUpperCase().includes((venta.uso || '').toUpperCase()));
    if (!cabRow) return;

    const precioBase = ((cabRow.sup_interior || 0) + (cabRow.sup_terrazas || 0)) * (venta.precio_uf_m2 || 0);
    const subtotalPrincipal = precioBase * (cabRow.cantidad || 0);
    const subtotalEstac = (cabRow.estacionamientos || 0) * (venta.precio_estacionamiento || 0);
    const subtotalBodega = (cabRow.bodegas || 0) * (venta.precio_bodega || 0);
    ventasBrutas += subtotalPrincipal + subtotalEstac + subtotalBodega;
  });

  let costosNetos = 0;
  partidas.forEach((partida) => {
    costosNetos += partida.total_neto || 0;
  });

  let ivaCredito = 0;
  partidas
    .filter((partida) => partida.tiene_iva && !partida.es_terreno)
    .forEach((partida) => {
      ivaCredito += (partida.total_neto || 0) * 0.19;
    });

  const margenNeto = ventasBrutas - costosNetos;
  const margenPct = ventasBrutas > 0 ? (margenNeto / ventasBrutas) * 100 : 0;

  res.json({
    ventas_brutas: Math.round(ventasBrutas),
    costos_netos: Math.round(costosNetos),
    iva_credito: Math.round(ivaCredito),
    margen_neto: Math.round(margenNeto),
    margen_pct: Number(margenPct.toFixed(1)),
    sup_vendible: Math.round(supVendible),
    sup_losa: Math.round(supLosa),
  });
}));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Error interno del servidor' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}

module.exports = app;
