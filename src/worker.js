/**
 * CDN Worker — serves static assets from R2 with CF edge caching.
 *
 * Routes:
 *   cdn.hanzo.ai/*                → R2 pub/hanzo/*
 *   cdn.lux.network/*            → R2 pub/lux/*
 *   cdn.zoo.ngo/*                → R2 pub/zoo/*
 *   cdn.pars.network/*           → R2 pub/pars/*
 *   cdn.main./*      → R2 pub/liquidity-main/*
 *   cdn.test./*      → R2 pub/liquidity-test/*
 *   cdn.dev./*       → R2 pub/liquidity-dev/*
 */

const DOMAIN_PREFIX = {
  'cdn.hanzo.ai': 'hanzo',
  'cdn.lux.network': 'lux',
  'cdn.zoo.ngo': 'zoo',
  'cdn.pars.network': 'pars',
  'cdn.main.': 'liquidity-main',
  'cdn.test.': 'liquidity-test',
  'cdn.dev.': 'liquidity-dev',
};

const MIME_TYPES = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
};

function getMimeType(path) {
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hostname = url.hostname;
    const prefix = DOMAIN_PREFIX[hostname];

    if (!prefix) {
      return new Response('Not found', { status: 404 });
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Only allow GET/HEAD
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Build R2 object key: prefix/path
    let path = url.pathname.replace(/^\/+/, '');
    if (!path) path = 'index.html';
    const key = `${prefix}/${path}`;

    // Try to get object from R2
    const object = await env.CDN_BUCKET.get(key);

    if (!object) {
      return new Response('Not found', {
        status: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=60',
        },
      });
    }

    const contentType = getMimeType(path);

    // Determine cache duration based on content type
    const isImmutable = path.includes('.') && !path.endsWith('.html') && !path.endsWith('.json');
    const cacheControl = isImmutable
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600, s-maxage=86400';

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', cacheControl);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('X-Content-Type-Options', 'nosniff');

    // Set ETag from R2 metadata
    if (object.httpEtag) {
      headers.set('ETag', object.httpEtag);
    }

    // Check conditional request
    const ifNoneMatch = request.headers.get('If-None-Match');
    if (ifNoneMatch && object.httpEtag && ifNoneMatch === object.httpEtag) {
      return new Response(null, { status: 304, headers });
    }

    if (request.method === 'HEAD') {
      headers.set('Content-Length', object.size);
      return new Response(null, { status: 200, headers });
    }

    return new Response(object.body, { status: 200, headers });
  },
};
