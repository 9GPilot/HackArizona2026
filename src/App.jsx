import React, { useEffect, useMemo, useRef, useState } from "react";
import { subjects, tutorWelcome } from "./data";

const defaultGroupForm = {
  subject: "",
  topic: "",
  time: "",
  locationOrOnlineLink: "",
  maxParticipants: 6,
};

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function App() {
  const [theme, setTheme] = useState("light");
  const [sessionLoading, setSessionLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [selectedSubjectId, setSelectedSubjectId] = useState(subjects[0].id);
  const [messages, setMessages] = useState(tutorWelcome);
  const [draft, setDraft] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [groupMode, setGroupMode] = useState("find");
  const [groups, setGroups] = useState([]);
  const [groupHistory, setGroupHistory] = useState([]);
  const [groupForm, setGroupForm] = useState(defaultGroupForm);
  const [groupFeedback, setGroupFeedback] = useState("");
  const [progress, setProgress] = useState({
    effortScore: 0,
    numberOfAttempts: 0,
    studyTime: 0,
    subjectsPracticed: [],
    lastUpdated: null,
  });
  const [loadingError, setLoadingError] = useState("");

  const typingStartedAt = useRef(Date.now());
  const pasteCountRef = useRef(0);

  const selectedSubject = useMemo(
    () => subjects.find((subject) => subject.id === selectedSubjectId) ?? subjects[0],
    [selectedSubjectId],
  );

  const profileLabel = user?.username || "Profile";
  const navItems = [
    { key: "Dashboard", label: "Dashboard" },
    { key: "AI Tutor", label: "AI Tutor" },
    { key: "Study Groups", label: "Study Groups" },
    { key: "Profile", label: profileLabel },
  ];

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const data = await apiFetch("/api/auth/session");
        if (data.authenticated) {
          setUser(data.user);
        }
      } catch (error) {
        setLoadingError(error.message);
      } finally {
        setSessionLoading(false);
      }
    };

    loadSession();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    const loadUserData = async () => {
      try {
        const [chatData, groupData, progressData] = await Promise.all([
          apiFetch("/api/chats"),
          apiFetch("/api/groups"),
          apiFetch("/api/progress"),
        ]);

        setMessages(chatData.chats.length > 0 ? chatData.chats : tutorWelcome);
        setGroups(groupData.groups);
        setGroupHistory(groupData.history);
        setProgress(progressData.progress);
      } catch (error) {
        setLoadingError(error.message);
      }
    };

    loadUserData();
  }, [user]);

  const resetTypingMetrics = () => {
    typingStartedAt.current = Date.now();
    pasteCountRef.current = 0;
  };

  const handleAuthFieldChange = (field, value) => {
    setAuthForm((current) => ({ ...current, [field]: value }));
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");

    try {
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const payload =
        authMode === "login"
          ? {
              username: authForm.username,
              password: authForm.password,
            }
          : authForm;

      const data = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setUser(data.user);
      setActiveTab("Dashboard");
      setAuthForm({ username: "", password: "", confirmPassword: "" });
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setMessages(tutorWelcome);
    setGroups([]);
    setGroupHistory([]);
    setProgress({
      effortScore: 0,
      numberOfAttempts: 0,
      studyTime: 0,
      subjectsPracticed: [],
      lastUpdated: null,
    });
    setDraft("");
    setActiveTab("Dashboard");
  };

  const handleSend = async (overrideQuestion) => {
    const nextQuestion = String(overrideQuestion ?? draft).trim();
    if (!nextQuestion) {
      return;
    }

    const typingTime = Math.round((Date.now() - typingStartedAt.current) / 1000);

    const data = await apiFetch("/api/chats", {
      method: "POST",
      body: JSON.stringify({
        question: nextQuestion,
        subject: selectedSubject.name,
        typedTextLength: nextQuestion.length,
        pasteCount: pasteCountRef.current,
        typingTime,
      }),
    });

    const nextMessages = [
      ...messages,
      {
        id: `${data.chat.id}-question`,
        sender: "user",
        text: data.chat.question,
        timestamp: data.chat.timestamp,
      },
      {
        id: `${data.chat.id}-response`,
        sender: "ai",
        text: data.chat.aiResponse,
        timestamp: data.chat.timestamp,
      },
    ];

    setMessages(nextMessages);
    setDraft("");
    resetTypingMetrics();

    const progressData = await apiFetch("/api/progress");
    setProgress(progressData.progress);
  };

  const handleQuestionClick = async (question) => {
    setActiveTab("AI Tutor");
    await handleSend(question);
  };

  const handleHint = async () => {
    const hint =
      "Hint: list the givens, isolate the unknown, and pick the smallest rule that moves the problem forward.";
    setMessages((current) => [
      ...current,
      { id: `hint-${Date.now()}`, sender: "ai", text: hint, timestamp: new Date().toISOString() },
    ]);

    await apiFetch("/api/activity", {
      method: "POST",
      body: JSON.stringify({
        pageName: "AI Tutor",
        typedTextLength: draft.length,
        pasteCount: pasteCountRef.current,
        typingTime: Math.round((Date.now() - typingStartedAt.current) / 1000),
      }),
    });
  };

  const handleGroupCreate = async (event) => {
    event.preventDefault();
    setGroupFeedback("");

    try {
      await apiFetch("/api/groups", {
        method: "POST",
        body: JSON.stringify(groupForm),
      });

      const groupData = await apiFetch("/api/groups");
      setGroups(groupData.groups);
      setGroupHistory(groupData.history);
      setGroupForm(defaultGroupForm);
      setGroupFeedback("Study group created.");
      setGroupMode("find");
    } catch (error) {
      setGroupFeedback(error.message);
    }
  };

  const handleGroupAction = async (groupId, actionType) => {
    await apiFetch(`/api/groups/${groupId}/action`, {
      method: "POST",
      body: JSON.stringify({ actionType }),
    });

    const groupData = await apiFetch("/api/groups");
    setGroups(groupData.groups);
    setGroupHistory(groupData.history);
  };

  if (sessionLoading) {
    return <div className="loading-screen">Loading Study Project...</div>;
  }

  if (!user) {
    return (
      <AuthScreen
        authBusy={authBusy}
        authError={authError || loadingError}
        authForm={authForm}
        authMode={authMode}
        onAuthFieldChange={handleAuthFieldChange}
        onAuthModeChange={setAuthMode}
        onSubmit={handleAuthSubmit}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
      />
    );
  }

  return (
    <div className={`app-shell theme-${theme}`}>
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <header className="top-panel">
        <div className="brand-block">
          <div className="brand-mark">SP</div>
          <div>
            <p className="eyebrow">Authenticated Learning Workspace</p>
            <h1>Study Project</h1>
          </div>
        </div>

        <nav className="panel-tabs" aria-label="Primary">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`panel-tab ${activeTab === item.key ? "active" : ""}`}
              onClick={() => setActiveTab(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
          <button
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
            type="button"
          >
            <span>{theme === "light" ? "Dark" : "Light"}</span>
            <span className={`toggle-orb ${theme === "dark" ? "dark" : "light"}`} />
          </button>
          <button className="logout-button" onClick={handleLogout} type="button">
            Logout
          </button>
        </nav>
      </header>

      <main className="content-grid">
        <aside className="leather-sidebar">
          <div className="sidebar-card">
            <p className="eyebrow">Signed In</p>
            <h2>{user.username}</h2>
            <p>Your tutor history, progress, and group actions are private to this account.</p>
          </div>

          <div className="sidebar-card glass-card">
            <p className="eyebrow">Current Focus</p>
            <h2>{selectedSubject.name}</h2>
            <p>{selectedSubject.description}</p>
          </div>

          <div className="sidebar-card">
            <p className="eyebrow">Tracked Activity</p>
            <ul className="schedule-list">
              <li>Private chat history</li>
              <li>Typing and keyboard metrics</li>
              <li>Group visits and joined sessions</li>
            </ul>
          </div>
        </aside>

        <section className="main-stage">
          {loadingError ? <p className="error-banner">{loadingError}</p> : null}

          {activeTab === "Dashboard" && (
            <Dashboard
              selectedSubjectId={selectedSubjectId}
              selectedSubject={selectedSubject}
              onQuestionClick={handleQuestionClick}
              onSelectSubject={setSelectedSubjectId}
            />
          )}

          {activeTab === "AI Tutor" && (
            <Tutor
              draft={draft}
              messages={messages}
              onDraftChange={(value) => setDraft(value)}
              onHint={handleHint}
              onInputPaste={() => {
                pasteCountRef.current += 1;
              }}
              onQuickReply={(reply) => setDraft(reply)}
              onSend={() => handleSend()}
            />
          )}

          {activeTab === "Study Groups" && (
            <StudyGroups
              groupFeedback={groupFeedback}
              groupForm={groupForm}
              groupHistory={groupHistory}
              groupMode={groupMode}
              groups={groups}
              onCreate={handleGroupCreate}
              onGroupAction={handleGroupAction}
              onGroupFieldChange={(field, value) =>
                setGroupForm((current) => ({ ...current, [field]: value }))
              }
              onModeChange={setGroupMode}
            />
          )}

          {activeTab === "Profile" && (
            <Progress progress={progress} username={user.username} />
          )}
        </section>
      </main>
    </div>
  );
}

function AuthScreen({
  authBusy,
  authError,
  authForm,
  authMode,
  onAuthFieldChange,
  onAuthModeChange,
  onSubmit,
  onToggleTheme,
  theme,
}) {
  return (
    <div className={`app-shell theme-${theme}`}>
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      <main className="auth-layout">
        <section className="auth-hero">
          <p className="eyebrow">Secure Study Access</p>
          <h1>Login before entering your study workspace</h1>
          <p>
            Your tutor chats, progress, and group history are stored per user account
            with hashed passwords and session-based access.
          </p>
        </section>

        <section className="auth-card">
          <div className="auth-card-header">
            <div>
              <p className="eyebrow">{authMode === "login" ? "Welcome Back" : "Create Account"}</p>
              <h2>{authMode === "login" ? "Login" : "Sign Up"}</h2>
            </div>
            <button className="theme-toggle" onClick={onToggleTheme} type="button">
              <span>{theme === "light" ? "Dark" : "Light"}</span>
              <span className={`toggle-orb ${theme === "dark" ? "dark" : "light"}`} />
            </button>
          </div>

          <form className="auth-form" onSubmit={onSubmit}>
            <label>
              Username
              <input
                autoComplete="username"
                onChange={(event) => onAuthFieldChange("username", event.target.value)}
                type="text"
                value={authForm.username}
              />
            </label>
            <label>
              Password
              <input
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
                onChange={(event) => onAuthFieldChange("password", event.target.value)}
                type="password"
                value={authForm.password}
              />
            </label>
            {authMode === "signup" ? (
              <label>
                Confirm Password
                <input
                  autoComplete="new-password"
                  onChange={(event) => onAuthFieldChange("confirmPassword", event.target.value)}
                  type="password"
                  value={authForm.confirmPassword}
                />
              </label>
            ) : null}

            {authError ? <p className="error-banner">{authError}</p> : null}

            <button className="action-button auth-submit" disabled={authBusy} type="submit">
              {authBusy ? "Working..." : authMode === "login" ? "Login" : "Sign Up"}
            </button>
          </form>

          <button
            className="auth-switch"
            onClick={() => onAuthModeChange(authMode === "login" ? "signup" : "login")}
            type="button"
          >
            {authMode === "login"
              ? "Create an account"
              : "Already have an account?"}
          </button>
        </section>
      </main>
    </div>
  );
}

function Dashboard({
  onQuestionClick,
  onSelectSubject,
  selectedSubject,
  selectedSubjectId,
}) {
  return (
    <div className="page-stack">
      <section className="hero-paper">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>Choose a subject, then send a question into your private tutor log</h2>
          <p>
            Each question you open is saved to your own chat history and contributes to
            your personal progress tracking.
          </p>
        </div>
        <div className="hero-badge">
          <span>Session Protected</span>
          <strong>User-scoped learning data</strong>
        </div>
      </section>

      <section className="subject-grid">
        {subjects.map((subject) => (
          <button
            key={subject.id}
            className={`subject-card ${subject.tone} ${
              selectedSubjectId === subject.id ? "active" : ""
            }`}
            onClick={() => onSelectSubject(subject.id)}
            type="button"
          >
            <div className="subject-icon">{subject.icon}</div>
            <div>
              <h3>{subject.name}</h3>
              <p>{subject.description}</p>
            </div>
          </button>
        ))}
      </section>

      <section className="paper-tray">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Question Queue</p>
            <h3>{selectedSubject.name} prompts</h3>
          </div>
          <span className="metal-pill">{selectedSubject.questions.length} ready</span>
        </div>

        <div className="question-list">
          {selectedSubject.questions.map((question, index) => (
            <button
              key={question}
              className={`question-strip strip-${(index % 3) + 1}`}
              onClick={() => onQuestionClick(question)}
              type="button"
            >
              <span className="pin-mark" />
              <span>{question}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Tutor({
  draft,
  messages,
  onDraftChange,
  onHint,
  onInputPaste,
  onQuickReply,
  onSend,
}) {
  return (
    <div className="page-stack tutor-layout">
      <section className="message-board">
        <div className="section-heading">
          <div>
            <p className="eyebrow">AI Tutor</p>
            <h2>Private session history</h2>
          </div>
          <button className="speaker-button" type="button" aria-label="Text to speech">
            <span>))</span>
          </button>
        </div>

        <div className="message-thread">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`message-bubble ${message.sender === "user" ? "user" : "ai"}`}
            >
              <p className="bubble-label">{message.sender === "user" ? "You" : "Tutor"}</p>
              <p>{message.text}</p>
            </article>
          ))}
        </div>

        <div className="reply-row">
          {["Break this into smaller steps.", "Give me only a hint.", "Show a worked example."].map(
            (reply) => (
              <button
                key={reply}
                className="chip-button"
                onClick={() => onQuickReply(reply)}
                type="button"
              >
                {reply}
              </button>
            ),
          )}
        </div>

        <div className="composer">
          <input
            onChange={(event) => onDraftChange(event.target.value)}
            onPaste={onInputPaste}
            placeholder="Ask for a hint, explanation, or worked example..."
            type="text"
            value={draft}
          />
          <button className="soft-button" onClick={onHint} type="button">
            Get Hint
          </button>
          <button className="action-button" onClick={onSend} type="button">
            Send
          </button>
        </div>
      </section>

      <aside className="whiteboard-panel">
        <div className="whiteboard-header">
          <p className="eyebrow">Tracked</p>
          <h3>Activity Notes</h3>
        </div>
        <div className="whiteboard">
          <span className="marker-line marker-line-1" />
          <span className="marker-line marker-line-2" />
          <span className="marker-line marker-line-3" />
        </div>
        <p className="whiteboard-note">
          Chat prompts, typed length, paste count, and tutor attempts are recorded to
          your account for later analytics.
        </p>
      </aside>
    </div>
  );
}

