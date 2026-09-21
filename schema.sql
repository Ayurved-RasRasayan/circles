-- CircleSync D1 Database Schema
-- Run this with: npx wrangler d1 execute circlesync --file=schema.sql

CREATE TABLE IF NOT EXISTS User (
  id           TEXT PRIMARY KEY,
  username     TEXT UNIQUE NOT NULL,
  displayName  TEXT NOT NULL,
  avatarColor  TEXT NOT NULL DEFAULT '#10b981',
  passwordHash TEXT NOT NULL,
  passwordSalt TEXT NOT NULL,
  createdAt    TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Circle (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  inviteCode  TEXT UNIQUE NOT NULL,
  description TEXT,
  createdBy   TEXT NOT NULL,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (createdBy) REFERENCES User(id)
);

CREATE TABLE IF NOT EXISTS CircleMember (
  id        TEXT PRIMARY KEY,
  userId    TEXT NOT NULL,
  circleId  TEXT NOT NULL,
  joinedAt  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
  FOREIGN KEY (circleId) REFERENCES Circle(id) ON DELETE CASCADE,
  UNIQUE(userId, circleId)
);

CREATE INDEX IF NOT EXISTS idx_circle_member_user ON CircleMember(userId);
CREATE INDEX IF NOT EXISTS idx_circle_member_circle ON CircleMember(circleId);
