# vue-context-project

[![npm](https://img.shields.io/npm/v/vue-context-project.svg)](https://www.npmjs.com/package/vue-context-project)
[![Node.js](https://img.shields.io/node/v/vue-context-project.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Generate a compact, AI-friendly project context for **Vue / Nuxt** frontends — without dumping the whole repo into the prompt.  
With `--mode docs`, it also writes a **plain-language overview** so **non-technical people** can understand what the project is and what it does.

یک کانتکست فشرده و مناسب AI از پروژه‌های **Vue / Nuxt** می‌سازد — بدون اینکه کل ریپو را داخل پرامپت بریزی.  
با `--mode docs` یک **نمای کلی به زبان ساده** هم می‌سازد تا **افراد غیر‌فنی** بفهمند این پروژه چیست و چه کار می‌کند.

> **Principle / اصل:** Detection > Assumption  
> The tool only reports what it finds. It never invents folders, features, or APIs.  
> فقط چیزی را می‌نویسد که واقعاً پیدا کرده؛ چیزی از خودش اختراع نمی‌کند.

---

## English

### Why?

AI coding tools work better when they know your routes, APIs, stores, and structure — without reading every file. `vue-context-project` scans your project and writes a focused markdown summary you can paste into Cursor, ChatGPT, Claude, etc.

It also has a **docs mode for non-technical readers** (PMs, stakeholders, new joiners): a clear bilingual (English + Persian) explanation of what the product appears to be — screens, capabilities, main concepts, and how data moves — without technical jargon.

**Two audiences, one scan:**

| Mode | Who it's for | Default output |
|------|----------------|----------------|
| `--mode context` (default) | Developers & LLMs | `.ai/project-context.md` |
| `--mode docs` | Non-technical people | `.ai/project-overview.md` |

### Supported

- Vue + Vite
- Vue Router / Pinia / custom layouts
- Nuxt 3 / Nuxt 4
- TypeScript and plain JavaScript
- Small apps and large codebases

### Requirements

- Node.js **≥ 18**

### Install & run

**Recommended — no install (always works):**

```bash
npx vue-context-project .
```

**If your project uses npm:**

```bash
npm i -D vue-context-project
npx vue-context-project .
```

**If your project uses pnpm** (Nuxt / Vite often do — check `packageManager` in `package.json`):

```bash
pnpm add -D vue-context-project
pnpm exec vue-context-project .
```

**Global install:**

```bash
npm i -g vue-context-project
# or
pnpm add -g vue-context-project

vue-context-project /path/to/project
```

#### Important: `npm i` in a pnpm project

If the project is managed by **pnpm** and you run `npm i vue-context-project`, npm may crash with:

```text
Cannot read properties of null (reading 'matches')
```

This is an **npm + pnpm lockfile conflict**, not a bug in `vue-context-project`.

**Fix:** use the same package manager as the project:

| Project uses | Install with |
|--------------|--------------|
| pnpm         | `pnpm add -D vue-context-project` |
| npm          | `npm i -D vue-context-project` |
| yarn         | `yarn add -D vue-context-project` |
| none / one-off | `npx vue-context-project .` |

### CLI options

```bash
vue-context-project . -o context.md
vue-context-project . --mode docs
vue-context-project . --verbose
vue-context-project . --dry-run
vue-context-project . --focus products
vue-context-project . --focus pages/about.vue
vue-context-project . --exclude "storybook/**,e2e/**"
vue-context-project . --include "pages/**,composables/**"
```

| Option | Description |
|--------|-------------|
| `[path]` | Project root (default: `.`) |
| `-o, --output <file>` | Output path (default: `.ai/project-context.md`, or `.ai/project-overview.md` with `--mode docs`) |
| `--mode <mode>` | `context` (AI/technical, default) or `docs` (plain-language bilingual overview for non-technical readers) |
| `-v, --verbose` | Extra logging |
| `--dry-run` | Analyze only — do not write a file |
| `--focus <target>` | Feature keyword, route, or path |
| `--exclude <patterns>` | Comma-separated globs to skip |
| `--include <patterns>` | Comma-separated globs to narrow the scan |

### What it discovers

Reports **detected** or **undetected** for:

- Framework, TypeScript, routing, state, HTTP/API
- i18n, UI library, CSS framework, PWA, auth, validation

And when confidently extractable:

- Entry-point map
- Routes
- API surface (`fetch`, `axios`, `$fetch`, `useFetch`, Nuxt `server/api`, …)
- Domain types (structural — no hard-coded entity lists)
- Components / composables / stores metadata
- Focused subgraph via `--focus`

If something is unclear → **undetected**. No guessing.

### Programmatic API

```ts
import { generateProjectContext } from 'vue-context-project'

const result = generateProjectContext({
  projectPath: '.',
  output: '.ai/project-context.md',
  mode: 'context', // or 'docs'
  verbose: false,
  dryRun: false,
  exclude: [],
  include: [],
  focus: null,
})

console.log(result.markdown)
```

### Docs mode (for non-technical people)

Use this when you want to **explain the project to someone who is not a developer** — what it is, what it can do, which screens exist, and what the main business concepts are. English and Persian are written as **two fully separate sections** in one file.

```bash
npx vue-context-project . --mode docs
```

Writes `.ai/project-overview.md` by default. Same detection rules: only what was found, nothing invented.

### License

MIT

---

## فارسی

### چرا؟

ابزارهای AI وقتی بهتر کار می‌کنند که ساختار پروژه، روت‌ها، APIها و استورها را بدانند — بدون خواندن تک‌تک فایل‌ها.  
`vue-context-project` پروژه را اسکن می‌کند و یک خلاصهٔ مارک‌داون می‌سازد که می‌توانی در Cursor، ChatGPT، Claude و مشابه آن‌ها بگذاری.

همچنین یک **حالت docs برای افراد غیر‌فنی** دارد (مدیر محصول، ذی‌نفعان، اعضای جدید تیم): توضیح واضح دوزبانه (انگلیسی + فارسی) از اینکه محصول به نظر چه چیزی است — صفحات، قابلیت‌ها، مفاهیم اصلی، و نحوهٔ جابه‌جایی داده — بدون اصطلاحات سنگین فنی.

**دو مخاطب، یک اسکن:**

| حالت | مخاطب | خروجی پیش‌فرض |
|------|--------|----------------|
| `--mode context` (پیش‌فرض) | توسعه‌دهنده و LLM | `.ai/project-context.md` |
| `--mode docs` | افراد غیر‌فنی | `.ai/project-overview.md` |

### پشتیبانی

- Vue + Vite
- Vue Router / Pinia / لایه‌بندی سفارشی
- Nuxt 3 / Nuxt 4
- TypeScript و JavaScript ساده
- پروژه‌های کوچک و بزرگ

### پیش‌نیاز

- Node.js نسخهٔ **۱۸ به بالا**

### نصب و اجرا

**پیشنهادی — بدون نصب (همیشه کار می‌کند):**

```bash
npx vue-context-project .
```

**اگر پروژه با npm است:**

```bash
npm i -D vue-context-project
npx vue-context-project .
```

**اگر پروژه با pnpm است** (خیلی از پروژه‌های Nuxt / Vite — فیلد `packageManager` در `package.json` را ببین):

```bash
pnpm add -D vue-context-project
pnpm exec vue-context-project .
```

**نصب سراسری:**

```bash
npm i -g vue-context-project
# یا
pnpm add -g vue-context-project

vue-context-project /path/to/project
```

#### مهم: `npm i` داخل پروژهٔ pnpm

اگر پروژه با **pnpm** مدیریت می‌شود و `npm i vue-context-project` بزنی، ممکن است npm با این خطا کرش کند:

```text
Cannot read properties of null (reading 'matches')
```

این باگ خود پکیج نیست؛ تداخل **npm با lockfile مربوط به pnpm** است.

**راه‌حل:** همان package manager پروژه را استفاده کن:

| پروژه با | نصب با |
|----------|--------|
| pnpm     | `pnpm add -D vue-context-project` |
| npm      | `npm i -D vue-context-project` |
| yarn     | `yarn add -D vue-context-project` |
| فقط یک‌بار / بدون نصب | `npx vue-context-project .` |

### گزینه‌های CLI

```bash
vue-context-project . -o context.md
vue-context-project . --mode docs
vue-context-project . --verbose
vue-context-project . --dry-run
vue-context-project . --focus products
vue-context-project . --focus pages/about.vue
vue-context-project . --exclude "storybook/**,e2e/**"
vue-context-project . --include "pages/**,composables/**"
```

| گزینه | توضیح |
|--------|--------|
| `[path]` | ریشهٔ پروژه (پیش‌فرض: `.`) |
| `-o, --output <file>` | مسیر خروجی (پیش‌فرض: `.ai/project-context.md`، یا `.ai/project-overview.md` با `--mode docs`) |
| `--mode <mode>` | `context` (فنی / مناسب AI، پیش‌فرض) یا `docs` (نمای کلی سادهٔ دوزبانه برای مخاطب غیر‌فنی) |
| `-v, --verbose` | لاگ بیشتر |
| `--dry-run` | فقط تحلیل — فایل ننویس |
| `--focus <target>` | تمرکز روی فیچر، روت یا مسیر |
| `--exclude <patterns>` | الگویهای glob برای حذف (با کاما) |
| `--include <patterns>` | محدود کردن اسکن (با کاما) |

### چه چیزهایی پیدا می‌کند؟

برای این‌ها می‌گوید **detected** یا **undetected**:

- فریم‌ورک، TypeScript، روتینگ، state، HTTP/API
- i18n، UI library، CSS framework، PWA، auth، validation

و در صورت اطمینان:

- نقشهٔ entry point
- روت‌ها
- سطح API (`fetch`، `axios`، `$fetch`، `useFetch`، `server/api` در Nuxt و …)
- تایپ‌های دامنه (ساختاری — بدون لیست entity از پیش‌فرض)
- متادیتای کامپوننت / composable / store
- زیر‌گراف متمرکز با `--focus`

اگر مطمئن نباشد → **undetected**. حدس نمی‌زند.

### استفاده به‌صورت API

```ts
import { generateProjectContext } from 'vue-context-project'

const result = generateProjectContext({
  projectPath: '.',
  output: '.ai/project-context.md',
  mode: 'context', // یا 'docs'
  verbose: false,
  dryRun: false,
  exclude: [],
  include: [],
  focus: null,
})

console.log(result.markdown)
```

### حالت docs (برای افراد غیر‌فنی)

وقتی می‌خواهی **پروژه را برای کسی که توسعه‌دهنده نیست توضیح بدهی** از این حالت استفاده کن — اینکه چیست، چه کارهایی می‌کند، چه صفحاتی دارد، و مفاهیم اصلی کسب‌وکار کدام‌اند. انگلیسی و فارسی به‌صورت **دو بخش کاملاً جدا** در یک فایل نوشته می‌شوند.

```bash
npx vue-context-project . --mode docs
```

پیش‌فرض خروجی: `.ai/project-overview.md`. همان اصل تشخیص: فقط آنچه پیدا شده، بدون اختراع.

### لایسنس

MIT