function StudyGroups({
  groupFeedback,
  groupForm,
  groupHistory,
  groupMode,
  groups,
  onCreate,
  onGroupAction,
  onGroupFieldChange,
  onModeChange,
}) {
  return (
    <div className="page-stack">
      <section className="section-heading group-switcher">
        <div>
          <p className="eyebrow">Study Groups</p>
          <h2>Find groups or create your own session</h2>
        </div>
        <div className="toggle-row">
          <button
            className={`action-button small ${groupMode === "find" ? "active" : ""}`}
            onClick={() => onModeChange("find")}
            type="button"
          >
            Find Group
          </button>
          <button
            className={`soft-button small ${groupMode === "create" ? "active" : ""}`}
            onClick={() => onModeChange("create")}
            type="button"
          >
            Create Group
          </button>
        </div>
      </section>

      {groupMode === "find" ? (
        <>
          <section className="group-card-stack">
            {groups.map((group, index) => (
              <article
                key={group.id}
                className="index-card"
                style={{ rotate: `${index % 2 === 0 ? -1 : 1}deg` }}
              >
                <div className="index-card-top">
                  <span>{group.subject}</span>
                  <strong>{group.participant_count} active</strong>
                </div>
                <h3>{group.topic}</h3>
                <p>{group.time}</p>
                <p>{group.location_or_online_link}</p>
                <p>Created by {group.creator_username}</p>
                <div className="card-actions">
                  <button
                    className="chip-button"
                    onClick={() => onGroupAction(group.id, "viewed")}
                    type="button"
                  >
                    View
                  </button>
                  <button
                    className="soft-button small"
                    onClick={() => onGroupAction(group.id, "joined")}
                    type="button"
                  >
                    Join
                  </button>
                  <button
                    className="action-button small"
                    onClick={() => onGroupAction(group.id, "left")}
                    type="button"
                  >
                    Leave
                  </button>
                </div>
              </article>
            ))}
          </section>

          <section className="paper-tray">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Your Group History</p>
                <h3>Private visit log</h3>
              </div>
            </div>
            <div className="history-list">
              {groupHistory.length === 0 ? (
                <p>No group activity yet.</p>
              ) : (
                groupHistory.slice(0, 6).map((item) => (
                  <div className="history-item" key={`${item.group_id}-${item.timestamp}`}>
                    <strong>Group #{item.group_id}</strong>
                    <span>{item.action_type}</span>
                    <span>{new Date(item.timestamp).toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="clipboard-form">
          <div className="clip" />
          <form className="form-grid" onSubmit={onCreate}>
            <label>
              Subject
              <input
                onChange={(event) => onGroupFieldChange("subject", event.target.value)}
                placeholder="Chemistry"
                type="text"
                value={groupForm.subject}
              />
            </label>
            <label>
              Topic
              <input
                onChange={(event) => onGroupFieldChange("topic", event.target.value)}
                placeholder="Thermodynamics review"
                type="text"
                value={groupForm.topic}
              />
            </label>
            <label>
              Time
              <input
                onChange={(event) => onGroupFieldChange("time", event.target.value)}
                placeholder="Friday, 6:00 PM"
                type="text"
                value={groupForm.time}
              />
            </label>
            <label>
              Location / Online Link
              <input
                onChange={(event) => onGroupFieldChange("locationOrOnlineLink", event.target.value)}
                placeholder="Library Room A2 or meeting link"
                type="text"
                value={groupForm.locationOrOnlineLink}
              />
            </label>
            <label>
              Max Participants
              <input
                min="2"
                onChange={(event) => onGroupFieldChange("maxParticipants", Number(event.target.value))}
                type="number"
                value={groupForm.maxParticipants}
              />
            </label>
            <div className="form-submit-row">
              <button className="action-button form-submit" type="submit">
                Save Study Group
              </button>
              {groupFeedback ? <p className="form-feedback">{groupFeedback}</p> : null}
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

function Progress({ progress, username }) {
  const progressCards = [
    {
      label: "Effort Score",
      value: progress.effortScore,
      detail: "Calculated from attempts, time, and subject breadth",
    },
    {
      label: "Attempts",
      value: Math.min(progress.numberOfAttempts, 100),
      detail: `${progress.numberOfAttempts} tutor questions saved`,
    },
    {
      label: "Study Time",
      value: Math.min(progress.studyTime, 100),
      detail: `${progress.studyTime} tracked typing seconds`,
    },
  ];

  const gauges = [
    { label: "Subjects Practiced", value: Math.min(progress.subjectsPracticed.length * 16, 100) },
    { label: "Tutor Consistency", value: Math.min(progress.numberOfAttempts * 5, 100) },
    { label: "Focused Effort", value: progress.effortScore },
  ];

  return (
    <div className="page-stack progress-page">
      <section className="instrument-board">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{username}</p>
            <h2>Private progress dashboard</h2>
          </div>
          <span className="metal-pill">
            {progress.lastUpdated
              ? `Updated ${new Date(progress.lastUpdated).toLocaleString()}`
              : "No activity yet"}
          </span>
        </div>

        <div className="meter-grid">
          {progressCards.map((stat) => (
            <article key={stat.label} className="meter-card">
              <div className="meter-top">
                <h3>{stat.label}</h3>
                <strong>{stat.value}%</strong>
              </div>
              <div className="meter-track">
                <div className="meter-fill" style={{ width: `${stat.value}%` }} />
              </div>
              <p>{stat.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="gauge-grid">
        {gauges.map((panel) => (
          <article key={panel.label} className="gauge-card">
            <div className="gauge" style={{ "--gauge-value": `${panel.value}%` }}>
              <div className="gauge-inner">
                <strong>{panel.value}%</strong>
              </div>
            </div>
            <h3>{panel.label}</h3>
          </article>
        ))}
      </section>
    </div>
  );
}

export default App;
