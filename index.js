const config = {
  host: 'portal.airtel4k.co',
  mac_address: '00:1A:79:00:2D:6A',
  serial_number: '7D051746180ABD8E70AA3C6E23ADBC8D',
  device_id: 'FC21220582688F2AA17265FAC3C00AD4C8467372CB70D79278F6CAD53AFDB7D7',
  device_id_2: 'FC21220582688F2AA17265FAC3C00AD4C8467372CB70D79278F6CAD53AFDB7D7',
  stb_type: 'MAG250',
  api_signature: '263',
};

const headers = {
  Cookie: `mac=${config.mac_address}`,
  "User-Agent": "Mozilla/5.0 MAG250",
  "Referer": `http://${config.host}/stalker_portal/c/`
};

// -------- SAFE FETCH --------
async function safeJSON(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// -------- FETCH CHANNELS --------
async function getChannels() {
  const url = `http://${config.host}/stalker_portal/server/load.php?type=itv&action=get_all_channels&JsHttpRequest=1-xml`;
  const res = await fetch(url, { headers });
  const data = await safeJSON(res);
  return data?.js?.data || [];
}

// -------- STREAM URL --------
async function getStream(id) {
  const url = `http://${config.host}/stalker_portal/server/load.php?type=itv&action=create_link&cmd=ffrt%20http://localhost/ch/${id}&JsHttpRequest=1-xml`;
  const res = await fetch(url, { headers });
  const data = await safeJSON(res);
  return data?.js?.cmd || '';
}

// -------- M3U BUILDER --------
function buildM3U(channels, origin) {
  let m3u = "#EXTM3U\n";

  for (const ch of channels) {
    const id = ch.cmd?.split('/').pop() || '';
    const name = ch.name || 'Unknown';

    m3u += `#EXTINF:-1,${name}\n`;
    m3u += `${origin}/${id}.m3u8\n`;
  }

  return m3u;
}

// -------- MAIN HANDLER --------
addEventListener("fetch", event => {
  event.respondWith(handle(event.request));
});

async function handle(req) {
  const url = new URL(req.url);

  // HEALTH CHECK
  if (url.pathname === "/") {
    return new Response("STATIC IPTV WORKER OK", {
      status: 200
    });
  }

  // PLAYLIST (STATIC)
  if (url.pathname === "/playlist.m3u") {

    const channels = await getChannels();

    const origin = url.origin;
    const m3u = buildM3U(channels, origin);

    return new Response(m3u, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl"
      }
    });
  }

  // STREAM HANDLER (NO REDIRECT)
  if (url.pathname.endsWith(".m3u8")) {

    const id = url.pathname.replace(".m3u8", "").slice(1);

    const stream = await getStream(id);

    if (!stream) {
      return new Response("Stream not found", { status: 404 });
    }

    // IMPORTANT: direct return (no redirect)
    return new Response(stream, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl"
      }
    });
  }

  return new Response("Not found", { status: 404 });
}
