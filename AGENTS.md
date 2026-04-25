# AGENTS.md

## Purpose

This repository now contains a React frontend plus an Express/SQLite backend for a study platform. It already includes authentication, password hashing, session handling, user-scoped chats, study groups, and progress tracking.

Agents working in this repo should preserve the current product direction:

- Premium educational tool
- Soft tactile visual language
- Clean usability over visual clutter
- Strong user-data separation at the API layer

## Current Architecture

- `src/App.jsx`: auth gate, session-aware app shell, and page composition
- `src/data.js`: static subject/question catalog used by the dashboard
- `src/styles.css`: full visual system and component styling
- `src/main.jsx`: React entry point
- `server/db.js`: SQLite initialization and schema
- `server/server.js`: auth/session API and user-scoped data routes
- `server/data/studyproject.sqlite`: generated local database file at runtime

## Working Rules

- Keep the app in React unless explicitly told otherwise
- Keep the backend in Node/Express unless explicitly told otherwise
- Do not introduce a UI library unless the user asks for one
- Preserve theme support and tactile surfaces when extending screens
- Do not weaken password hashing or session checks for convenience
- Keep user-specific queries scoped by `req.session.user.id`
- Favor semantic HTML and accessible button/input usage

## Expected Near-Term Extensions

- Real tutor model integration
- Persistent production-grade session store
- Role-based group moderation or membership rules
- More granular analytics for keyboard activity
- Subject/question retrieval from backend if needed

## Design Guardrails

- Avoid flat redesigns
- Avoid generic startup-dashboard aesthetics
- Maintain calm academic tones
- Preserve light/dark theme parity
- Keep motion subtle and purposeful

## Verification

Before handing off changes, agents should try to run:

```bash
npm run build
npm run server
```

If runtime verification creates local test data, clean it up before handoff unless the user asked to keep it.
