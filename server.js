const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const {
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

try {
  seedDemoProject();
} catch (error) {
  console.log('Seed skipped:', error.message);
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/proyectos', (req, res) => {
  try {
    res.json(proyectos.getAll());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/proyectos/:id', (req, res) => {
  try {
    const proyecto = proyectos.getById(req.params.id);
    if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });
    res.json(proyecto);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/proyectos', (req, res) => {
  try {
    const id = proyectos.create(req.body);
    res.json({ id, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/proyectos/:id', (req, res) => {
  try {
    proyectos.update(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/proyectos/:id', (req, res) => {
  try {
    proyectos.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/proyectos/:id/cabida', (req, res) => {
  try {
    res.json(cabida.getByProject(req.params.id));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/proyectos/:id/cabida', (req, res) => {
  try {
    cabida.upsert(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/proyectos/:id/gantt', (req, res) => {
  try {
    res.json(gantt.getByProject(req.params.id));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/proyectos/:id/gantt', (req, res) => {
  try {
    gantt.save(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/proyectos/:id/ventas', (req, res) => {
  try {
    res.json({
      config: ventas.getConfig(req.params.id),
      cronograma: ventas.getCronograma(req.params.id),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/proyectos/:id/ventas/config', (req, res) => {
  try {
    ventas.saveConfig(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/proyectos/:id/ventas/cronograma', (req, res) => {
  try {
    ventas.saveCronograma(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/proyectos/:id/construccion', (req, res) => {
  try {
    res.json(construccion.get(req.params.id) || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/proyectos/:id/construccion', (req, res) => {
  try {
    construccion.save(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/proyectos/:id/costos', (req, res) => {
  try {
    const categorias = costos.getCategorias(req.params.id);
    const partidas = costos.getPartidas(req.params.id);
    const result = categorias.map((categoria) => ({
      ...categoria,
      partidas: partidas
        .filter((partida) => partida.categoria_id === categoria.id)
        .map((partida) => ({
          ...partida,
          distribucion_mensual: JSON.parse(partida.distribucion_mensual || '[]'),
        })),
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/proyectos/:id/costos', (req, res) => {
  try {
    costos.saveAll(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/proyectos/:id/financiamiento', (req, res) => {
  try {
    res.json(financiamiento.get(req.params.id) || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/proyectos/:id/financiamiento', (req, res) => {
  try {
    financiamiento.save(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/proyectos/:id/capital', (req, res) => {
  try {
    res.json(capital.get(req.params.id) || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/proyectos/:id/capital', (req, res) => {
  try {
    capital.save(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/proyectos/:id/calculos', (req, res) => {
  try {
    const pid = req.params.id;
    const cab = cabida.getByProject(pid);
    const ventasConfig = ventas.getConfig(pid);
    const partidas = costos.getPartidas(pid);

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
      const cabRow = cab.find((row) => row.uso.toUpperCase().includes(venta.uso.toUpperCase()));
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
