import axios from "axios";
import CryptoJS from "crypto-js";
import {
  v4 as uuidv4
} from "uuid";
class ApiClient {
  constructor() {
    this.api = axios.create({
      baseURL: "https://api.chatgai.fun",
      headers: {
        "User-Agent": "Dart/3.6 (dart:io)",
        "Content-Type": "application/json"
      }
    });
    this.config = {
      bundle: "com.aichatmaster.chat.gp",
      version: "2.6.6",
      aiVersion: "GPT_DUPLICATE:v3.5-copy",
      deviceMac: uuidv4()
    };
    this.secrets = {
      key: "t6KeG6aKR5pm65oWn5aqS6LWE57O757ufS2V2aW4uWWFuZw",
      aesKey: CryptoJS.enc.Utf8.parse("Ka7Ya98107EdGXQa"),
      aesIv: CryptoJS.enc.Utf8.parse("yc0q2icx1oq4lijm")
    };
  }
  _nonce(length = 32) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
  }
  _sign(params) {
    const excluded = new Set(["language", "type", "voice", "needVoice", "imageUrls", "botPrompt", "userId", "needSearch", "tonePrompt"]);
    const queryString = Object.keys(params).filter(k => !excluded.has(k)).sort().map(k => `${k}=${params[k]}`).join("&");
    return CryptoJS.SHA1(queryString + this.secrets.key).toString(CryptoJS.enc.Hex);
  }
  _encrypt(text) {
    const encrypted = CryptoJS.AES.encrypt(text, this.secrets.aesKey, {
      iv: this.secrets.aesIv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    return encrypted.ciphertext.toString(CryptoJS.enc.Hex);
  }
  async send({
    prompt,
    userId,
    ...rest
  }) {
    try {
      console.log("[LOG] Membangun payload...");
      const payload = {
        question: prompt,
        ...this.config,
        userId: userId || "",
        timestamp: Math.floor(Date.now() / 1e3),
        nonce: this._nonce(),
        ...rest
      };
      payload.signature = this._sign(payload);
      const body = {
        bundle: this.config.bundle,
        security: this._encrypt(JSON.stringify(payload))
      };
      console.log("[LOG] Mengirim permintaan ke /common/sse/chat...");
      const response = await this.api.post("/common/sse/chat", body, {
        responseType: "text"
      });
      console.log("[LOG] Respons diterima, memproses data...");
      const messages = response.data.split("\n\n").filter(Boolean);
      const finalResult = messages.reduce((acc, msg) => {
        if (msg.startsWith("data:")) {
          const dataStr = msg.substring(5).trim();
          if (dataStr === "[DONE]") return acc;
          try {
            const json = JSON.parse(dataStr);
            acc.chunks.push(json);
            acc.result += json.data?.answer || "";
            if (json.data?.conversation_id && !acc.conversation_id) {
              acc.conversation_id = json.data.conversation_id;
            }
          } catch (e) {
            console.warn("[WARN] Gagal mem-parsing chunk JSON:", dataStr);
          }
        }
        return acc;
      }, {
        result: "",
        conversation_id: "",
        chunks: []
      });
      console.log("[LOG] Pemrosesan selesai.");
      return finalResult;
    } catch (error) {
      console.error("[ERROR] Terjadi kesalahan saat mengirim permintaan:", error.response ? error.response.data : error.message);
      throw error;
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.prompt) {
    return res.status(400).json({
      error: "Prompt are required"
    });
  }
  try {
    const client = new ApiClient();
    const response = await client.send(params);
    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}