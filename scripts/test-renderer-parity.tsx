import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { PreviewBody } from "../app/admin/posts/article-preview";
import type { ArticleBlock } from "../lib/blocks";

/**
 * Proves the offline preview fallback renders byte-identical HTML to
 * personal-website's `ArticleBody`.
 *
 * The golden file and its fixture are generated over there by `npm run golden`,
 * which renders the real component. When this test fails, the site's renderer
 * changed and this repo's copy has not caught up — the fix is to copy the new
 * markup across, not to regenerate the golden from this side.
 *
 * The online preview (the iframe onto /blog/__preview/) is drift-proof by
 * construction and needs no test; this covers the degraded path only.
 */

const GOLDEN_DIR = path.join(process.cwd(), "tests", "golden");

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  }
}

/** Reports the first difference rather than dumping two walls of HTML. */
function firstDifference(actual: string, expected: string): string {
  let index = 0;
  while (index < actual.length && actual[index] === expected[index]) index += 1;

  const window = 90;
  const start = Math.max(0, index - 30);

  return [
    `first difference at offset ${index}`,
    `  site: …${expected.slice(start, start + window)}…`,
    `  cms:  …${actual.slice(start, start + window)}…`,
  ].join("\n");
}

async function main() {
  let golden: string;
  let fixture: ArticleBlock[];

  try {
    golden = await readFile(path.join(GOLDEN_DIR, "article-body.html"), "utf8");
    fixture = JSON.parse(
      await readFile(path.join(GOLDEN_DIR, "fixture.json"), "utf8"),
    ) as ArticleBlock[];
  } catch {
    console.log(
      "FAIL  golden files missing — run `npm run golden` in personal-website",
    );
    process.exit(1);
  }

  // The generator prefixes a provenance comment; the markup is the rest.
  const expected = golden.replace(/^<!--[\s\S]*?-->\n/, "").trim();
  const actual = renderToStaticMarkup(<PreviewBody content={fixture} />);

  check(
    "fixture covers every block type",
    new Set(fixture.map((block) => block.type)).size === 7,
    `saw ${[...new Set(fixture.map((b) => b.type))].join(", ")}`,
  );

  check(
    "fallback markup matches personal-website's ArticleBody",
    actual === expected,
    actual === expected ? "" : firstDifference(actual, expected),
  );

  console.log(`\n${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
