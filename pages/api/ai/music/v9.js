import axios from "axios";
import crypto from "crypto";
import {
  CookieJar
} from "tough-cookie";
import {
  wrapper
} from "axios-cookiejar-support";
class LyricsToSong {
  constructor() {
    this.baseUrl = "https://cuzi.ai/api/music";
    this.lyricsUrl = "https://cuzi.ai/api/free-tools";
    const jar = new CookieJar();
    this.axios = wrapper(axios.create({
      jar: jar,
      withCredentials: true
    }));
  }
  randIP() {
    return crypto.randomBytes(4).map(b => b % 256).join(".");
  }
  randID(len = 16) {
    return crypto.randomBytes(len).toString("hex");
  }
  bHeaders(extra = {}) {
    const ip = this.randIP();
    const reqId = this.randID(8);
    return {
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Content-Type": "application/json",
      pragma: "no-cache",
      "cache-control": "no-cache",
      "sec-ch-ua-platform": '"Android"',
      "sec-ch-ua": '"Chromium";v="137", "Not_A Brand";v="24", "Google Chrome";v="137"',
      "sec-ch-ua-mobile": "?1",
      "sec-fetch-site": "none",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      priority: "u=1, i",
      "X-Forwarded-For": ip,
      "X-Real-IP": ip,
      "X-Request-ID": reqId,
      Referer: "https://cuzi.ai/dashboard/ai-music/ai-music-generator",
      Origin: "https://cuzi.ai",
      ...extra
    };
  }
  async getRandomLyrics() {
    try {
      const res = await this.axios.post(`${this.lyricsUrl}/random-lyrics`, {}, {
        headers: this.bHeaders()
      });
      return res.data;
    } catch (err) {
      throw new Error(err.response?.data?.message || "Failed to fetch random lyrics");
    }
  }
  async create({
    style = "pop",
    prompt,
    title = "Untitled Song",
    customMode = true,
    instrumental = false,
    isPrivate = false,
    model = "v2"
  }) {
    if (!prompt) throw new Error("Prompt is required");
    const body = {
      style: style,
      prompt: prompt,
      title: title,
      customMode: customMode,
      instrumental: instrumental,
      isPrivate: isPrivate,
      action: "generate",
      model: model
    };
    try {
      const res = await this.axios.post(`${this.baseUrl}/generate`, body, {
        headers: this.bHeaders()
      });
      return res.data;
    } catch (err) {
      throw new Error(err.response?.data?.message || "Failed to generate song");
    }
  }
  async status({
    taskId
  }) {
    if (!taskId) throw new Error("taskId is required");
    try {
      const res = await this.axios.get(`${this.baseUrl}/musics-by-taskId/${taskId}`, {
        headers: this.bHeaders()
      });
      return res.data;
    } catch (err) {
      throw new Error(err.response?.data?.message || "Failed to get status");
    }
  }
  async detail({
    musicId
  }) {
    if (!musicId) throw new Error("musicId is required");
    try {
      const res = await this.axios.get(`${this.baseUrl}/music-detail/${musicId}`, {
        headers: this.bHeaders()
      });
      return res.data;
    } catch (err) {
      throw new Error(err.response?.data?.message || "Failed to get detail");
    }
  }
}
export default async function handler(req, res) {
  const {
    action,
    ...params
  } = req.method === "GET" ? req.query : req.body;
  const cuzi = new LyricsToSong();
  try {
    let result;
    switch (action) {
      case "lyrics":
        result = await cuzi.getRandomLyrics();
        break;
      case "create":
        result = await cuzi.create(params);
        break;
      case "status":
        result = await cuzi.status(params);
        break;
      case "detail":
        result = await cuzi.detail(params);
        break;
      default:
        return res.status(400).json({
          error: "Invalid action. Use ?action=lyrics|create|status|detail"
        });
    }
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}