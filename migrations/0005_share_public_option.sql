PRAGMA foreign_keys = ON;

ALTER TABLE file_shares
  ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
