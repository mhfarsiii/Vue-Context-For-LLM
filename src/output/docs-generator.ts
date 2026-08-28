import type {
  ApiEndpoint,
  CapabilityFinding,
  DomainType,
  ProjectCapabilities,
  ProjectContext,
  RouteInfo,
} from '../types/project.js';
import { redactSecrets } from '../security/secret-filter.js';

type CapKey = Exclude<keyof ProjectCapabilities, 'presentDirectories'>;

const CAP_COPY: Record<
  CapKey,
  { enTitle: string; faTitle: string; explainEn: string; explainFa: string }
> = {
  framework: {
    enTitle: 'Built with a modern web framework',
    faTitle: 'با یک فریم‌ورک مدرن وب ساخته شده',
    explainEn:
      'This is the main technology that structures the user-facing app (pages, layout, and interactive UI).',
    explainFa:
      'این فناوری اصلی است که اپلیکیشن سمت کاربر را ساختاربندی می‌کند (صفحات، چیدمان و رابط تعاملی).',
  },
  typescript: {
    enTitle: 'Uses typed code (TypeScript)',
    faTitle: 'از کد تایپ‌دار (TypeScript) استفاده می‌کند',
    explainEn:
      'Important data shapes are described in code, which helps keep forms, lists, and APIs consistent.',
    explainFa:
      'شکل داده‌های مهم در کد توصیف شده تا فرم‌ها، فهرست‌ها و ارتباط با سرور منسجم‌تر بمانند.',
  },
  routing: {
    enTitle: 'Has multiple pages users can open',
    faTitle: 'چند صفحه دارد که کاربر می‌تواند باز کند',
    explainEn:
      'The app is not a single screen only — users can move between different addresses (URLs).',
    explainFa:
      'اپلیکیشن فقط یک صفحه نیست؛ کاربر می‌تواند بین آدرس‌های (URL) مختلف جابه‌جا شود.',
  },
  stateManagement: {
    enTitle: 'Keeps shared information in one place',
    faTitle: 'اطلاعات مشترک را یکجا نگه می‌دارد',
    explainEn:
      'Things like a shopping cart or login status can be remembered and reused across pages.',
    explainFa:
      'چیزهایی مثل سبد خرید یا وضعیت ورود می‌توانند بین صفحات به‌خاطر سپرده و دوباره استفاده شوند.',
  },
  httpApi: {
    enTitle: 'Talks to a server to load or save data',
    faTitle: 'برای گرفتن یا ذخیرهٔ داده با سرور حرف می‌زند',
    explainEn:
      'When the app needs real data (products, cart, …), it requests it from a backend or external API.',
    explainFa:
      'وقتی اپ به دادهٔ واقعی نیاز دارد (محصول، سبد و …)، آن را از سرور یا API خارجی می‌گیرد.',
  },
  i18n: {
    enTitle: 'Supports more than one language',
    faTitle: 'از بیش از یک زبان پشتیبانی می‌کند',
    explainEn:
      'On-screen text can be shown in different languages for different users.',
    explainFa:
      'متن‌های روی صفحه می‌توانند برای کاربران مختلف به زبان‌های گوناگون نمایش داده شوند.',
  },
  uiLibrary: {
    enTitle: 'Uses ready-made interface building blocks',
    faTitle: 'از قطعات آمادهٔ رابط کاربری استفاده می‌کند',
    explainEn:
      'Buttons, forms, and similar UI pieces may come from a shared component library.',
    explainFa:
      'دکمه‌ها، فرم‌ها و قطعات مشابه ممکن است از یک کتابخانهٔ مشترک UI آمده باشند.',
  },
  cssFramework: {
    enTitle: 'Uses a styling system for look and layout',
    faTitle: 'برای ظاهر و چیدمان از سیستم استایل استفاده می‌کند',
    explainEn:
      'Spacing, colors, and responsive layout are helped by a CSS framework.',
    explainFa:
      'فاصله‌ها، رنگ‌ها و چیدمان واکنش‌گرا با کمک یک فریم‌ورک CSS مدیریت می‌شوند.',
  },
  pwa: {
    enTitle: 'Can work more like an installable app',
    faTitle: 'می‌تواند شبیه اپ قابل‌نصب رفتار کند',
    explainEn:
      'There are signs of Progressive Web App support (install / offline-style behavior).',
    explainFa:
      'نشانه‌هایی از پشتیبانی Progressive Web App وجود دارد (نصب یا رفتار شبیه آفلاین).',
  },
  authentication: {
    enTitle: 'Has sign-in or user identity handling',
    faTitle: 'ورود یا مدیریت هویت کاربر دارد',
    explainEn:
      'The project shows signs that some features may require knowing who the user is.',
    explainFa:
      'پروژه نشان می‌دهد برخی قابلیت‌ها ممکن است نیاز داشته باشند بدانند کاربر کیست.',
  },
  validation: {
    enTitle: 'Checks user input before trusting it',
    faTitle: 'ورودی کاربر را قبل از اعتماد بررسی می‌کند',
    explainEn:
      'Forms or API payloads are validated so invalid data is caught early.',
    explainFa:
      'فرم‌ها یا داده‌های ارسالی به API اعتبارسنجی می‌شوند تا دادهٔ نامعتبر زود تشخیص داده شود.',
  },
};

