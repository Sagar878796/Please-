export default {
  async fetch(request) {

    const config = {
      host: 'http://portal.airtel4k.co',
      mac: '00:1A:79:00:2D:6A',
      serial: '7D051746180ABD8E70AA3C6E23ADBC8D',
      device1: 'FC21220582688F2AA17265FAC3C00AD4C8467372CB70D79278F6CAD53AFDB7D7',
      device2: 'FC21220582688F2AA17265FAC3C00AD4C8467372CB70D79278F6CAD53AFDB7D7'
    };

    // 🔁 Retry helper
    async function fetchWithRetry(url, options, retries = 3) {
      for (let i = 0; i < retries; i++) {
        try {
          const res = await fetch(url, options);
          if (res.ok) return res;
        } catch (e) {}
        await new Promise(r => setTimeout(r, 1000));
      }
      throw new Error("Request failed after retries");
    }

    try {

      // =========================
      // 1. HANDSHAKE
      // =========================
      const handshake = await fetchWithRetry(
        `${config.host}/portal.php?type=stb&action=handshake&JsHttpRequest=1-xml`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C)",
            "Cookie": `mac=${config.mac}; stb_lang=en; timezone=Asia/Kolkata`,
            "X-User-Agent": "Model: MAG250; Link: Ethernet",
            "Connection": "Keep-Alive"
          }
        }
      );

      const hsData = await handshake.json();
      const token = hsData?.js?.token;

      if (!token) {
        return new Response("❌ Handshake failed", { status: 500 });
      }

      // =========================
      // 2. PROFILE (IMPORTANT)
      // =========================
      await fetchWithRetry(
        `${config.host}/portal.php?type=stb&action=get_profile&JsHttpRequest=1-xml`,
        {
          headers: {
            "Authorization": `Bearer ${token}`,
            "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C)",
            "Cookie": `mac=${config.mac}; serial_number=${config.serial}; device_id=${config.device1}; device_id2=${config.device2}`,
            "X-User-Agent": "Model: MAG250; Link: Ethernet"
          }
        }
      );

      // =========================
      // 3. CHANNELS
      // =========================
      const channelsRes = await fetchWithRetry(
        `${config.host}/portal.php?type=itv&action=get_all_channels&JsHttpRequest=1-xml`,
        {
          headers: {
            "Authorization": `Bearer ${token}`,
            "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C)",
            "Cookie": `mac=${config.mac}`,
            "X-User-Agent": "Model: MAG250; Link: Ethernet"
          }
        }
      );

      const data = await channelsRes.json();
      const channels = data?.js?.data || [];

      if (channels.length === 0) {
        return new Response("❌ No channels (MAC blocked / portal restricted)", { status: 500 });
      }

      // =========================
      // 4. BUILD M3U
      // =========================
      let m3u = "#EXTM3U\n";

      for (let ch of channels) {
        let name = ch.name || "No Name";
        let cmd = ch.cmd;

        if (!cmd) continue;

        let stream = cmd.replace("ffmpeg ", "").trim();

        // 🔥 Anti-freeze tweak
        if (!stream.includes("User-Agent")) {
          stream += "|User-Agent=VLC/3.0.18 LibVLC/3.0.18";
        }

        m3u += `#EXTINF:-1,${name}\n`;
        m3u += `${stream}\n`;
      }

      // =========================
      // 5. RESPONSE
      // =========================
      return new Response(m3u, {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-store"
        }
      });

    } catch (err) {
      return new Response("❌ Error: " + err.message, { status: 500 });
    }
  }
};
