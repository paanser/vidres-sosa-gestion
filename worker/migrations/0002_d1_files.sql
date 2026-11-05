-- Attachments stay behind the Worker; no R2 subscription or public bucket.
CREATE TABLE file_storage (id INTEGER PRIMARY KEY CHECK(id=1), used INTEGER NOT NULL DEFAULT 0);
INSERT INTO file_storage(id) VALUES(1);
CREATE TABLE file_objects (
 key TEXT PRIMARY KEY, size INTEGER NOT NULL, encoded_size INTEGER NOT NULL,
 uploaded TEXT NOT NULL
);
CREATE TABLE file_chunks (
 object_key TEXT NOT NULL REFERENCES file_objects(key) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL, data TEXT NOT NULL,
 PRIMARY KEY(object_key,ordinal)
);
CREATE TRIGGER file_storage_limit BEFORE INSERT ON file_objects BEGIN
 SELECT CASE WHEN (SELECT used FROM file_storage WHERE id=1)+NEW.encoded_size>350000000
 THEN RAISE(ABORT,'STORAGE_FULL') END;
END;
CREATE TRIGGER file_storage_add AFTER INSERT ON file_objects BEGIN
 UPDATE file_storage SET used=used+NEW.encoded_size WHERE id=1;
END;
CREATE TRIGGER file_storage_remove AFTER DELETE ON file_objects BEGIN
 UPDATE file_storage SET used=used-OLD.encoded_size WHERE id=1;
END;
