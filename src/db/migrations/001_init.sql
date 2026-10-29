-- Esquema inicial de MAREA Surfwear.
-- Pensado para crecer: categorías, productos, imágenes, talles, variantes (stock por talle),
-- clientes, pedidos, detalle de pedidos y administradores están en tablas separadas.

CREATE TABLE categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  slug        TEXT    NOT NULL UNIQUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

CREATE TABLE products (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id       INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  slug              TEXT    NOT NULL UNIQUE,
  name              TEXT    NOT NULL,
  short_description TEXT    NOT NULL DEFAULT '',
  description       TEXT    NOT NULL DEFAULT '',
  material          TEXT    NOT NULL DEFAULT '',
  features          TEXT    NOT NULL DEFAULT '[]',        -- JSON: array de strings
  price             INTEGER NOT NULL CHECK (price >= 0),   -- pesos argentinos, sin decimales
  compare_at_price  INTEGER CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  featured          INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active   ON products(active, featured);

CREATE TABLE product_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         TEXT    NOT NULL,
  alt         TEXT    NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_product_images_product ON product_images(product_id, sort_order);

-- Catálogo de talles (XS, S, M... o "Único", "38", etc.). Reutilizable por cualquier producto.
CREATE TABLE sizes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Variante = producto + talle. Acá vive el stock.
CREATE TABLE product_variants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size_id     INTEGER NOT NULL REFERENCES sizes(id) ON DELETE RESTRICT,
  sku         TEXT,
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  UNIQUE (product_id, size_id)
);
CREATE INDEX idx_variants_product ON product_variants(product_id);

CREATE TABLE customers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  phone       TEXT NOT NULL UNIQUE,
  email       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  code             TEXT    NOT NULL UNIQUE,
  customer_id      INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  status           TEXT    NOT NULL DEFAULT 'pendiente'
                   CHECK (status IN ('pendiente','confirmado','preparando','enviado','entregado','cancelado')),
  -- Datos del cliente al momento de la compra (snapshot)
  customer_first_name TEXT NOT NULL,
  customer_last_name  TEXT NOT NULL,
  customer_phone      TEXT NOT NULL,
  delivery_method  TEXT    NOT NULL,
  payment_method   TEXT    NOT NULL,
  ship_street      TEXT    NOT NULL DEFAULT '',
  ship_number      TEXT    NOT NULL DEFAULT '',
  ship_city        TEXT    NOT NULL DEFAULT '',
  ship_province    TEXT    NOT NULL DEFAULT '',
  ship_postal_code TEXT    NOT NULL DEFAULT '',
  ship_notes       TEXT    NOT NULL DEFAULT '',
  subtotal         INTEGER NOT NULL,
  shipping_cost    INTEGER NOT NULL DEFAULT 0,
  total            INTEGER NOT NULL,
  stock_released   INTEGER NOT NULL DEFAULT 0 CHECK (stock_released IN (0,1)),
  admin_notes      TEXT    NOT NULL DEFAULT '',
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_orders_status  ON orders(status, created_at);
CREATE INDEX idx_orders_created ON orders(created_at);

CREATE TABLE order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id   INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT    NOT NULL,
  size_name    TEXT    NOT NULL,
  unit_price   INTEGER NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  subtotal     INTEGER NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE order_status_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status      TEXT    NOT NULL,
  admin_id    INTEGER,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE admins (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL DEFAULT '',
  password_hash  TEXT NOT NULL,
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at  TEXT
);

CREATE TABLE admin_sessions (
  token_hash  TEXT PRIMARY KEY,                 -- sha256 del token que viaja en la cookie
  admin_id    INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  csrf_token  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_admin_sessions_exp ON admin_sessions(expires_at);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL DEFAULT ''
);
