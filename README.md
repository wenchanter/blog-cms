# Blog CMS

基于 Next.js 16，并通过 OpenNext 部署到 Cloudflare Workers。运行时资源：

- D1 `DB`：博客文章数据
- R2 `BLOG_ASSETS`：图片和附件
- R2 `NEXT_INC_CACHE_R2_BUCKET`：Next.js ISR/增量缓存

## 本地开发

```bash
npm install
npm run db:migrate:local
npm run dev
```

`npm run dev` 使用 Next.js 开发服务器。`next.config.ts` 已初始化 Cloudflare 本地平台代理，因此服务端代码可以直接访问本地 D1/R2 绑定；数据保存在 `.wrangler/` 中。

如需在与生产更接近的 `workerd` 运行时中验证：

```bash
npm run preview
```

修改 `wrangler.jsonc` 中的绑定后，重新生成类型：

```bash
npm run cf-typegen
```

## 在服务端访问 D1 和 R2

项目提供了 `lib/cloudflare.ts`：

```ts
import { getAssetBucket, getDatabase } from "@/lib/cloudflare";

const db = await getDatabase();
const post = await db
  .prepare("SELECT * FROM posts WHERE slug = ?")
  .bind("hello-world")
  .first();

const bucket = await getAssetBucket();
await bucket.put("covers/hello.webp", imageBody, {
  httpMetadata: { contentType: "image/webp" },
});
```

这些绑定只能在 Server Components、Server Actions 或 Route Handlers 等服务端代码中使用，不要从客户端组件导入。

## 登录与鉴权

登录页在 `/login`，受保护的后台在 `/admin`。创建账号（密码从标准输入读取，不会进入 shell 历史或进程列表）：

```bash
npm run user:create -- --email you@example.com --name "你的名字" --role admin        # 本地
npm run user:create -- --email you@example.com --name "你的名字" --role admin --remote # 生产
```

实现分为几层：

| 文件 | 职责 |
| --- | --- |
| `lib/password.ts` | PBKDF2-SHA256 密码哈希（Web Crypto，Workers 可用） |
| `lib/session.ts` | D1 会话的创建、校验与撤销 |
| `lib/rate-limit.ts` | 登录失败次数的固定窗口限流 |
| `lib/dal.ts` | `getCurrentUser` / `requireUser` / `requireRole` |
| `app/actions/auth.ts` | `login` / `logout` Server Actions |
| `proxy.ts` | 乐观跳转（仅看 cookie 是否存在）+ 安全响应头 |

安全设计要点：

- **密码**：PBKDF2-SHA256，210,000 轮 + 每用户随机 salt，比较使用常量时间。迭代次数写在哈希记录里，日后调高时旧密码会在下次登录自动升级。
- **会话**：cookie 里是 32 字节随机 token，数据库只存它的 SHA-256，因此库被读取也拿不到可重放的凭证。cookie 为 `HttpOnly` + `SameSite=Lax` + 生产环境 `Secure`，固定 7 天绝对有效期；登出会在服务端删除会话记录。
- **不泄露账号是否存在**：邮箱不存在时仍对一个 dummy 哈希跑完整 PBKDF2，且所有失败共用同一条提示。
- **限流**：同一 IP+邮箱 15 分钟内 5 次失败即锁定，同一 IP 20 次；锁定期间正确密码同样被拒。
- **鉴权位置**：`proxy.ts` 只做乐观预筛（不查库，因为它对预取请求也会运行），真正的判定在 DAL 中贴近数据源完成。
- **开放重定向**：`?next=` 只接受站内相对路径。
- **CSRF**：Server Actions 自带 Origin 校验，配合 `SameSite=Lax` 的会话 cookie。

> 注意：一次 PBKDF2 约需 100–200ms CPU，超出 Workers 免费套餐每请求的 CPU 配额，登录需要付费套餐（或在 `lib/password.ts` 中调低 `ITERATIONS`，代价是抗离线破解能力下降）。

## 文章 CMS

后台在 `/admin`：概览、文章列表（搜索 / 状态 / 分类 / 标签筛选、分页）、新建与编辑、发布切换、软删除与回收站。

| 文件 | 职责 |
| --- | --- |
| `lib/posts.ts` | 文章的类型定义与全部查询（列表、单篇、增删改、软删除、恢复、彻底删除） |
| `lib/validation.ts` | 表单校验与 slug 生成 |
| `app/actions/posts.ts` | 文章相关 Server Actions |
| `app/admin/posts/post-form.tsx` | 新建与编辑共用的表单 |

字段与数据库列的对应（`migrations/0003_reshape_posts.sql`）：

