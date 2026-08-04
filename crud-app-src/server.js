const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const APP_VERSION = process.env.APP_VERSION || '1.0.0';
const APP_FEATURES = (process.env.APP_FEATURES || '').split(',').filter(Boolean);

const pool = new Pool({
  host: process.env.PGHOST || 'postgres',
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'crud',
});

async function initDb(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS items (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_at TIMESTAMPTZ DEFAULT now()
        )
      `);
      console.log('DB ready');
      return;
    } catch (err) {
      console.log(`DB not ready (attempt ${i + 1}/${retries}): ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('Could not connect to DB');
}

app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/version', (req, res) => res.json({ version: APP_VERSION, features: APP_FEATURES }));

app.get('/items', async (req, res) => {
  const result = await pool.query('SELECT * FROM items ORDER BY id');
  res.json(result.rows);
});

app.get('/items/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM items WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'not found' });
  res.json(result.rows[0]);
});

app.post('/items', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const result = await pool.query(
    'INSERT INTO items (name, description) VALUES ($1, $2) RETURNING *',
    [name, description || null]
  );
  res.status(201).json(result.rows[0]);
});

app.put('/items/:id', async (req, res) => {
  const { name, description } = req.body;
  const result = await pool.query(
    'UPDATE items SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 RETURNING *',
    [name, description, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'not found' });
  res.json(result.rows[0]);
});

app.delete('/items/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM items WHERE id = $1 RETURNING *', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'not found' });
  res.status(204).send();
});

const PORT = process.env.PORT || 8080;
initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`crud-app v${APP_VERSION} listening on ${PORT}`));
  })
  .catch((err) => {
    console.error('Fatal: could not initialize DB', err);
    process.exit(1);
  });
