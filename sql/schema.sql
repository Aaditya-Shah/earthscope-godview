-- EARTHSCOPE v4.0 Database Schema (MySQL / MariaDB & Automatic SQLite Fallback)
-- Note: Locally or when MySQL is not configured in config.local.php, EARTHSCOPE
-- automatically provisions and persists these tables in storage/earthscope.sqlite.

CREATE TABLE IF NOT EXISTS saved_places (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_hash CHAR(64) NOT NULL,
  name VARCHAR(180) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_saved_places_owner_created (owner_hash, created_at),
  KEY idx_saved_places_coords (latitude, longitude)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS multiplayer_players (
  room_code VARCHAR(32) NOT NULL,
  player_id VARCHAR(64) NOT NULL,
  callsign VARCHAR(48) NOT NULL,
  vehicle VARCHAR(32) NOT NULL DEFAULT 'hypercar',
  color VARCHAR(24) NOT NULL DEFAULT '#38bdf8',
  lat DECIMAL(10,7) NOT NULL,
  lon DECIMAL(10,7) NOT NULL,
  alt DECIMAL(10,2) NOT NULL DEFAULT 0,
  heading DECIMAL(6,2) NOT NULL DEFAULT 0,
  pitch DECIMAL(6,2) NOT NULL DEFAULT 0,
  speed_kmh DECIMAL(7,2) NOT NULL DEFAULT 0,
  drift TINYINT(1) NOT NULL DEFAULT 0,
  nitro TINYINT(1) NOT NULL DEFAULT 0,
  race_mode VARCHAR(32) NOT NULL DEFAULT 'freeroam',
  checkpoint_idx INT NOT NULL DEFAULT 0,
  lap INT NOT NULL DEFAULT 1,
  best_lap_ms INT NOT NULL DEFAULT 0,
  updated_at INT UNSIGNED NOT NULL,
  PRIMARY KEY (room_code, player_id),
  KEY idx_mp_room_updated (room_code, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS race_leaderboards (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  track_id VARCHAR(48) NOT NULL,
  track_name VARCHAR(120) NOT NULL,
  player_name VARCHAR(48) NOT NULL,
  vehicle VARCHAR(32) NOT NULL,
  time_ms INT UNSIGNED NOT NULL,
  top_speed_kmh DECIMAL(6,1) NOT NULL DEFAULT 0,
  location_label VARCHAR(120) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_race_track_time (track_id, time_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
