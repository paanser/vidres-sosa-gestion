CREATE TABLE user_home_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL CHECK(json_valid(data))
);
