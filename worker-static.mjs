// Edge wrapper: answer prerendered pages (HTML, RSC navigation payloads and
// segment prefetches) straight from static assets, and send everything else
// (APIs, images, unknown routes, redirects) to the OpenNext worker.
import openNext from './.open-next/worker.js';
import manifest from './.open-next/static-pages.json';

export * from './.open-next/worker.js';

const PRIMARY_HOST = 'carbonized.app';
const VARY = 'rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch';

const respond = async (request, env, url, entry, assetPath, contentType) => {
  const asset = await env.ASSETS.fetch(new Request(new URL(assetPath, url).href));
  if (!asset.ok) {
    await asset.body?.cancel();
    return null;
  }
  const headers = new Headers(entry.headers);
  headers.set('content-type', contentType);
  headers.set('vary', VARY);
  headers.set('x-carbonized-static', '1');
  return new Response(request.method === 'HEAD' ? null : asset.body, { status: 200, headers });
};

const serveStatic = async (request, env, url) => {
  const entry = manifest[url.pathname];
  if (!entry) return null;
  const h = request.headers;
  const isRsc = h.get('rsc') === '1';
  if (!isRsc) {
    // Plain document request. Query strings (e.g. ?ref=) go through Next.
    if (url.search || !(h.get('accept') ?? '').includes('text/html')) return null;
    return respond(request, env, url, entry, `/__static/${entry.file}.html`, 'text/html; charset=utf-8');
  }
  if (h.get('next-router-prefetch') === '1') {
    const segment = h.get('next-router-segment-prefetch');
    if (!(segment && entry.segments)) return null;
    return respond(request, env, url, entry, `/__static/${entry.file}.segments${segment}.segment.rsc`, 'text/x-component');
  }
  if (!entry.rsc) return null;
  return respond(request, env, url, entry, `/__static/${entry.file}.rsc`, 'text/x-component');
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const url = new URL(request.url);
      if (url.hostname === PRIMARY_HOST) {
        const response = await serveStatic(request, env, url);
        if (response) return response;
      }
    }
    return openNext.fetch(request, env, ctx);
  },
};
