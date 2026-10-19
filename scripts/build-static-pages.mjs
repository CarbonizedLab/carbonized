// Post-build: copy prerendered HTML / RSC / segment files into Workers static
// assets and write a manifest the edge wrapper uses to answer them without
// starting the 23 MB Next server (which was exhausting the Worker CPU budget).
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const APP = '.next/server/app';
const OUT = '.open-next/assets/__static';
const prerender = JSON.parse(readFileSync('.next/prerender-manifest.json', 'utf8'));
const routesManifest = JSON.parse(readFileSync('.next/routes-manifest.json', 'utf8'));

const matches = (source, path) => {
  if (source === '/') return path === '/';
  if (source === '/:path*') return true;
  if (source === '/app/:path*') return path === '/app' || path.startsWith('/app/');
  throw new Error(`Unhandled header source ${source}`);
};

const headersFor = (path) => {
  const out = {};
  for (const rule of routesManifest.headers) {
    if (matches(rule.source, path)) {
      for (const { key, value } of rule.headers) out[key.toLowerCase()] = value;
    }
  }
  out['cache-control'] ??= 'public, max-age=0, must-revalidate';
  return out;
};

const manifest = {};
let copied = 0;
for (const route of Object.keys(prerender.routes)) {
  if (route.startsWith('/_')) continue;
  const base = route === '/' ? 'index' : route.slice(1);
  const html = join(APP, `${base}.html`);
  if (!existsSync(html)) continue;
  const entry = { file: base, headers: headersFor(route), rsc: existsSync(join(APP, `${base}.rsc`)), segments: [] };
  for (const ext of ['html', 'rsc']) {
    const src = join(APP, `${base}.${ext}`);
    if (existsSync(src)) {
      const dest = join(OUT, `${base}.${ext}`);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(src, dest);
      copied++;
    }
  }
  const segDir = join(APP, `${base}.segments`);
  if (existsSync(segDir)) {
    cpSync(segDir, join(OUT, `${base}.segments`), { recursive: true });
    entry.segments = true;
  }
  manifest[route] = entry;
}
writeFileSync('.open-next/static-pages.json', JSON.stringify(manifest));
console.log(`static pages: ${Object.keys(manifest).length}, files copied: ${copied}`);