| 字段 | 列 | 说明 |
| --- | --- | --- |
| `id` | `id` | 自增主键 |
| `slug` | `slug` | 仅在未删除的文章之间唯一（部分唯一索引） |
| `status` | `status` | `draft` / `published`，由 CHECK 约束 |
| `title` | `title` | |
| `description?` | `description` | 摘要 |
| `category` | `category` | 存分类 slug，外键指向 `categories.slug`，见下节 |
| `eyebrow?` | `eyebrow` | |
| `tags[]` | `tags` | SQLite 无数组类型，存 JSON 数组，用 `json_each()` 查询 |
| `featured` | `featured` | INTEGER 0/1 |
| `publishedAt` | `published_at` | 首次发布时写入，之后不再变动；草稿为 NULL |
| `updatedAt` | `updated_at` | |
| `deleteAt` | `deleted_at` | 软删除标记，NULL 表示存活；所有读取都会过滤 |
| `createAt` | `created_at` | |
| `content` | `content_doc` | TipTap 文档 JSON；旧的 `content` 列保留 Markdown 存档 |
| `seo?` | `seo` | JSON 对象文本，保存前校验 |

几点设计说明：

- **软删除**：删除只写 `deleted_at`，文章进入回收站，可恢复或彻底删除。slug 的唯一索引带 `WHERE deleted_at IS NULL`，所以回收站里的文章不会一直占着 slug；反过来，如果该 slug 在此期间被别人用了，恢复会被拒绝并给出提示，而不是破坏索引。
- **发布时间**：`published_at` 只在第一次转为 `published` 时写入，之后改回草稿再发布不会覆盖原始发布时间。
- **鉴权**：Server Action 可以被直接 POST，不只是通过界面触发，所以每个 action 内部都重新校验会话，而不是依赖“这个页面是受保护的”。
- **表单**：所有字段受控。Server Action 结束后浏览器会重置表单，校验失败时若依赖默认值会让作者丢失整篇正文；现在服务端把提交值回传，客户端重新填充，`<select>` 与 checkbox 另外在每次提交后强制同步 DOM（表单重置恢复的是 HTML 属性，而 React 不会为它们写属性）。

> slug 自动生成只处理 ASCII，中文标题需要手动填写 slug。

## 分类管理

`/admin/categories` 可以创建、编辑、删除分类；文章表单里的分类是一个下拉框，只能从已有分类中选。

`categories` 表（`migrations/0004_create_categories.sql`）：`id` / `slug`（唯一）/ `name` / `description` / 时间戳。`posts.category` 仍是 TEXT，存的是分类 slug，并带外键：

```sql
category TEXT NOT NULL
  REFERENCES categories (slug) ON UPDATE CASCADE ON DELETE RESTRICT
```

由此得到两个行为：

- **改 slug 会级联**：重命名分类 slug，所有引用它的文章自动跟着改，不需要手动迁移，也不会出现悬空引用。
- **有文章的分类删不掉**：列表里的删除按钮会被禁用，Server Action 会再拦一次并给出提示，数据库的 `ON DELETE RESTRICT` 是最后一道防线（直接执行 SQL 也会被拒）。要删除得先把文章移到别的分类。

迁移会把已有文章的分类文本自动转成分类记录（原文本作为名称，小写连字符形式作为 slug），空分类归入 `uncategorized`，因此不会丢数据。

> 下拉框只是界面约束。Server Action 可以被直接 POST，所以保存文章时会再校验分类是否真实存在，避免外键报 500。

## 正文格式与 personal-website 对接

personal-website 的 `content` 是**结构化块数组**（`ArticleBlock[]`）。对接方式：**编辑器的原生文档是唯一存储格式，读取时单向编译成块数组**，网站侧不需要任何解析器。

```
富文本编辑器 ──写──► posts.content_doc（TipTap doc JSON，原样存，永不加工）
                        │
                        └──读──► doc → 块 ──┬──► 编辑器内预览
                                            └──► GET /api/posts ──► sync-blog.ts ──► 静态页
```

关键在于**转换器只站在读的一侧**：写入路径上没有任何转换，所以转换器即使有 bug 也只影响输出，库里的原文始终完好，修好后重新构建即可恢复。

