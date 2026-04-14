const config = {
  host: 'portal.airtel4k.co',
  mac_address: '00:1A:79:00:2D:6A',
  serial_number: '7D051746180ABD8E70AA3C6E23ADBC8D',
  device_id: 'FC21220582688F2AA17265FAC3C00AD4C8467372CB70D79278F6CAD53AFDB7D7',
  device_id_2: 'FC21220582688F2AA17265FAC3C00AD4C8467372CB70D79278F6CAD53AFDB7D7',
  stb_type: 'MAG250',
  api_signature: '263',
};

const STATIC_KEY = 'join-key';
const TOKEN_REQUIRED = true;
const TOKEN_TTL = 1800;

// ---------------- MEMORY CACHE ----------------
const cache = new Map();
const tokens = new Map();

// ---------------- SAFE CACHE ----------------
const getCache = (k) => {
  const d = cache.get(k);
  if (!d || Date.now() > d.exp) return null;
  return d.val;
};

const setCache = (k, v, t) => {
  cache.set(k, { val: v, exp: Date.now() + t * 1000 });
};

// ---------------- TOKEN ----------------
const createToken = () => {
  const t = crypto.randomUUID().replace(/-/g, '');
  tokens.set(t, Date.now() + TOKEN_TTL * 1000);
  return t;
};

const validateToken = (t) => tokens.get(t) > Date.now();

// ---------------- HEADERS ----------------
const headers = () => ({
  Cookie: `mac=${config.mac_address}`,
  "User-Agent": "Mozilla/5.0 MAG250",
  "Referer": `http://${config.host}/stalker_portal/c/`,
});

// ---------------- TIMEOUT FETCH ----------------
async function fetchWithTimeout(url, options = {}, timeout = 8000, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(id);
      return res;
    } catch (e) {
      clearTimeout(id);
      if (i === retries) throw e;
    }
  }// ---------------- SAFE PARSER ----------------
async function safeJSON(res) {
  try {
    const text = await res.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------------- API CALLS ----------------
async function getToken() {
  const url = `http://${config.host}/stalker_portal/server/load.php?type=stb&action=handshake&JsHttpRequest=1-xml`;
  const r = await fetchWithTimeout(url, { headers: headers() });
  const j = await safeJSON(r);
  return j?.js?.token || '';
}

async function getGenres() {
  const url = `http://${config.host}/stalker_portal/server/load.php?type=itv&action=get_genres&JsHttpRequest=1-xml`;
  const r = await fetchWithTimeout(url, { headers: headers() });
  const j = await safeJSON(r);
  return j?.js || [];
}

async function getChannels() {
  const url = `http://${config.host}/stalker_portal/server/load.php?type=itv&action=get_all_channels&JsHttpRequest=1-xml`;
  const r = await fetchWithTimeout(url, { headers: headers() });
  const j = await safeJSON(r);
  return j?.js?.data || [];
}

async function getStream(id) {
  const url = `http://${config.host}/stalker_portal/server/load.php?type=itv&action=create_link&cmd=ffrt%20http://localhost/ch/${id}&JsHttpRequest=1-xml`;
  const r = await fetchWithTimeout(url, { headers: headers() });
  const j = await safeJSON(r);
  return j?.js?.cmd || '';
}

// ---------------- M3U BUILDER ----------------
function buildM3U(channels, origin, key, token) {
  let out = "#EXTM3U\n";

  for (const c of channels) {
    const id = c.cmd?.split('/').pop() || '';
    const name = c.name || 'Unknown';

    out += `#EXTINF:-1,${name}\n`;
    out += `${origin}/${id}.m3u8?key=${key}&token=${token}\n`;
  }

  return out;
}
}// ---------------- HANDLER ----------------
addEventListener('fetch', (e) => e.respondWith(handle(e.request)));

async function handle(req) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  const token = url.searchParams.get('token');

  // HEALTH
  if (url.pathname === '/') {
    return new Response('IPTV WORKER OK', { status: 200 });
  }

  // TOKEN
  if (url.pathname === '/token') {
    return new Response(JSON.stringify({ token: createToken() }));
  }

  // PLAYLIST
  if (url.pathname === '/playlist.m3u8') {
    if (TOKEN_REQUIRED) {
      if (key !== STATIC_KEY) return new Response('Invalid key', { status: 401 });
      if (!validateToken(token)) return new Response('Invalid token', { status: 401 });
    }

    const cacheKey = `pl_${token}`;
    const cached = getCache(cacheKey);
    if (cached) return new Response(cached);

    const origin = url.origin;

    const channels = await getChannels();
    const m3u = buildM3U(channels, origin, key, token);

    setCache(cacheKey, m3u, 300);

    return new Response(m3u, {
      headers: { "Content-Type": "application/vnd.apple.mpegurl" }
    });
  }

  // STREAM
  if (url.pathname.endsWith('.m3u8')) {
    const id = url.pathname.replace('.m3u8', '').slice(1);

    if (TOKEN_REQUIRED) {
      if (key !== STATIC_KEY || !validateToken(token))
        return new Response('Unauthorized', { status: 401 });
    }

    const cacheKey = `st_${id}`;
    const cached = getCache(cacheKey);
    if (cached) return Response.redirect(cached, 302);

    const stream = await getStream(id);
    if (!stream) return new Response('Stream not found', { status: 500 });

    setCache(cacheKey, stream, 300);

    return Response.redirect(stream, 302);
  }

  return new Response('Not found', { status: 404 });
                        }
