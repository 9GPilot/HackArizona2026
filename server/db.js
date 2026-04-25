import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve("server", "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "studyproject.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_tutor_chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS typing_keyboard_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    page_name TEXT NOT NULL,
    typed_text_length INTEGER NOT NULL DEFAULT 0,
    paste_count INTEGER NOT NULL DEFAULT 0,
    typing_time INTEGER NOT NULL DEFAULT 0,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS study_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_user_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    time TEXT NOT NULL,
    location_or_online_link TEXT NOT NULL,
    max_participants INTEGER NOT NULL DEFAULT 6,
    created_date TEXT NOT NULL,
    FOREIGN KEY (creator_user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS group_visits_joined_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    group_id INTEGER NOT NULL,
    action_type TEXT NOT NULL CHECK(action_type IN ('viewed', 'joined', 'left')),
    timestamp TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (group_id) REFERENCES study_groups (id)
  );

  CREATE TABLE IF NOT EXISTS user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    effort_score INTEGER NOT NULL DEFAULT 0,
    number_of_attempts INTEGER NOT NULL DEFAULT 0,
    study_time INTEGER NOT NULL DEFAULT 0,
    subjects_practiced TEXT NOT NULL DEFAULT '[]',
    last_updated TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id)
  );
`);

export default db;