| 文件 | 职责 |
| --- | --- |
| `lib/blocks.ts` | 块与行内富文本类型，与网站 `app/blog/types.ts` 保持一致 |
| `lib/tiptap.ts` | doc → 块编译器 |
| `app/admin/posts/post-editor.tsx` | 编辑器（schema 受约束） |
| `app/admin/posts/site-preview.tsx` | 实时预览（iframe 加载站点的 `/preview/`） |
| `app/admin/posts/article-preview.tsx` | 离线降级渲染器，`ArticleBody.tsx` 的逐字节副本 |
| `lib/preview-protocol.ts` | 预览的 postMessage 协议，与站点同名文件保持一致 |
| `app/api/posts/route.ts` | 构建期数据源，Bearer token 鉴权 |
| `app/api/upload/route.ts` · `app/assets/[...key]/route.ts` | 图片上传与公开读取（R2） |
| `lib/markdown.ts` · `lib/blocks-to-doc.ts` | 仅供迁移使用，运行时不再调用 |

### 编辑器能力就是块模型能力

编辑器基于 Tiptap UI Components 的 Simple Editor 模板，但 **schema 被裁剪到与块模型完全一致**：

| 块 | 行内 |
| --- | --- |
| 段落、二/三级标题、有序/无序列表、引用、代码块、图片 | 粗体、斜体、下划线、删除线、行内代码、链接 |

模板自带的高亮、上下标、文字对齐、任务列表、分隔线**已关闭**。这不是偷懒——它们在文章页没有对应的呈现方式，关掉之后作者**根本敲不出无法发布的内容**，格式问题从"事后检查"变成"结构上不可能"。

要新增一种格式，必须同时改三处：`lib/blocks.ts`、网站的 `app/blog/types.ts` 与 `ArticleBody.tsx`、以及编辑器的 schema。

两个约定，不需要额外操作：**正文第一段自动成为 lead**；**引用块最后一段以 `—` 开头会成为署名**。

### 图片

上传走 `POST /api/upload`（需登录），写入 R2 `BLOG_ASSETS`，由 `/assets/<key>` 公开读取。

**上传前在浏览器里压缩**（`lib/compress-image.ts`）——用浏览器自带的 WebP 编码器，不依赖任何图片服务，也不占 Worker CPU：

| 规则 | 原因 |
| --- | --- |
| 长边缩到 **2400px** | 正文栏宽约 700 CSS px，2400 已够 3 倍屏；再多的像素读者永远看不到 |
| 转 **WebP，质量 0.92** | 比 JPEG 小且保留 PNG 的透明通道；实测 PSNR 41.9dB（>40dB 肉眼不可分辨） |
| 不放大、不动已达标的图 | 小于 150KB 且尺寸够小的原样保留 |
| 重编码变大就丢弃 | 小图或纯色图常常越压越大，这时保留原始字节 |
| GIF 直接跳过 | canvas 会把动图压成单帧 |

实测：**18MB / 3200×2000 的 PNG → 903KB / 2400×1500 的 WebP（4.9%）**。

存储上限 **2MB**（服务端硬限）。可选择的文件放宽到 20MB——压缩通常能把大图降到上限内，按选择时的大小拒绝会误伤。

其余：

- 服务端**按魔数嗅探**真实类型，不信任 `Content-Type`，只接受 PNG / JPEG / WebP / GIF / AVIF。
- 压缩后的像素尺寸编码进对象键（`...-2400x1500.webp`），编译器读出来写进块，静态页据此预留空间，避免布局跳动。
- `/api/posts` 会把图片地址**转成绝对地址**（默认请求 origin，可用 `PUBLIC_ASSET_BASE_URL` 覆盖）——静态站在另一个域名下，相对路径会 404。

**图注即 alt。** 图片下方有一个输入框，写什么，文章页的 `<figcaption>` 就显示什么，同时作为图片的替代文字。模板原本拿**文件名**当 alt（于是文章里会出现「screenshot-2026」这种图注），已改为默认留空，由作者自己写——见 `image-upload-node.tsx` 里标注 `LOCAL MODIFICATION` 的那处。

> 尚未处理：删除文章或移除图片时不会清理 R2，孤儿对象会留在桶里。

### 预览

正文区右上角的「预览」打开全屏预览。它**不是 CMS 画的仿真页面，而是 personal-website 本身**——iframe 加载该站的 `/preview/`，编辑内容通过 `postMessage` 推进去，由站点用它真实的 `ArticleBody`、真实样式表、真实字体渲染。

```
CMS 编辑器                         personal-website /preview/
┌────────────────────┐            ┌──────────────────────────┐
│ compileDocJson()   │  render    │ ArticleHero              │
│   → ArticleBlock[] │───────────►│ ArticleBody   ← 真实组件  │
│                    │◄───────────│ ArticleAside             │
│ <iframe>           │  ready     │ 真实 CSS / 字体 / 断点    │
└────────────────────┘            └──────────────────────────┘
```

