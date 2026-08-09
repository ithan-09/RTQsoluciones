const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Conexión a Base de Datos
const pool = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('src/public'));

// Ruta de comprobación
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', mensaje: 'Servidor SaaS para Talleres activo' });
});

// GET: Obtener todas las órdenes de la base de datos
app.get('/api/ordenes', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT o.id, c.nombre AS cliente, c.telefono, o.modelo, o.imei, o.falla_reportada, o.estado 
       FROM ordenes_servicio o 
       JOIN clientes c ON o.cliente_id = c.id 
       ORDER BY o.id DESC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error('Error al obtener órdenes:', err);
    res.status(500).json({ error: 'Error al consultar la base de datos' });
  }
});

// POST: Guardar Cliente y Orden de Servicio
app.post('/api/ordenes', async (req, res) => {
  const { nombre, telefono, modelo, imei, clave, falla } = req.body;

  try {
    // 0. Crear el registro base del taller (ID = 1)
    await pool.query(
      `INSERT INTO talleres (id, nombre_taller) 
       VALUES (1, 'Taller Principal') 
       ON CONFLICT (id) DO NOTHING`
    );

    // 1. Insertar el cliente
    const clienteRes = await pool.query(
      `INSERT INTO clientes (taller_id, nombre, telefono) 
       VALUES ($1, $2, $3) RETURNING id`,
      [1, nombre, telefono]
    );
    const clienteId = clienteRes.rows[0].id;

    // 2. Insertar la orden de servicio
    const ordenRes = await pool.query(
      `INSERT INTO ordenes_servicio (taller_id, cliente_id, marca, modelo, imei, patron_pin, falla_reportada, estado) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [1, clienteId, 'Generico', modelo, imei, clave, falla, 'Ingresado']
    );

    const ordenId = ordenRes.rows[0].id;

    res.status(201).json({
      mensaje: 'Orden creada correctamente',
      ordenId: ordenId
    });

  } catch (err) {
    console.error('Error al guardar la orden:', err);
    res.status(500).json({ error: 'Error interno en la base de datos' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});