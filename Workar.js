// ============================================
// Stalker-Portal To M3U Generator Script v3.0
// ============================================

const config = {
    host: 'portal.airtel4k.co',
    mac_address: '00:1A:79:00:2D:6A',
    serial_number: '7D051746180ABD8E70AA3C6E23ADBC8D',
    device_id: 'FC21220582688F2AA17265FAC3C00AD4C8467372CB70D79278F6CAD53AFDB7D7',
    device_id_2: 'FC21220582688F2AA17265FAC3C00AD4C8467372CB70D79278F6CAD53AFDB7D7',
    stb_type: 'MAG250',
    api_signature: '263',
};

// TOKEN CONFIG
const STATIC_KEY = typeof STATIC_KEY !== 'undefined' ? STATIC_KEY : 'join-key';
const TOKEN_REQUIRED = true;
const DYNAMIC_TOKEN_EXPIRY = 1800;

// ============ TOKEN MANAGER ============
class DynamicTokenManager {
    constructor() {
        this.tokens = new Map();
    }

    generateToken() {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let token = '';
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);

        for (let i = 0; i < 32; i++) {
            token += chars[array[i] % chars.length];
        }
        return token;
    }

    createToken() {
        const token = this.generateToken();
        const expiry = Date.now() + (DYNAMIC_TOKEN_EXPIRY * 1000);

        this.tokens.set(token, expiry);
        return token;
    }

    validateToken(token) {
        const exp = this.tokens.get(token);
        if (!exp) return false;
        if (Date.now() > exp) {
            this.tokens.delete(token);
            return false;
        }
        return true;
    }const tokenManager = new DynamicTokenManager();

// ============ CACHE ============
const cache = new Map();

const getCache = (k) => {
    const d = cache.get(k);
    if (!d || Date.now() > d.exp) return null;
    return d.val;
};

const setCache = (k, v, t) =>
    cache.set(k, { val: v, exp: Date.now() + t * 1000 });

// ============ HEADERS ============
const headers = () => ({
    Cookie: `mac=${config.mac_address}`,
    "User-Agent": "Mozilla/5.0 MAG250",
});

// ============ FETCH RETRY ============
async function fetchRetry(url, opt, r = 2) {
    try {
        return await fetch(url, opt);
    } catch (e) {
        if (r) return fetchRetry(url, opt, r - 1);
        throw e;
    }
}

// ============ API ============
async function getToken() {
    const url = `http://${config.host}/stalker_portal/server/load.php?type=stb&action=handshake&JsHttpRequest=1-xml`;
    const r = await fetchRetry(url, { headers: headers() });
    const j = await r.json();
    return j?.js?.token || '';
}

async function getGenres(t) {
    const url = `http://${config.host}/stalker_portal/server/load.php?type=itv&action=get_genres&JsHttpRequest=1-xml`;
    const r = await fetchRetry(url, { headers: headers() });
    const j = await r.json();
    return j?.js || [];
}

async function getChannels(t) {
    const url = `http://${config.host}/stalker_portal/server/load.php?type=itv&action=get_all_channels&JsHttpRequest=1-xml`;
    const r = await fetchRetry(url, { headers: headers() });
    const j = await r.json();
    return j?.js?.data || [];
}
}async function getStream(id) {
    const url = `http://${config.host}/stalker_portal/server/load.php?type=itv&action=create_link&cmd=ffrt%20http://localhost/ch/${id}&JsHttpRequest=1-xml`;
    const r = await fetchRetry(url, { headers: headers() });
    const j = await r.json();
    return j?.js?.cmd || '';
}

// ============ M3U ============
function buildM3U(channels, genres, origin, key, token) {
    const map = {};
    genres.forEach(g => map[g.id] = g.title);

    let out = "#EXTM3U\n";

    channels.forEach(c => {
        const id = c.cmd?.split('/').pop() || '';
        const name = c.name || 'Unknown';
        const group = map[c.tv_genre_id] || 'Other';

        out += `#EXTINF:-1 group-title="${group}",${name}\n`;
        out += `${origin}/${id}.m3u8?key=${key}&token=${token}\n`;
    });

    return out;
}

// ============ HANDLER ============
addEventListener('fetch', e => e.respondWith(handle(e.request)));

async function handle(req) {
    const url = new URL(req.url);

    const key = url.searchParams.get('key');
    const token = url.searchParams.get('token');

    // health
    if (url.pathname === '/') {
        return new Response('OK IPTV WORKER');
    }

    // generate token
    if (url.pathname === '/token') {
        return new Response(JSON.stringify({
            token: tokenManager.createToken()
        }));
    }

    // playlist
    if (url.pathname === '/playlist.m3u8') {

        if (TOKEN_REQUIRED) {
            if (key !== STATIC_KEY) return new Response('Invalid key', { status: 401 });
            if (!tokenManager.validateToken(token)) return new Response('Invalid token', { status: 401 });
        }
      const cacheKey = `pl_${token}`;
        const cached = getCache(cacheKey);
        if (cached) return new Response(cached);

        const origin = url.origin;

        const apiToken = await getToken();
        const genres = await getGenres(apiToken);
        const channels = await getChannels(apiToken);

        const m3u = buildM3U(channels, genres, origin, key, token);

        setCache(cacheKey, m3u, 300);

        return new Response(m3u, {
            headers: { "Content-Type": "application/vnd.apple.mpegurl" }
        });
    }

    // stream
    if (url.pathname.endsWith('.m3u8')) {

        const id = url.pathname.replace('.m3u8', '').slice(1);

        if (TOKEN_REQUIRED) {
            if (key !== STATIC_KEY || !tokenManager.validateToken(token))
                return new Response('Unauthorized', { status: 401 });
        }

        const cacheKey = `st_${id}`;
        const cached = getCache(cacheKey);
        if (cached) return Response.redirect(cached, 302);

        const apiToken = await getToken();
        const stream = await getStream(id, apiToken);

        if (!stream) return new Response('No stream', { status: 500 });

        setCache(cacheKey, stream, 300);

        return Response.redirect(stream, 302);
    }

    return new Response('Not found', { status: 404 });
}
