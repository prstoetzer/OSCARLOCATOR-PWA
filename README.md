# OSCARLOCATOR — Reference Orbit PWA

An installable Progressive Web App that turns AMSAT GP orbital elements into a
table of first equatorial node crossings (time + longitude) per UTC day — the
reference orbits you plot on an OSCARLOCATOR board.

## Files

```
index.html              app shell + iOS meta tags
app.js                  precompiled application (no in-browser Babel)
manifest.webmanifest    PWA manifest
sw.js                   service worker (offline app shell)
vendor/                 React + ReactDOM (vendored, same-origin)
icons/                  app + Apple touch icons
```

The app has **no build step and no in-browser compiler** — the JSX is already
compiled into `app.js`. React is vendored locally so the whole app works offline.

## Hosting (required for full PWA + install on iPhone)

A service worker and "Add to Home Screen" need an **HTTPS origin**. Pick one:

- **GitHub Pages** — push these files to a repo, Settings → Pages → deploy from
  the branch root. Your URL is `https://<user>.github.io/<repo>/`.
- **Netlify Drop** — drag this folder onto https://app.netlify.com/drop.
- **Cloudflare Pages / Vercel** — point at the repo, no build command, output = root.

## Install on iPhone

1. Open the hosted **https://** URL in **Safari** (must be Safari for install).
2. Tap the **Share** button.
3. Tap **Add to Home Screen** → **Add**.
4. Launch from the new icon — it opens fullscreen, no Safari chrome, and works
   offline after the first load.

## Using it

- **Fetch AMSAT live** pulls the current `daily-bulletin.json` and gives you a
  satellite dropdown. If the AMSAT host doesn't send CORS headers, the browser
  will block it — use the paste box instead (copy one object from the JSON).
- Or key the eight fields in by hand.
- Set the UTC start date, number of days (default 60), and optionally include the
  descending node, then **Generate**. Copy or download the fixed-width table.

## Fetching live elements

The AMSAT server doesn't send CORS headers, so browsers can't read its bulletin
directly. The included Cloudflare Worker (`proxy/`) fixes this: it fetches the
bulletin server-side and re-serves it with the right header. See
`proxy/DEPLOY.md` for the ~3-minute setup, then paste your Worker URL into
`PROXY_URL` near the top of `app.js`.

"Fetch AMSAT live" tries, in order: your Worker proxy → a public CORS proxy →
a direct request. If all fail, use the paste box (copy one object from the JSON).

## Accuracy note

Propagation uses the mean elements with J2 secular nodal regression (RAAN, arg of
perigee, mean anomaly drift). This is appropriate for OSCARLOCATOR plotting, not
for precise antenna pointing. Verify the longitude sign/convention against a known
AO-7 orbit before trusting a full 60-day run.

73
