CREATE TABLE facturadirecta_exports (
  quote_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending', 'uncertain', 'created', 'review')),
  draft INTEGER NOT NULL CHECK (draft IN (0, 1)),
  invoice_id TEXT,
  formatted_number TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE facturadirecta_clients (
  tax_code TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  client_id TEXT
);
