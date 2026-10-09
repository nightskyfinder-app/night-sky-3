// Night Sky Finder plane relay: a tiny Cloudflare Worker.
// Free flight-data services don't accept requests straight from a web page, so the app asks this relay,
// and the relay asks the flight-data service and passes the answer back.
// Setup steps are in guide.html ("Turning on planes"). Paste this whole file into the Worker's code editor.

const ALLOWED = [
  "https://nightskyfinder-app.github.io", // your GitHub Pages sites (all versions)
  "http://localhost:8000"                 // only used when testing on a computer
];

// Tried in order; if one is down, the next is used. All return the same data format.
const SOURCES = [
  (lat, lon, nm) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${nm}`,
  (lat, lon, nm) => `https://api.airplanes.live/v2/point/${lat}/${lon}/${nm}`,
  (lat, lon, nm) => `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${nm}`
];

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED.includes(origin) ? origin : ALLOWED[0],
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Vary": "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    // expected path: /point/<latitude>/<longitude>/<radius in nautical miles>
    const m = new URL(request.url).pathname.match(/^\/point\/(-?\d{1,2}(?:\.\d+)?)\/(-?\d{1,3}(?:\.\d+)?)\/(\d{1,3})$/);
    if (!m) return new Response("Night Sky Finder plane relay is running.", { status: 200, headers: cors });

    // keep the area rough: one decimal place is a few miles
    const lat = Math.max(-90, Math.min(90, Number(m[1]))).toFixed(1);
    const lon = Math.max(-180, Math.min(180, Number(m[2]))).toFixed(1);
    const nm = Math.min(150, Number(m[3]));

    for (const source of SOURCES) {
      try {
        const r = await fetch(source(lat, lon, nm), {
          headers: { "User-Agent": "NightSkyFinder-relay/1 (personal stargazing app)", "Accept": "application/json" },
          cf: { cacheTtl: 5, cacheEverything: true }
        });
        if (!r.ok) continue;
        const body = await r.text();
        if (!body.startsWith("{")) continue;
        return new Response(body, { headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "max-age=5" } });
      } catch (e) { /* try the next source */ }
    }
    return new Response(JSON.stringify({ ac: [], error: "No flight-data source answered" }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
  }
};
