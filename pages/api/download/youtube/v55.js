import axios from "axios";
import * as cheerio from "cheerio";
import WebSocket from "ws";
class YoutubeDownloader {
  constructor() {
    this.baseUrl = "https://ssyoutube.online";
    this.ajaxUrl = `${this.baseUrl}/wp-admin/admin-ajax.php`;
    this.headers = {
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
      "accept-language": "id-ID,id;q=0.9",
      origin: this.baseUrl,
      referer: `${this.baseUrl}/`
    };
  }
  getVideoId(url) {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|(?:embed|v)\/))([^?\s&"'>]+)/);
    return match ? match[1] : null;
  }
  async getFastytServer() {
    try {
      console.log("[INFO] Mengambil fastytcdn server...");
      const {
        data
      } = await axios.get("https://balancer.fastytcdn.com/get-server", {
        headers: this.headers
      });
      console.log("[INFO] Server fastytcdn:", data);
      return data;
    } catch (err) {
      console.error("[ERROR] Gagal ambil server:", err.message);
      throw err;
    }
  }
  waitForWs(wsUrl) {
    console.log("[WS] Menghubungkan ke WebSocket:", wsUrl);
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          ...this.headers,
          Connection: "Upgrade",
          Upgrade: "websocket"
        }
      });
      ws.on("message", data => {
        try {
          const json = JSON.parse(data.toString());
          if (json.status === "done") {
            console.log("[WS] Proses selesai");
            ws.close();
            resolve(json.output);
          } else if (json.error) {
            ws.close();
            reject(json.error);
          } else {
            console.log(`[WS] Progress: ${json.formatted_progress_in_percent}%`);
          }
        } catch (err) {
          ws.close();
          reject(err);
        }
      });
      ws.on("error", err => {
        console.error("[WS] Error:", err.message);
        reject(err);
      });
    });
  }
  async download({
    url,
    quality = "360p",
    convert = true
  }) {
    try {
      console.log("[START] Proses download:", url);
      const videoId = this.getVideoId(url);
      if (!videoId) throw new Error("URL tidak valid.");
      const data = `videoURL=${encodeURIComponent(url)}`;
      const response = await axios.post(`${this.baseUrl}/yt-video-detail/`, data, {
        headers: {
          ...this.headers,
          "content-type": "application/x-www-form-urlencoded"
        }
      });
      const $ = cheerio.load(response.data);
      const title = $(".videoTitle").text().trim();
      const thumbnail = $(".videoThumbnail img").attr("src");
      const duration = $(".duration label").text().replace("Duration:", "").trim();
      const availableQualities = [];
      $("table.list tbody tr").each((_, el) => {
        const q = $(el).find("td:nth-child(1)").text().replace(/\s+/g, " ").trim().toLowerCase();
        const size = $(el).find("td:nth-child(2)").text().trim();
        const btn = $(el).find(".downloadButton button");
        const dlUrl = btn.attr("data-url");
        const hasAudio = btn.attr("data-has-audio") === "true";
        if (dlUrl) {
          const cleanQ = q.includes("m4a") ? "m4a" : q.match(/\d+p/)?.[0] || q;
          availableQualities.push({
            quality: cleanQ,
            size: size,
            url: dlUrl,
            hasAudio: hasAudio
          });
        }
      });
      console.log("[INFO] Available Qualities:");
      availableQualities.forEach(q => console.log(`- ${q.quality} (${q.size}) ${q.hasAudio ? "✅ Audio" : "❌ No Audio"}`));
      let selectedQuality = availableQualities.find(q => q.quality === quality.toLowerCase());
      if (!selectedQuality) {
        if (quality.includes("p")) {
          const target = parseInt(quality);
          selectedQuality = availableQualities.filter(q => q.quality.match(/\d+p/)).sort((a, b) => parseInt(a.quality) - parseInt(b.quality)).find(q => parseInt(q.quality) >= target);
        } else if (quality === "m4a") {
          selectedQuality = availableQualities.find(q => q.quality === "m4a");
        }
      }
      if (!selectedQuality) selectedQuality = availableQualities.find(q => q.quality === "360p") || availableQualities[0];
      console.log("[INFO] Selected Quality:", selectedQuality);
      if (!convert || selectedQuality.hasAudio) {
        console.log("[DONE] Menggunakan link langsung (no convert)");
        return {
          title: title,
          thumbnail: thumbnail,
          duration: duration,
          converted: false,
          download: selectedQuality.url,
          availableQualities: availableQualities,
          selectedQuality: selectedQuality,
          requestData: null
        };
      }
      console.log("[INFO] Memulai konversi audio...");
      const nonce = response.data.match(/"nonce":"([a-zA-Z0-9]+)"/)?.[1] || "8e9ee78c75";
      const audio = availableQualities.find(q => q.quality === "m4a");
      const id = `${videoId}_${selectedQuality.quality}`;
      const requestData = {
        id: id,
        ttl: 36e5,
        inputs: [{
          url: selectedQuality.url,
          ext: "mp4",
          chunkDownload: {
            type: "header",
            size: 52428800,
            concurrency: 3
          }
        }, ...audio ? [{
          url: audio.url,
          ext: "m4a"
        }] : []],
        output: {
          ext: "mp4",
          downloadName: `SSYouTube.online_${title}_${selectedQuality.quality}.mp4`,
          chunkUpload: {
            size: 209715200,
            concurrency: 3
          }
        },
        operation: {
          type: "replace_audio_in_video"
        }
      };
      console.log("[INFO] Mengirim request_data ke server...");
      await axios.post(this.ajaxUrl, new URLSearchParams({
        action: "process_video_merge",
        nonce: nonce,
        request_data: JSON.stringify(requestData)
      }), {
        headers: {
          ...this.headers,
          "content-type": "application/x-www-form-urlencoded"
        }
      });
      const server = await this.getFastytServer();
      const output = await this.waitForWs(`wss://${server}/pub/render/status_ws/${id}`);
      console.log("[SUCCESS] Video siap didownload:", output.url);
      return {
        title: title,
        thumbnail: thumbnail,
        duration: duration,
        converted: true,
        download: output.url,
        expire: output.expireDate,
        availableQualities: availableQualities,
        selectedQuality: selectedQuality,
        requestData: requestData
      };
    } catch (err) {
      console.error("[ERROR]", err.message);
      throw err;
    }
  }
}
export default async function handler(req, res) {
  try {
    const params = req.method === "GET" ? req.query : req.body;
    if (!params.url) {
      return res.status(400).json({
        error: "No URL"
      });
    }
    res.setHeader("Accept-Encoding", "gzip, deflate, br, zstd");
    const yt = new YoutubeDownloader();
    const result = await yt.download(params);
    return res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
}