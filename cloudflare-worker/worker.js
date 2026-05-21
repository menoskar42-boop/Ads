const UPSTREAM_HOST = 'oscardevs.com';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const originalHost = url.hostname;

    if (originalHost === UPSTREAM_HOST || originalHost === `www.${UPSTREAM_HOST}`) {
      return fetch(request);
    }

    const upstreamUrl = `https://${UPSTREAM_HOST}${url.pathname}${url.search}`;
    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-Host', originalHost);
    headers.set('X-Forwarded-Proto', 'https');
    headers.set('X-Tenant-Host', originalHost);
    headers.delete('host');

    const upstreamReq = new Request(upstreamUrl, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    });

    return fetch(upstreamReq);
  },
};
