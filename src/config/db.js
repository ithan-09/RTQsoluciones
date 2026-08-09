const { Pool } = require('pg');

// Pega aquí la External Database URL copiada de Render
const connectionString = 'postgresql://db_python_kfjg_user:wXTkNfQwolBT9upuoKtyyJgJxp4Jtx7T@dpg-d9ip4pbtqb8s7397ig4g-a.oregon-postgres.render.com/db_python_bzk9';

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error al conectar a PostgreSQL:', err.message);
  }
  console.log('✅ Conexión exitosa a la base de datos PostgreSQL');
  release();
});

module.exports = pool;