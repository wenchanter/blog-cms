#!/usr/bin/env node
/**
 * doc → blocks compiler tests, plus the round-trip property that makes the
 * Markdown migration safe: compiling a doc built from blocks must give back
 * exactly those blocks.
 */
import { compileDoc, compileDocJson } from "../lib/tiptap.ts";
import { blocksToDoc } from "../lib/blocks-to-doc.ts";
import { compileMarkdown } from "../lib/markdown.ts";

let passed = 0, failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`); }
};
const eq = (name, a, b) =>
  check(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

const doc = (...content) => ({ type: "doc", content });
const p = (...content) => ({ type: "paragraph", content });
const t = (text, marks) => (marks ? { type: "text", text, marks } : { type: "text", text });

/* ------------------------------------------------------------- basics */
{
  const { blocks, diagnostics } = compileDoc(doc(
    p(t("引子")),
    { type: "heading", attrs: { level: 2 }, content: [t("小节")] },
    p(t("正文")),
    { type: "bulletList", content: [
      { type: "listItem", content: [p(t("甲"))] },
      { type: "listItem", content: [p(t("乙"))] },
    ]},
    { type: "codeBlock", attrs: { language: "go" }, content: [t('fmt.Println("hi")')] },
  ));
  eq("首段成为 lead", blocks[0], { type: "lead", text: "引子" });
  eq("标题", blocks[1], { type: "heading", id: "heading-2", text: "小节", level: 2 });
  eq("段落", blocks[2], { type: "paragraph", text: "正文" });
  eq("无序列表", blocks[3], { type: "list", items: ["甲", "乙"], ordered: false });
  eq("代码块", blocks[4], { type: "code", language: "go", code: 'fmt.Println("hi")' });
  check("无诊断", diagnostics.length === 0, JSON.stringify(diagnostics));
}

/* -------------------------------------------------------------- marks */
{
  const { blocks } = compileDoc(doc(p(t("x")), p(
    t("普通"), t("粗", [{type:"bold"}]), t("斜", [{type:"italic"}]),
    t("码", [{type:"code"}]), t("下", [{type:"underline"}]), t("删", [{type:"strike"}]),
    t("链", [{type:"link", attrs:{href:"https://a.com"}}]),
  )));
  const text = blocks[1].text;
  eq("bold→strong", text[1], { type:"text", text:"粗", marks:["strong"] });
  eq("italic→em", text[2], { type:"text", text:"斜", marks:["em"] });
  eq("code", text[3], { type:"text", text:"码", marks:["code"] });
  eq("underline", text[4], { type:"text", text:"下", marks:["underline"] });
  eq("strike", text[5], { type:"text", text:"删", marks:["strike"] });
  eq("link", text[6], { type:"text", text:"链", href:"https://a.com" });
}

/* -------------------------------------------------------------- image */
{
  const { blocks } = compileDoc(doc(p(t("x")),
    { type: "image", attrs: { src: "/assets/a-1200x800.webp", alt: "图说" } }));
  eq("图片尺寸从文件名推导", blocks[1],
    { type:"image", src:"/assets/a-1200x800.webp", alt:"图说", width:1200, height:800 });
}
{
  const { blocks } = compileDoc(doc(p(t("x")),
    { type: "image", attrs: { src: "/assets/plain.webp", alt: "" } }));
  eq("无尺寸信息时省略宽高", blocks[1], { type:"image", src:"/assets/plain.webp", alt:"" });
}
{
  const { diagnostics } = compileDoc(doc(p(t("x")), { type: "imageUpload" }));
  check("上传中的图片阻止发布", diagnostics.some(d => d.severity === "error"));
}

/* -------------------------------------------------------------- quote */
{
  const { blocks } = compileDoc(doc(p(t("x")), { type:"blockquote", content:[
    p(t("一句引用")), p(t("— 某人")),
  ]}));
  eq("引用署名", blocks[1], { type:"quote", text:"一句引用", cite:"某人" });
}

/* --------------------------------------------------------- diagnostics */
{
  const { diagnostics } = compileDoc(doc(p(t("x")), { type:"table" }));
  check("未知块报 error", diagnostics.some(d => d.severity === "error"));
}
{
  const { blocks, diagnostics } = compileDoc(doc(p(t("x")), p(t("y", [{type:"highlight"}]))));
  check("未知 mark 只报 warning", diagnostics.every(d => d.severity === "warning"));
  check("未知 mark 保留文字", JSON.stringify(blocks[1]).includes("y"));
}
{
  const { blocks } = compileDoc(doc(p(t("x")), p(), p(t("y"))));
  check("空段落被忽略", blocks.length === 2, JSON.stringify(blocks));
}
{
  const r = compileDocJson("not json");
  check("坏 JSON 报 error", r.diagnostics.some(d => d.severity === "error"));
  eq("坏 JSON 不产出块", r.blocks, []);
}

/* ------------------------------- round-trip（迁移安全性的核心保证） */
const CORPUS = `这是开篇引子，说明整篇文章要讲什么。

## 背景与动机

先看一个 **重要** 的结论，再回头讲 *为什么*。代码在 \`server/handler.go\`，
详见[官方文档](https://example.com/docs)。

### 三个约束

- 第一个约束，涉及 **一致性**
- 第二个约束
- 第三个约束

1. 步骤一
2. 步骤二

> 架构是那些你预期改起来很贵的决定。
>
> — Harrison

\`\`\`typescript
export function handle(req: Request): Response {
  return new Response("ok");
}
\`\`\`

## 结论

最后一段，含 [链接](https://example.com) 和 **强调**。
`;

{
  const original = compileMarkdown(CORPUS).blocks;
  const roundTripped = compileDoc(blocksToDoc(original)).blocks;
  eq("Markdown 块 → doc → 块 完全一致", roundTripped, original);
}

{
  // Every block type, including the ones the corpus does not cover.
  const all = [
    { type:"lead", text:"引子" },
    { type:"heading", id:"a", text:[{type:"text",text:"标",marks:["strong"]}], level:2 },
    { type:"paragraph", text:[{type:"text",text:"链",href:"https://a.com"},{type:"text",text:"删",marks:["strike"]}] },
    { type:"list", items:["甲","乙"], ordered:true },
    { type:"list", items:[[{type:"text",text:"粗",marks:["strong"]}]], ordered:false },
    { type:"quote", text:"引用", cite:"某人" },
    { type:"quote", text:"无署名引用" },
    { type:"code", language:"ts", code:"const x = 1;" },
    { type:"image", src:"/assets/a-800x600.webp", alt:"图", width:800, height:600 },
  ];
  const back = compileDoc(blocksToDoc(all)).blocks;
  // heading id is re-derived deterministically from the text
  eq("全块类型 round-trip", back.map(b => b.type), all.map(b => b.type));
  eq("行内 round-trip", back[2], all[2]);
  eq("有序列表 round-trip", back[3], all[3]);
  eq("列表内行内 round-trip", back[4], all[4]);
  eq("带署名引用 round-trip", back[5], all[5]);
  eq("无署名引用 round-trip", back[6], all[6]);
  eq("代码 round-trip", back[7], all[7]);
  eq("图片 round-trip", back[8], all[8]);
}

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
