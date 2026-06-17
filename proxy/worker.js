/**
 * OSCARLOCATOR CORS proxy — Cloudflare Worker
 * --------------------------------------------------------------------------
 * Fetches the AMSAT daily GP-element bulletin server-side (where CORS does
 * not apply) and re-serves it with an Access-Control-Allow-Origin header so a
 * browser-based app can read it.
 *
 * The upstream URL is fixed, so this proxy can ONLY ever return the AMSAT
 * bulletin — it cannot be abused as an open proxy for arbitrary URLs.
 *
 * Deploy: see DEPLOY.md in this folder.
 */

const UPSTREAM = "https://newark192.amsat.org/gpdata/current/daily-bulletin.json";

// Lock the proxy to your own site(s) if you want. "*" allows any origin, which
// is fine for public read-only data like this. To restrict, replace "*" with
// e.g. "https://n8hm.github.io" (exact origin, no trailing slash / path).
const ALLOW_ORIGIN = "*";

// Edge cache lifetime in seconds. The AMSAT bulletin updates daily; caching for
// an hour keeps you well within that while being kind to their server.
const CACHE_SECONDS = 3600;

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    ...extra,
  };
}

export default {
  async fetch(request) {
    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: corsHeaders({ "Content-Type": "text/plain" }),
      });
    }

    try {
      const upstream = await fetch(UPSTREAM, {
        // Cache at Cloudflare's edge so repeated app loads don't hammer AMSAT.
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
        headers: { "Accept": "application/json" },
      });

      if (!upstream.ok) {
        return new Response(
          JSON.stringify({ error: "upstream", status: upstream.status }),
          { status: 502, headers: corsHeaders({ "Content-Type": "application/json" }) }
        );
      }

      // Stream the body through, attach CORS + cache headers.
      const body = await upstream.text();
      return new Response(body, {
        status: 200,
        headers: corsHeaders({
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
        }),
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "fetch_failed", message: String(err) }),
        { status: 502, headers: corsHeaders({ "Content-Type": "application/json" }) }
      );
    }
  },
};
