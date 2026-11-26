CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL
);
CREATE INDEX push_subscriptions_session ON push_subscriptions(token_hash);