这样做的理由：CMS 里再维护一份渲染器，就一定会和站点漂移——之前加下划线、删除线、图片时就漏改过预览。**现在只有一个渲染器，漂移在结构上不可能发生。**

iframe 固定为设备视口（桌面 1440 / 平板 834 / 手机 390）并缩放适配，而不是随内容拉高——只有真实视口才能让 `sm:`/`lg:` 断点、`100dvh`、固定页头和 sticky 目录表现得和读者看到的一致。

安全：两侧各有一份 origin 白名单（CMS 的 `NEXT_PUBLIC_SITE_ORIGIN`，站点的 `NEXT_PUBLIC_CMS_ORIGIN`），不在名单里的消息一律丢弃；协议带版本号，任一侧部署过期就整体忽略而不是渲染出半截内容。`/preview/` 页面本身 `noindex, nofollow` 且不进 sitemap。

**离线降级**：站点没启动或没配地址时，6 秒握手超时后退回 CMS 内置的近似预览，并明确标注「近似」。这份内置渲染器是 `ArticleBody.tsx` 的逐字节副本，由 `npm run test:parity` 强制保证——它拿站点生成的黄金文件比对 HTML，不一致就失败：

```bash
cd ../personal-website && npm run golden   # 由真实组件生成黄金文件
cd ../blog-cms && npm run test:parity      # 断言内置副本与之逐字节相同
```

改了站点的 `ArticleBody.tsx` 之后重新执行这两步；测试失败时**应当把新标记拷贝过来，而不是反向重新生成黄金文件**。

### 从 Markdown 迁移

历史文章存量是 Markdown。迁移脚本对每一篇都先验证再写入：

```bash
npm run migrate:doc -- --dry-run    # 只检查，不写库
npm run migrate:doc                 # 本地
npm run migrate:doc -- --remote     # 生产
```

它把 Markdown 编译成块 → 生成 doc → 再把 doc 编译回块，**两次结果必须逐字节相同**才写库，否则报告并跳过。`posts.content`（原 Markdown）**保留不删**，迁移可回退。

### 配置

```bash
npx wrangler secret put CMS_API_TOKEN       # 生产
echo 'CMS_API_TOKEN="..."' > .dev.vars      # 本地（已 gitignore）
```

实时预览还需要两侧互指对方的 origin（见各自的 `.env.example`）：

| 变量 | 位置 | 值 |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_ORIGIN` | blog-cms | personal-website 的地址，如 `http://localhost:3001` |
| `NEXT_PUBLIC_CMS_ORIGIN` | personal-website | CMS 的地址，可逗号分隔多个 |

两者都是 `NEXT_PUBLIC_`，**在构建期内联**，改完要重新构建。留空则预览自动降级为内置近似渲染。

personal-website 侧另需设置 `CMS_API_URL` 与同一个 `CMS_API_TOKEN`，之后 `npm run build` 会自动同步并生成静态页。

> `components/tiptap-*`、`hooks/`、`lib/tiptap-utils.ts` 是 `@tiptap/cli` 装进来的第三方源码，已在 eslint 中忽略。

## 首次部署

先登录 Cloudflare：

```bash
npx wrangler login
```

然后构建并部署 Worker：

```bash
npx wrangler r2 bucket create blog-cms-assets
npx wrangler r2 bucket create blog-cms-next-cache
npm run deploy
```

OpenNext 要求增量缓存的 R2 bucket 使用明确名称，因此首次部署前需要创建上述两个 bucket。D1 使用 Wrangler 自动资源配置，首次部署时会创建数据库并把生成的资源标识写回配置文件。Worker 部署完成后执行远端迁移：

```bash
npm run db:migrate:remote
```

后续发布仍使用 `npm run deploy`。仅上传新 Worker 版本、不立即部署时可运行 `npm run upload`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | Next.js 本地开发 |
| `npm run preview` | 构建并在本地 Worker 运行时预览 |
| `npm run build` | Next.js 生产构建 |
| `npm run deploy` | 构建并部署到 Cloudflare Workers |
| `npm run user:create` | 创建/更新 CMS 登录账号 |
| `npm run test:tiptap` | 运行 doc → 块编译器与 round-trip 测试 |
| `npm run test:markdown` | 运行 Markdown 编译器测试（迁移用） |
| `npm run test:parity` | 断言降级渲染器与站点 `ArticleBody` 逐字节一致 |
| `npm run migrate:doc` | 把历史 Markdown 迁移为 doc |
| `npm run db:migrate:local` | 应用本地 D1 迁移 |
| `npm run db:migrate:remote` | 应用生产 D1 迁移 |
| `npm run cf-typegen` | 根据 Wrangler 绑定生成 TypeScript 类型 |
