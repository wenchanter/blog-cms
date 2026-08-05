#!/usr/bin/env node
/**
 * Compiler tests. Run with `npm run test:markdown`.
 *
 * The most important property is the last suite: every word the author typed
 * must survive into the blocks, or the compiler must say so out loud.
 */

import { compileMarkdown } from "../lib/markdown.ts";
import { blocksToPlainText, richTextToPlain } from "../lib/blocks.ts";

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
    return;
  }
  console.log(`PASS  ${name}`);
}

function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  check(name, a === b, `got ${a} want ${b}`);
}

/* ---------------------------------------------------------------- blocks */

{
  const { blocks, diagnostics } = compileMarkdown(
    "开篇引子。\n\n## 第一节\n\n正文一段。\n\n### 小节\n\n- 甲\n- 乙\n\n1. 一\n2. 二\n\n> 引用一句\n>\n> — 某人\n\n```go\nfmt.Println(\"hi\")\n```\n",
  );

  eq("首段编译为 lead", blocks[0], { type: "lead", text: "开篇引子。" });
  eq("## 编译为 level 2", blocks[1], {
    type: "heading",
    id: "heading-2",
    text: "第一节",
    level: 2,
  });
  eq("普通段落", blocks[2], { type: "paragraph", text: "正文一段。" });
  check("### 编译为 level 3", blocks[3].level === 3);
  eq("无序列表", blocks[4], {
    type: "list",
    items: ["甲", "乙"],
    ordered: false,
  });
  eq("有序列表", blocks[5], { type: "list", items: ["一", "二"], ordered: true });
  eq("引用带署名", blocks[6], {
    type: "quote",
    text: "引用一句",
    cite: "某人",
  });
  eq("代码块带语言", blocks[7], {
    type: "code",
    language: "go",
    code: 'fmt.Println("hi")',
  });
  check("无诊断", diagnostics.length === 0, JSON.stringify(diagnostics));
}

/* ---------------------------------------------------------------- inline */

{
  const { blocks } = compileMarkdown(
    "x\n\n普通 **粗** 和 *斜* 和 `码` 和 [链接](https://a.com)。",
  );
  const text = blocks[1].text;
  check("行内格式产生节点数组", Array.isArray(text));
  eq("粗体节点", text[1], { type: "text", text: "粗", marks: ["strong"] });
  eq("斜体节点", text[3], { type: "text", text: "斜", marks: ["em"] });
  eq("行内代码节点", text[5], { type: "text", text: "码", marks: ["code"] });
  eq("链接节点", text[7], {
    type: "text",
    text: "链接",
    href: "https://a.com",
  });
}

{
  const { blocks } = compileMarkdown("x\n\n[**粗链接**](https://a.com)");
  eq("粗体链接同时带 marks 和 href", blocks[1].text, [
    { type: "text", text: "粗链接", marks: ["strong"], href: "https://a.com" },
  ]);
}

{
  const { blocks } = compileMarkdown("纯文字没有格式");
  eq("无格式时保持字符串", blocks[0].text, "纯文字没有格式");
}

{
  const { blocks } = compileMarkdown("x\n\n- 列表里的 **粗体**");
  check("列表项支持行内格式", Array.isArray(blocks[1].items[0]));
}

/* ----------------------------------------------------------- diagnostics */

const errorCases = [
  ["表格", "x\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"],
  ["图片", "x\n\n![alt](/a.png)"],
  ["HTML 块", "x\n\n<div>hi</div>"],
  ["嵌套列表", "x\n\n- 一\n  - 一点一\n"],
];

for (const [name, source] of errorCases) {
  const { diagnostics } = compileMarkdown(source);
  check(
    `${name} 产生 error 诊断`,
    diagnostics.some((d) => d.severity === "error"),
    JSON.stringify(diagnostics),
  );
}

{
  const { diagnostics } = compileMarkdown("x\n\n# 正文里的一级标题");
  check(
    "正文 H1 产生 warning",
    diagnostics.some((d) => d.severity === "warning"),
  );
  check("H1 不是 error", !diagnostics.some((d) => d.severity === "error"));
}

{
  const { diagnostics } = compileMarkdown("第一行\n\n\n\n\n\n---\n");
  const hr = diagnostics.find((d) => d.message.includes("分隔线"));
  check("诊断带正确行号", hr?.line === 7, JSON.stringify(diagnostics));
}