const METHOD_EN: Record<string, string> = {
  GET: 'Fetches or lists data from',
  POST: 'Creates or submits data to',
  PUT: 'Fully replaces data at',
  PATCH: 'Partially updates data at',
  DELETE: 'Deletes data at',
  HEAD: 'Checks availability of',
  OPTIONS: 'Asks allowed operations for',
  UNKNOWN: 'Calls',
};

const METHOD_FA: Record<string, string> = {
  GET: 'داده را می‌گیرد یا فهرست می‌کند از',
  POST: 'داده می‌سازد یا ارسال می‌کند به',
  PUT: 'داده را کامل جایگزین می‌کند در',
  PATCH: 'داده را جزئی به‌روز می‌کند در',
  DELETE: 'داده را حذف می‌کند در',
  HEAD: 'در دسترس بودن را بررسی می‌کند برای',
  OPTIONS: 'عملیات مجاز را می‌پرسد برای',
  UNKNOWN: 'فراخوانی می‌کند',
};

function humanizePathSegment(seg: string): string {
  if (seg.startsWith(':')) return seg.slice(1);
  return seg
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function describeRouteEn(route: RouteInfo): string {
  const path = route.route === '/' ? '/' : route.route;
  if (path === '/') {
    return `**Home** — the starting page users land on (\`${path}\`)`;
  }
  const parts = path.split('/').filter(Boolean);
  const label = parts.map(humanizePathSegment).join(' / ');
  if (route.dynamic) {
    return `**${label}** — a detail page that needs an ID or name in the address (\`${path}\`)`;
  }
  return `**${label}** — a fixed page at \`${path}\``;
}

function describeRouteFa(route: RouteInfo): string {
  const path = route.route === '/' ? '/' : route.route;
  if (path === '/') {
    return `**صفحهٔ اصلی** — صفحه‌ای که کاربر معمولاً اول می‌بیند (\`${path}\`)`;
  }
  const parts = path.split('/').filter(Boolean);
  const label = parts.map(humanizePathSegment).join(' / ');
  if (route.dynamic) {
    return `**${label}** — صفحهٔ جزئیات که در آدرس به شناسه یا نام نیاز دارد (\`${path}\`)`;
  }
  return `**${label}** — یک صفحهٔ ثابت در آدرس \`${path}\``;
}

function describeEndpointEn(ep: ApiEndpoint): string {
  const verb = METHOD_EN[ep.method] ?? METHOD_EN.UNKNOWN!;
  return `${verb} \`${ep.path}\``;
}

function describeEndpointFa(ep: ApiEndpoint): string {
  const verb = METHOD_FA[ep.method] ?? METHOD_FA.UNKNOWN!;
  return `${verb} \`${ep.path}\``;
}

function describeDomainEn(t: DomainType): string {
  const fields = t.fields.length
    ? t.fields.slice(0, 8).join(', ') + (t.fields.length > 8 ? ', …' : '')
    : null;
  if (fields) {
    return `**${t.name}** — a kind of record in the app with pieces of information such as: ${fields}`;
  }
  return `**${t.name}** — a named data concept used in the app`;
}

function describeDomainFa(t: DomainType): string {
  const fields = t.fields.length
    ? t.fields.slice(0, 8).join(', ') + (t.fields.length > 8 ? ', …' : '')
    : null;
  if (fields) {
    return `**${t.name}** — یک نوع رکورد در اپ با اطلاعاتی مثل: ${fields}`;
  }
  return `**${t.name}** — یک مفهوم داده‌ای نام‌گذاری‌شده در اپ`;
}

function detectedCaps(caps: ProjectCapabilities): CapKey[] {
  const keys = Object.keys(CAP_COPY) as CapKey[];
  return keys.filter((k) => {
    const f = caps[k] as CapabilityFinding;
    return f.status === 'detected';
  });
}

function frameworkLabel(ctx: ProjectContext): string {
  const v = ctx.package.frameworkVersion;
  const name = ctx.framework === 'nuxt' ? 'Nuxt' : 'Vue';
  return v ? `${name} ${v}` : name;
}

function storeLabel(s: { storeName: string | null; file: string }): string {
  return s.storeName ?? s.file.split('/').pop() ?? s.file;
}

function buildEnglish(ctx: ProjectContext): string[] {
  const lines: string[] = [];
  const pkg = ctx.package;
  const focused = Boolean(ctx.focus);
  const fw = frameworkLabel(ctx);
  const caps = detectedCaps(ctx.capabilities);

  lines.push('# Project Overview', '');
  lines.push(
    'This document explains **what this project appears to be**, in plain language.',
    'It is generated automatically from the code. Only findings that were actually detected are listed — nothing is invented.',
    '',
  );

  if (focused) {
    lines.push(`_Currently focused on: \`${ctx.focus}\`_`, '');
  }

  lines.push('## What this project is', '');
  lines.push(
    `**${pkg.name}** is a **web front-end** application.`,
    '',
    `That means it is the part users see in the browser: pages, buttons, forms, and navigation.`,
    `It is built with **${fw}**.`,
    '',
  );
  if (pkg.notableLibraries.length) {
    lines.push(
      `It also relies on these notable libraries: **${pkg.notableLibraries.join(', ')}**.`,
      '',
    );
  }

  lines.push('## What it can do', '');
  lines.push(
    'Based on what shows up in the codebase, these capabilities are present:',
    '',
  );
  if (caps.length === 0) {
    lines.push('_No high-level capabilities were confidently detected._', '');
  } else {
    for (const key of caps) {
      const copy = CAP_COPY[key];
      const evidence = (ctx.capabilities[key] as CapabilityFinding).evidence;
      lines.push(`- **${copy.enTitle}**`);
      lines.push(`  ${copy.explainEn}`);
      if (evidence.length) {
        lines.push(`  _Evidence in code: ${evidence.join(', ')}_`);
      }
    }
    lines.push('');
  }

  lines.push('## Main screens and paths', '');
  lines.push(
    'Each item below is a screen (or address) a user can open in the browser.',
    '',
  );
  if (ctx.routes.length) {
    const routes = focused ? ctx.routes : ctx.routes.slice(0, 40);
    for (const r of routes) lines.push(`- ${describeRouteEn(r)}`);
    if (!focused && ctx.routes.length > 40) {
      lines.push(`- _… ${ctx.routes.length - 40} more screens omitted for brevity_`);
    }
    lines.push('');
  } else {
    lines.push(
      '_No page routes were detected in this scan. The app may be a single page, or routing was not found._',
      '',
    );
  }

  lines.push('## Main concepts (business ideas in the code)', '');
  lines.push(
    'These names are the main “things” the software talks about (for example Product, Cart, User).',
    'They help you understand the product language — not just the technical folders.',
    '',
  );
  if (ctx.domainTypes.length) {
    const types = focused ? ctx.domainTypes : ctx.domainTypes.slice(0, 25);
    for (const t of types) lines.push(`- ${describeDomainEn(t)}`);
    if (!focused && ctx.domainTypes.length > 25) {
      lines.push(`- _… ${ctx.domainTypes.length - 25} more concepts omitted_`);
    }
    lines.push('');
  } else {
    lines.push('_No clear domain data concepts were detected._', '');
  }

  lines.push('## How data moves (server / API calls)', '');
  lines.push(
    'When the UI needs information from elsewhere, it calls network endpoints.',
    'Below is a simplified list of those calls found in the project:',
    '',
  );
  if (ctx.apiSurface.length) {
    const eps = focused ? ctx.apiSurface : ctx.apiSurface.slice(0, 40);
    for (const ep of eps) lines.push(`- ${describeEndpointEn(ep)}`);
    if (!focused && ctx.apiSurface.length > 40) {
      lines.push(`- _… ${ctx.apiSurface.length - 40} more calls omitted_`);
    }
    lines.push('');
  } else {
    lines.push('_No API / network calls were confidently detected._', '');
  }

  if (ctx.stores.length) {
    lines.push('## Shared data areas', '');
    lines.push(
      'These are places where the app keeps information that several pages can share (for example a cart):',
      '',
    );
    for (const s of ctx.stores) {
      lines.push(`- **${storeLabel(s)}**`);
    }
    lines.push('');
  }

  lines.push(
    '## Note',
    '',
    'This overview is for understanding the product at a high level.',
    'For the full technical / AI context (file paths, props, architecture edges), run with `--mode context`.',
    '',
  );

  return lines;
}

function buildFarsi(ctx: ProjectContext): string[] {
  const lines: string[] = [];
  const pkg = ctx.package;
  const focused = Boolean(ctx.focus);
  const fw = frameworkLabel(ctx);
  const caps = detectedCaps(ctx.capabilities);

  lines.push('# نمای کلی پروژه', '');
  lines.push(
    'این سند به زبان ساده توضیح می‌دهد **این پروژه به نظر چه چیزی است**.',
    'متن به‌صورت خودکار از روی کد ساخته شده. فقط چیزهایی آمده که واقعاً پیدا شده‌اند — چیزی اختراع نشده.',
    '',
  );

  if (focused) {
    lines.push(`_تمرکز فعلی روی: \`${ctx.focus}\`_`, '');
  }

  lines.push('## این پروژه چیست', '');
  lines.push(
    `**${pkg.name}** یک اپلیکیشن **فرانت‌اند وب** است.`,
    '',
    'یعنی بخشی که کاربر در مرورگر می‌بیند: صفحات، دکمه‌ها، فرم‌ها و جابه‌جایی بین بخش‌ها.',
    `این پروژه با **${fw}** ساخته شده است.`,
    '',
  );
  if (pkg.notableLibraries.length) {
    lines.push(
      `همچنین به این کتابخانه‌های شاخص متکی است: **${pkg.notableLibraries.join(', ')}**.`,
      '',
    );
  }

  lines.push('## چه کارهایی می‌تواند بکند', '');
  lines.push(
    'بر اساس آنچه در کد دیده شده، این قابلیت‌ها وجود دارند:',
    '',
  );
  if (caps.length === 0) {
    lines.push('_قابلیت سطح‌بالایی با اطمینان پیدا نشد._', '');
  } else {
    for (const key of caps) {
      const copy = CAP_COPY[key];
      const evidence = (ctx.capabilities[key] as CapabilityFinding).evidence;
      lines.push(`- **${copy.faTitle}**`);
      lines.push(`  ${copy.explainFa}`);
      if (evidence.length) {
        lines.push(`  _مدرک در کد: ${evidence.join(', ')}_`);
      }
    }
    lines.push('');
  }

  lines.push('## صفحات و مسیرهای اصلی', '');
  lines.push(
    'هر مورد زیر یک صفحه (یا آدرس) است که کاربر می‌تواند در مرورگر باز کند.',
    '',
  );
  if (ctx.routes.length) {
    const routes = focused ? ctx.routes : ctx.routes.slice(0, 40);
    for (const r of routes) lines.push(`- ${describeRouteFa(r)}`);
    if (!focused && ctx.routes.length > 40) {
      lines.push(`- _… ${ctx.routes.length - 40} صفحهٔ دیگر برای کوتاهی حذف شده_`);
    }
    lines.push('');
  } else {
    lines.push(
      '_در این اسکن مسیری برای صفحات پیدا نشد. ممکن است اپ تک‌صفحه‌ای باشد، یا روتینگ پیدا نشده باشد._',
      '',
    );
  }

  lines.push('## مفاهیم اصلی (ایده‌های کسب‌وکار در کد)', '');
  lines.push(
    'این نام‌ها «چیزهایی» هستند که نرم‌افزار درباره‌شان حرف می‌زند (مثلاً Product، Cart، User).',
    'کمک می‌کنند زبان محصول را بفهمید — نه فقط پوشه‌های فنی.',
    '',
  );
  if (ctx.domainTypes.length) {
    const types = focused ? ctx.domainTypes : ctx.domainTypes.slice(0, 25);
    for (const t of types) lines.push(`- ${describeDomainFa(t)}`);
    if (!focused && ctx.domainTypes.length > 25) {
      lines.push(`- _… ${ctx.domainTypes.length - 25} مفهوم دیگر حذف شده_`);
    }
    lines.push('');
  } else {
    lines.push('_مفهوم داده‌ای واضحی از دامنه پیدا نشد._', '');
  }

  lines.push('## داده‌ها چگونه جابه‌جا می‌شوند (سرور / API)', '');
  lines.push(
    'وقتی رابط کاربری به اطلاعات از جای دیگر نیاز دارد، به endpointهای شبکه درخواست می‌زند.',
    'در ادامه فهرست ساده‌شدهٔ این فراخوانی‌ها آمده است:',
    '',
  );
  if (ctx.apiSurface.length) {
    const eps = focused ? ctx.apiSurface : ctx.apiSurface.slice(0, 40);
    for (const ep of eps) lines.push(`- ${describeEndpointFa(ep)}`);
    if (!focused && ctx.apiSurface.length > 40) {
      lines.push(`- _… ${ctx.apiSurface.length - 40} فراخوانی دیگر حذف شده_`);
    }
    lines.push('');
  } else {
    lines.push('_فراخوانی API / شبکه با اطمینان پیدا نشد._', '');
  }

  if (ctx.stores.length) {
    lines.push('## بخش‌های دادهٔ مشترک', '');
    lines.push(
      'این‌ها جاهایی هستند که اپ اطلاعات قابل‌اشتراک بین چند صفحه را نگه می‌دارد (مثلاً سبد خرید):',
      '',
    );
    for (const s of ctx.stores) {
      lines.push(`- **${storeLabel(s)}**`);
    }
    lines.push('');
  }

  lines.push(
    '## یادداشت',
    '',
    'این نمای کلی برای فهم سطح‌بالای محصول است.',
    'برای کانتکست کامل فنی / مناسب AI (مسیر فایل، props، روابط معماری) با `--mode context` اجرا کنید.',
    '',
  );

  return lines;
}

/**
 * Plain-language overview with fully separated English and Farsi documents.
 * Only reports detected signals — never invents product features.
 */
export function generateDocsMarkdown(ctx: ProjectContext): string {
  const parts = [
    ...buildEnglish(ctx),
    '---',
    '',
    ...buildFarsi(ctx),
  ];
  return redactSecrets(parts.join('\n'));
}
