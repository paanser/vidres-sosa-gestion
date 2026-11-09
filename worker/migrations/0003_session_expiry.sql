ALTER TABLE sessions ADD COLUMN last_used TEXT NOT NULL DEFAULT '';
UPDATE sessions SET last_used=created_at;
CREATE TRIGGER sessions_last_used AFTER INSERT ON sessions
WHEN NEW.last_used=''
BEGIN
  UPDATE sessions SET last_used=NEW.created_at WHERE token_hash=NEW.token_hash;
END;
CREATE INDEX sessions_last_used ON sessions(last_used);
