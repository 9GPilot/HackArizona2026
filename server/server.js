import bcrypt from "bcryptjs";
import express from "express";
import session from "express-session";
import db from "./db.js";

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "studyproject-dev-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

const createUserProgress = db.prepare(`
  INSERT INTO user_progress (
    user_id,
    effort_score,
    number_of_attempts,
    study_time,
    subjects_practiced,
    last_updated
  ) VALUES (?, 0, 0, 0, '[]', ?)
`);

const now = () => new Date().toISOString();

const sanitizeUser = (user) => ({
  id: user.id,
  username: user.username,
  createdDate: user.created_date,
});

const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  next();
};

const makeTutorResponse = (question) =>
  `Start with the core idea behind "${question}". Break the problem into givens, unknowns, and the smallest principle that connects them, then build the answer one step at a time.`;

const updateProgressForAttempt = ({ userId, subject, typingTime }) => {
  const progress = db
    .prepare("SELECT * FROM user_progress WHERE user_id = ?")
    .get(userId);

  if (!progress) {
    createUserProgress.run(userId, now());
  }

  const current = db
    .prepare("SELECT * FROM user_progress WHERE user_id = ?")
    .get(userId);

  const subjectsPracticed = JSON.parse(current.subjects_practiced || "[]");
  if (subject && !subjectsPracticed.includes(subject)) {
    subjectsPracticed.push(subject);
  }

  const nextAttempts = current.number_of_attempts + 1;
  const nextStudyTime = current.study_time + Math.max(Number(typingTime) || 0, 1);
  const nextEffort = Math.min(
    100,
    Math.round(nextAttempts * 3 + nextStudyTime / 6 + subjectsPracticed.length * 5),
  );

  db.prepare(`
    UPDATE user_progress
    SET effort_score = ?,
        number_of_attempts = ?,
        study_time = ?,
        subjects_practiced = ?,
        last_updated = ?
    WHERE user_id = ?
  `).run(
    nextEffort,
    nextAttempts,
    nextStudyTime,
    JSON.stringify(subjectsPracticed),
    now(),
    userId,
  );
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/auth/session", (req, res) => {
  if (!req.session.user) {
    res.json({ authenticated: false });
    return;
  }

  const user = db
    .prepare("SELECT id, username, created_date FROM users WHERE id = ?")
    .get(req.session.user.id);

  if (!user) {
    req.session.destroy(() => {
      res.json({ authenticated: false });
    });
    return;
  }

  res.json({ authenticated: true, user: sanitizeUser(user) });
});

app.post("/api/auth/signup", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirmPassword || "");

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required." });
    return;
  }

  if (password !== confirmPassword) {
    res.status(400).json({ error: "Passwords do not match." });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters." });
    return;
  }

  const existing = db
    .prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?)")
    .get(username);

  if (existing) {
    res.status(409).json({ error: "Username is already taken." });
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const result = db
    .prepare("INSERT INTO users (username, password_hash, created_date) VALUES (?, ?, ?)")
    .run(username, passwordHash, now());

  createUserProgress.run(result.lastInsertRowid, now());

  const user = db
    .prepare("SELECT id, username, created_date FROM users WHERE id = ?")
    .get(result.lastInsertRowid);

  req.session.user = { id: user.id, username: user.username };
  res.status(201).json({ user: sanitizeUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }

  req.session.user = { id: user.id, username: user.username };
  res.json({ user: sanitizeUser(user) });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/chats", requireAuth, (req, res) => {
  const chats = db
    .prepare(`
      SELECT id, question, ai_response, timestamp
      FROM ai_tutor_chats
      WHERE user_id = ?
      ORDER BY timestamp ASC
    `)
    .all(req.session.user.id)
    .flatMap((chat) => [
      { id: `${chat.id}-q`, sender: "user", text: chat.question, timestamp: chat.timestamp },
      { id: `${chat.id}-a`, sender: "ai", text: chat.ai_response, timestamp: chat.timestamp },
    ]);

  res.json({ chats });
});

