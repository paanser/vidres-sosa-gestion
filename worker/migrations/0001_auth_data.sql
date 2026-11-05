PRAGMA foreign_keys = ON;
CREATE TABLE users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('administrador','empleado')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  password_hash TEXT NOT NULL, salt TEXT NOT NULL, iterations INTEGER NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 0 CHECK(must_change IN (0,1)),
  credential_version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE bootstrap (id INTEGER PRIMARY KEY CHECK(id=1));
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_version INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE attempts (key TEXT PRIMARY KEY, failures INTEGER NOT NULL, window_start INTEGER NOT NULL, blocked_until INTEGER NOT NULL DEFAULT 0);
CREATE TABLE workspace (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0);
INSERT INTO workspace(id) VALUES(1);
CREATE TABLE records (
  collection TEXT NOT NULL, id TEXT NOT NULL, ordinal INTEGER NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(collection,id)
);
CREATE TABLE files (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('photos','documents')),
  job_id TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, metadata TEXT NOT NULL CHECK(json_valid(metadata)),
  size INTEGER NOT NULL, sha256 TEXT NOT NULL, owner_id TEXT NOT NULL,
  import_id TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE INDEX files_job ON files(job_id);
CREATE TABLE imports (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('staging','committed','cancelled')), created_at TEXT NOT NULL);
CREATE TABLE audit (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE quotas (key TEXT PRIMARY KEY, count INTEGER NOT NULL CHECK(count>=0), expires_at INTEGER NOT NULL);
-- The first statement of each protected mutation verifies auth and the optimistic revision
-- inside the same D1 batch transaction as the write. It cannot race revocation or another save.
CREATE TABLE mutation_guards (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, revision INTEGER, admin_only INTEGER NOT NULL DEFAULT 0, allow_change INTEGER NOT NULL DEFAULT 0, import_id TEXT);
CREATE TRIGGER guard_auth BEFORE INSERT ON mutation_guards BEGIN
 SELECT CASE WHEN NEW.import_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM imports i JOIN sessions s ON s.user_id=i.owner_id WHERE i.id=NEW.import_id AND i.status='staging' AND s.token_hash=NEW.token_hash) THEN RAISE(ABORT,'IMPORT_CLOSED') END;
 SELECT CASE WHEN NOT EXISTS (
   SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id
   WHERE s.token_hash=NEW.token_hash AND u.active=1 AND u.credential_version=s.credential_version
 ) THEN RAISE(ABORT,'AUTH_REQUIRED') END;
 SELECT CASE WHEN NEW.allow_change=0 AND EXISTS (
   SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=NEW.token_hash AND u.must_change=1
 ) THEN RAISE(ABORT,'PASSWORD_CHANGE_REQUIRED') END;
 SELECT CASE WHEN NEW.admin_only=1 AND NOT EXISTS (
   SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=NEW.token_hash AND u.role='administrador'
 ) THEN RAISE(ABORT,'ADMIN_REQUIRED') END;
 SELECT CASE WHEN NEW.revision IS NOT NULL AND NEW.revision != (SELECT revision FROM workspace WHERE id=1)
   THEN RAISE(ABORT,'REVISION_CONFLICT') END;
END;
CREATE TRIGGER last_admin_delete BEFORE DELETE ON users
WHEN OLD.role='administrador' AND OLD.active=1 AND (SELECT COUNT(*) FROM users WHERE role='administrador' AND active=1)<=1
BEGIN SELECT RAISE(ABORT,'LAST_ADMIN'); END;
CREATE TRIGGER last_admin_update BEFORE UPDATE OF role,active ON users
WHEN OLD.role='administrador' AND OLD.active=1 AND (NEW.role!='administrador' OR NEW.active=0)
 AND (SELECT COUNT(*) FROM users WHERE role='administrador' AND active=1)<=1
BEGIN SELECT RAISE(ABORT,'LAST_ADMIN'); END;

CREATE TABLE file_assertions (code TEXT);
CREATE TRIGGER file_assertion BEFORE INSERT ON file_assertions BEGIN
 SELECT RAISE(ABORT,'FILE_CONFLICT');
END;
CREATE TABLE maintenance_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
