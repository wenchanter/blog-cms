-- Moves article authoring from Markdown to a TipTap document.
--
-- `content` (Markdown) is kept rather than dropped: it is the original text the
-- author typed, and keeping it means the migration is reversible if the
-- conversion turns out to be wrong for some post. The application stops reading
-- it once `content_doc` is populated.
--
-- The backfill is done by `scripts/migrate-content-doc.mjs`, which asserts per
-- post that compiling the generated document yields exactly the same blocks as
-- compiling the Markdown did.

ALTER TABLE posts ADD COLUMN content_doc TEXT NOT NULL DEFAULT '';
