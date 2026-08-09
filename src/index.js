const express = require('express');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const upload = multer({ dest: 'uploads/' }); // Carpeta donde se guardarán las fotos

// Conexión a Base de Datos
const pool = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static('src/public'));
app.use('/uploads', express.static('uploads'));

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
  const { nombre, dni, telefono, modelo, imei, clave, falla, reparacion, estado } = req.body;

  const fallaReportada = falla || reparacion || 'Sin especificación';
  const estadoOrden = estado || 'Ingresado';
  const imeiValor = imei || 'N/A';
  const claveValor = clave || 'N/A';
  const dniValor = dni || 'N/A';

  try {
    await pool.query(
      `INSERT INTO talleres (id, nombre_taller) 
       VALUES (1, 'Taller Principal') 
       ON CONFLICT (id) DO NOTHING`
    );

    const clienteRes = await pool.query(
      `INSERT INTO clientes (taller_id, nombre, dni_cedula, telefono) 
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [1, nombre, dniValor, telefono]
    );
    const clienteId = clienteRes.rows[0].id;

    const ordenRes = await pool.query(
      `INSERT INTO ordenes_servicio (taller_id, cliente_id, marca, modelo, imei, patron_pin, falla_reportada, estado) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [1, clienteId, 'Genérico', modelo, imeiValor, claveValor, fallaReportada, estadoOrden]
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

app.put('/api/ordenes/:id/estado', async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  try {
    await pool.query(
      `UPDATE ordenes_servicio SET estado = $1 WHERE id = $2`,
      [estado, id]
    );
    res.json({ mensaje: 'Estado actualizado correctamente' });
  } catch (err) {
    console.error('Error al actualizar el estado en la BD:', err);
    res.status(500).json({ error: 'Error al actualizar el estado' });
  }
});

app.post('/api/citas', async (req, res) => {
  const { servicio, nombre_cliente, telefono, fecha_cita, hora_inicio } = req.body;

  if (!servicio || !nombre_cliente || !telefono || !fecha_cita || !hora_inicio) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios para agendar la cita.' });
  }

  try {
    const horaFin = new Date(`1970-01-01T${hora_inicio}:00`);
    horaFin.setHours(horaFin.getHours() + 2);
    const hora_fin = horaFin.toTimeString().slice(0, 8);

    const colision = await pool.query(
      `SELECT * FROM citas
       WHERE fecha_cita = $1
       AND (($2::time >= hora_inicio AND $2::time < hora_fin)
            OR ($3::time > hora_inicio AND $3::time <= hora_fin)
            OR ($2::time <= hora_inicio AND $3::time >= hora_fin))`,
      [fecha_cita, hora_inicio, hora_fin]
    );

    if (colision.rows.length > 0) {
      return res.status(400).json({ error: 'Este horario de 2 horas ya se encuentra ocupado. Elige otro.' });
    }

    await pool.query(
      `INSERT INTO citas (servicio, nombre_cliente, telefono, fecha_cita, hora_inicio, hora_fin)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [servicio, nombre_cliente, telefono, fecha_cita, hora_inicio, hora_fin]
    );

    res.status(201).json({ mensaje: 'Cita agendada correctamente' });
  } catch (err) {
    console.error('Error al guardar la cita:', err);
    res.status(500).json({ error: 'Error interno al guardar la cita' });
  }
});

// Ruta para subir productos con imagen
app.post('/api/productos', upload.single('imagen'), async (req, res) => {
  const { nombre, precio } = req.body;
  const url_imagen = req.file ? req.file.path : null;

  if (!nombre || !precio || !url_imagen) {
    return res.status(400).json({ error: 'Nombre, precio e imagen son obligatorios.' });
  }

  try {
    const nuevoProducto = await pool.query(
      'INSERT INTO inventario (nombre, precio, url_imagen) VALUES ($1, $2, $3) RETURNING *',
      [nombre, precio, url_imagen]
    );
    res.json(nuevoProducto.rows[0]);
  } catch (err) {
    console.error('Error al guardar el producto:', err);
    res.status(500).send('Error al guardar el producto');
  }
});

// Obtener productos disponibles para clientes
app.get('/api/productos', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM inventario ORDER BY id DESC');
    res.json(resultado.rows);
  } catch (err) {
    console.error('Error al obtener el inventario:', err);
    res.status(500).json({ error: 'Error al obtener el inventario' });
  }
});

// Ruta para subir la foto del teléfono como Base64 a la tabla orden_fotos
app.post('/api/orden-fotos', async (req, res) => {
  const { orden_id, imagen_base64 } = req.body;

  if (!orden_id || !imagen_base64) {
    return res.status(400).json({ error: 'orden_id e imagen_base64 son obligatorios.' });
  }

  try {
    const resultado = await pool.query(
      'INSERT INTO orden_fotos (orden_id, url) VALUES ($1, $2) RETURNING *',
      [orden_id, imagen_base64]
    );
    res.json({ success: true, foto: resultado.rows[0] });
  } catch (err) {
    console.error('Error al guardar la imagen en la base de datos:', err);
    res.status(500).json({ error: 'Error al guardar la imagen en la base de datos' });
  }
});

// Obtener detalles de una orden específica con su cliente
app.get('/api/ordenes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT o.id, c.nombre AS cliente, c.telefono, c.dni_cedula, o.modelo, o.falla_reportada, o.estado 
       FROM ordenes_servicio o 
       JOIN clientes c ON o.cliente_id = c.id 
       WHERE o.id = $1`,
      [id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error('Error al obtener detalles de orden:', err);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Obtener las fotos asociadas a una orden
app.get('/api/ordenes/:id/fotos', async (req, res) => {
  const { id } = req.params;
  try {
    const fotos = await pool.query(`SELECT * FROM orden_fotos WHERE orden_id = $1`, [id]);
    res.json(fotos.rows);
  } catch (err) {
    console.error('Error al obtener fotos:', err);
    res.status(500).json({ error: 'Error al obtener fotos' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});