app.post("/api/chats", requireAuth, (req, res) => {
  const question = String(req.body.question || "").trim();
  const subject = String(req.body.subject || "").trim();
  const typedTextLength = Number(req.body.typedTextLength) || 0;
  const pasteCount = Number(req.body.pasteCount) || 0;
  const typingTime = Number(req.body.typingTime) || 0;

  if (!question) {
    res.status(400).json({ error: "Question is required." });
    return;
  }

  const aiResponse = makeTutorResponse(question);
  const timestamp = now();

  const result = db
    .prepare(`
      INSERT INTO ai_tutor_chats (user_id, question, ai_response, timestamp)
      VALUES (?, ?, ?, ?)
    `)
    .run(req.session.user.id, question, aiResponse, timestamp);

  db.prepare(`
    INSERT INTO typing_keyboard_activity (
      user_id, page_name, typed_text_length, paste_count, typing_time, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.session.user.id,
    "AI Tutor",
    typedTextLength,
    pasteCount,
    typingTime,
    timestamp,
  );

  updateProgressForAttempt({
    userId: req.session.user.id,
    subject,
    typingTime,
  });

  res.status(201).json({
    chat: {
      id: result.lastInsertRowid,
      question,
      aiResponse,
      timestamp,
    },
  });
});

app.post("/api/activity", requireAuth, (req, res) => {
  const timestamp = now();
  db.prepare(`
    INSERT INTO typing_keyboard_activity (
      user_id, page_name, typed_text_length, paste_count, typing_time, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.session.user.id,
    String(req.body.pageName || "Unknown"),
    Number(req.body.typedTextLength) || 0,
    Number(req.body.pasteCount) || 0,
    Number(req.body.typingTime) || 0,
    timestamp,
  );

  res.status(201).json({ ok: true });
});

app.get("/api/groups", requireAuth, (req, res) => {
  const groups = db
    .prepare(`
      SELECT
        g.id,
        g.subject,
        g.topic,
        g.time,
        g.location_or_online_link,
        g.max_participants,
        g.created_date,
        u.username AS creator_username,
        COALESCE(SUM(CASE
          WHEN v.action_type = 'joined' THEN 1
          WHEN v.action_type = 'left' THEN -1
          ELSE 0
        END), 0) AS participant_count
      FROM study_groups g
      JOIN users u ON u.id = g.creator_user_id
      LEFT JOIN group_visits_joined_sessions v ON v.group_id = g.id
      GROUP BY g.id
      ORDER BY g.created_date DESC
    `)
    .all();

  const history = db
    .prepare(`
      SELECT group_id, action_type, timestamp
      FROM group_visits_joined_sessions
      WHERE user_id = ?
      ORDER BY timestamp DESC
    `)
    .all(req.session.user.id);

  res.json({ groups, history });
});

app.post("/api/groups", requireAuth, (req, res) => {
  const subject = String(req.body.subject || "").trim();
  const topic = String(req.body.topic || "").trim();
  const time = String(req.body.time || "").trim();
  const locationOrOnlineLink = String(req.body.locationOrOnlineLink || "").trim();
  const maxParticipants = Number(req.body.maxParticipants) || 6;

  if (!subject || !topic || !time || !locationOrOnlineLink) {
    res.status(400).json({ error: "All study group fields are required." });
    return;
  }

  const timestamp = now();
  const result = db
    .prepare(`
      INSERT INTO study_groups (
        creator_user_id,
        subject,
        topic,
        time,
        location_or_online_link,
        max_participants,
        created_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      req.session.user.id,
      subject,
      topic,
      time,
      locationOrOnlineLink,
      maxParticipants,
      timestamp,
    );

  db.prepare(`
    INSERT INTO group_visits_joined_sessions (user_id, group_id, action_type, timestamp)
    VALUES (?, ?, 'viewed', ?)
  `).run(req.session.user.id, result.lastInsertRowid, timestamp);

  res.status(201).json({ id: result.lastInsertRowid });
});

app.post("/api/groups/:groupId/action", requireAuth, (req, res) => {
  const groupId = Number(req.params.groupId);
  const actionType = String(req.body.actionType || "");

  if (!["viewed", "joined", "left"].includes(actionType)) {
    res.status(400).json({ error: "Invalid action type." });
    return;
  }

  const group = db.prepare("SELECT id FROM study_groups WHERE id = ?").get(groupId);
  if (!group) {
    res.status(404).json({ error: "Study group not found." });
    return;
  }

  db.prepare(`
    INSERT INTO group_visits_joined_sessions (user_id, group_id, action_type, timestamp)
    VALUES (?, ?, ?, ?)
  `).run(req.session.user.id, groupId, actionType, now());

  res.status(201).json({ ok: true });
});

app.get("/api/progress", requireAuth, (req, res) => {
  const progress = db
    .prepare(`
      SELECT effort_score, number_of_attempts, study_time, subjects_practiced, last_updated
      FROM user_progress
      WHERE user_id = ?
    `)
    .get(req.session.user.id);

  if (!progress) {
    createUserProgress.run(req.session.user.id, now());
  }

  const current = db
    .prepare(`
      SELECT effort_score, number_of_attempts, study_time, subjects_practiced, last_updated
      FROM user_progress
      WHERE user_id = ?
    `)
    .get(req.session.user.id);

  res.json({
    progress: {
      effortScore: current.effort_score,
      numberOfAttempts: current.number_of_attempts,
      studyTime: current.study_time,
      subjectsPracticed: JSON.parse(current.subjects_practiced || "[]"),
      lastUpdated: current.last_updated,
    },
  });
});

app.listen(port, () => {
  console.log(`Study Project API listening on http://127.0.0.1:${port}`);
});
