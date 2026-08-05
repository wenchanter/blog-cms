#!/usr/bin/env node
/**
 * Backfills `posts.content_doc` from the Markdown in `posts.content`.
 *
 * Usage:
 *   node scripts/migrate-content-doc.mjs [--remote] [--dry-run]
 *
 * Every post is checked before it is written: the Markdown is compiled to
 * blocks, those blocks are converted to a TipTap document, and that document is
 * compiled back to blocks. Unless the two block lists are identical the post is
 * reported and left untouched, so a conversion bug can never quietly rewrite
 * content. `posts.content` is kept either way, so the migration is reversible.
 */

import { execFileSync } from "node:child_process";
import { compileMarkdown } from "../lib/markdown.ts";
import { blocksToDoc } from "../lib/blocks-to-doc.ts";
import { compileDoc } from "../lib/tiptap.ts";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const dryRun = args.includes("--dry-run");

function d1(sql) {
  const out = execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "DB",
      remote ? "--remote" : "--local",
      "--json",
      "--command",
      sql,
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  // wrangler prints progress lines before the JSON payload.
  const start = out.indexOf("[");
  return JSON.parse(out.slice(start))[0].results;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const posts = d1(
  `SELECT id, slug, content, content_doc FROM posts ORDER BY id`,
);

console.log(`共 ${posts.length} 篇文章（${remote ? "远端" : "本地"}）\n`);

let converted = 0;
let skipped = 0;
const failures = [];

for (const post of posts) {
  if (post.content_doc && post.content_doc.trim() !== "") {
    skipped++;
    continue;
  }

  const markdown = post.content ?? "";
  const expected = compileMarkdown(markdown).blocks;
  const doc = blocksToDoc(expected);
  const actual = compileDoc(doc).blocks;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push({ id: post.id, slug: post.slug, expected, actual });
    continue;
  }

  if (!dryRun) {
    d1(
      `UPDATE posts SET content_doc = ${sqlString(JSON.stringify(doc))} WHERE id = ${post.id}`,
    );
  }
  converted++;
  console.log(`  ✓ #${post.id} ${post.slug} — ${expected.length} 个块`);
}

if (failures.length > 0) {
  console.log(`\n以下文章转换后不等价，未修改（请手工检查）：`);
  for (const failure of failures) {
    console.log(`  ✗ #${failure.id} ${failure.slug}`);
    console.log(`      原始块：${JSON.stringify(failure.expected).slice(0, 200)}`);
    console.log(`      转换后：${JSON.stringify(failure.actual).slice(0, 200)}`);
  }
}

console.log(
  `\n${dryRun ? "[dry-run] " : ""}转换 ${converted} 篇，跳过 ${skipped} 篇（已有 doc），失败 ${failures.length} 篇。`,
);

process.exit(failures.length > 0 ? 1 : 0);
