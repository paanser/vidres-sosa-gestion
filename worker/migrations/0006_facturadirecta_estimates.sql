ALTER TABLE facturadirecta_exports RENAME TO facturadirecta_invoice_exports;

CREATE TABLE facturadirecta_exports (
  quote_id TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('invoice', 'estimate')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'uncertain', 'created', 'review')),
  draft INTEGER NOT NULL CHECK (draft IN (0, 1)),
  document_id TEXT,
  formatted_number TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (quote_id, document_type),
  CHECK (document_type = 'invoice' OR draft = 0)
);

INSERT INTO facturadirecta_exports
  (quote_id, document_type, status, draft, document_id, formatted_number, created_at)
SELECT quote_id, 'invoice', status, draft, invoice_id, formatted_number, created_at
FROM facturadirecta_invoice_exports;

DROP TABLE facturadirecta_invoice_exports;