/* ------------------------------------------------------------- heading id */

{
  const { blocks } = compileMarkdown("x\n\n## 重复\n\n## 重复\n\n## 重复");
  const ids = blocks.filter((b) => b.type === "heading").map((b) => b.id);
  check("重复标题 id 去重", new Set(ids).size === 3, ids.join(","));
}

{
  const { blocks } = compileMarkdown("x\n\n## Hello World");
  eq("英文标题 slug", blocks[1].id, "hello-world");
}

/* --------------------------------------------------------- entity safety */

{
  const { blocks } = compileMarkdown("A & B < C > D \"quoted\"");
  eq("HTML 实体被还原", blocks[0].text, 'A & B < C > D "quoted"');
}

{
  const { blocks } = compileMarkdown("x\n\n```\na && b < c\n```");
  eq("代码块内容原样保留", blocks[1].code, "a && b < c");
}

/* ------------------------------------------------- 内容不丢失（核心属性） */

const CORPUS = `这是开篇的一段引子，用来说明整篇文章要讲什么。

## 背景与动机

我们先看一个 **重要** 的结论，再回头讲 *为什么*。相关代码在 \`server/handler.go\` 里，
详见[官方文档](https://example.com/docs)。

### 三个约束

- 第一个约束，涉及 **一致性**
- 第二个约束
- 第三个约束，带 \`inline code\`

1. 步骤一
2. 步骤二
3. 步骤三

> 架构是那些你预期改起来很贵的决定。
>
> — Harrison

\`\`\`typescript
export function handle(req: Request): Response {
  return new Response("ok");
}
\`\`\`

## 结论

最后一段总结，包含一个 [链接](https://example.com) 和一些 **强调**。
`;

{
  const { blocks, diagnostics } = compileMarkdown(CORPUS);
  check("真实语料无 error", !diagnostics.some((d) => d.severity === "error"));

  // Every non-syntax word from the source must appear in the compiled blocks.
  const plain = blocksToPlainText(blocks);
  const words = CORPUS
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*`\-\[\]()]/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^\d+\.$/.test(w));

  const missing = words.filter((w) => !plain.includes(w));
  check("没有内容丢失", missing.length === 0, `missing: ${missing.join(" | ")}`);

  const codeBlock = blocks.find((b) => b.type === "code");
  check(
    "代码块完整保留",
    codeBlock.code.includes("export function handle") &&
      codeBlock.code.includes('return new Response("ok");'),
  );

  const quote = blocks.find((b) => b.type === "quote");
  check("引用署名被提取", quote.cite === "Harrison");
  check(
    "引用正文保留",
    richTextToPlain(quote.text).includes("架构是那些你预期改起来很贵的决定"),
  );
}

/* --------------------------------------------------- CRLF（浏览器提交） */

{
  // Browsers submit textarea content with CRLF; marked normalises tokens to
  // LF. Mismatched line endings used to shift every diagnostic line number.
  const crlf = "开头。\r\n\r\n| a | b |\r\n| - | - |\r\n| 1 | 2 |\r\n";
  const lf = crlf.replace(/\r/g, "");
  const a = compileMarkdown(crlf);
  const b = compileMarkdown(lf);
  eq("CRLF 与 LF 诊断一致", a.diagnostics, b.diagnostics);
  check("CRLF 行号正确", a.diagnostics[0].line === 3, String(a.diagnostics[0].line));
}

{
  const crlf = compileMarkdown("引子。\r\n\r\n## 标题\r\n\r\n正文 **粗**。");
  const lf = compileMarkdown("引子。\n\n## 标题\n\n正文 **粗**。");
  eq("CRLF 与 LF 产出相同的块", crlf.blocks, lf.blocks);
}

/* ------------------------------------------------------------ edge cases */

{
  const { blocks, diagnostics } = compileMarkdown("");
  eq("空输入产生空块", blocks, []);
  eq("空输入无诊断", diagnostics, []);
}

{
  const { blocks } = compileMarkdown("   \n\n   \n");
  eq("纯空白产生空块", blocks, []);
}

{
  const { blocks } = compileMarkdown("x\n\n```\nno language\n```");
  eq("无语言的代码块回落 text", blocks[1].language, "text");
}

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
