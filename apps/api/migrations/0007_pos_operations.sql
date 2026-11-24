CREATE TABLE pos_operations (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  operation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (organization_id, operation_id)
);
