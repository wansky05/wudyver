import axios from "axios";
import CryptoJS from "crypto-js";
import {
  Blob,
  FormData
} from "formdata-node";
import apiConfig from "@/configs/apiConfig";
class MakeFilm {
  constructor() {
    this.baseURL = "https://makefilm.ai/api";
    this.encKey = CryptoJS.enc.Utf8.parse(apiConfig.PASSWORD.padEnd(32, "x"));
    this.encIV = CryptoJS.enc.Utf8.parse(apiConfig.PASSWORD.padEnd(16, "x"));
    this.userAgents = ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/109.0.1518.78", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36", "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1", "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36"];
  }
  generateRandomIp() {
    return Array.from({
      length: 4
    }, () => Math.floor(Math.random() * 256)).join(".");
  }
  getRandomUserAgent() {
    const randomIndex = Math.floor(Math.random() * this.userAgents.length);
    return this.userAgents[randomIndex];
  }
  getDynamicHeaders(isFormData = false) {
    const dynamicHeaders = {
      accept: "application/json, text/plain, */*",
      origin: "https://makefilm.ai",
      referer: "https://makefilm.ai/features/video-generator",
      "accept-language": "id-ID,id;q=0.9",
      "user-agent": this.getRandomUserAgent(),
      "x-forwarded-for": this.generateRandomIp(),
      "x-real-ip": this.generateRandomIp(),
      via: `1.1 ${this.generateRandomIp()}`
    };
    if (!isFormData) {
      dynamicHeaders["content-type"] = "application/json";
    }
    return dynamicHeaders;
  }
  enc(data) {
    const textToEncrypt = JSON.stringify(data);
    const encrypted = CryptoJS.AES.encrypt(textToEncrypt, this.encKey, {
      iv: this.encIV,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    return encrypted.ciphertext.toString(CryptoJS.enc.Hex);
  }
  dec(encryptedHex) {
    const ciphertext = CryptoJS.enc.Hex.parse(encryptedHex);
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: ciphertext
    });
    const decrypted = CryptoJS.AES.decrypt(cipherParams, this.encKey, {
      iv: this.encIV,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    const json = decrypted.toString(CryptoJS.enc.Utf8);
    if (!json) throw new Error("Dekripsi mengembalikan data kosong / invalid");
    return JSON.parse(json);
  }
  async img2vid({
    imageUrl,
    prompt,
    width = 768,
    height = 768,
    model = "v3",
    isFast = false,
    isHighQuality = false,
    is10s = false,
    isCameraFixed = false,
    enhancePrompt = true
  }) {
    try {
      if (!imageUrl || !prompt) throw new Error("imageUrl dan prompt wajib diisi");
      const form = new FormData();
      const imgRes = await axios.get(imageUrl, {
        responseType: "arraybuffer"
      });
      const mime = imgRes.headers["content-type"] || "image/png";
      const ext = mime.split("/")[1] || "png";
      const imageBlob = new Blob([imgRes.data], {
        type: mime
      });
      form.append("image", imageBlob, `image.${ext}`);
      form.append("width", width);
      form.append("height", height);
      form.append("prompt", prompt);
      form.append("model", model);
      form.append("isFast", isFast);
      form.append("isHighQuality", isHighQuality);
      form.append("is10s", is10s);
      form.append("isCameraFixed", isCameraFixed);
      form.append("enhancePrompt", enhancePrompt);
      const requestHeaders = {
        ...this.getDynamicHeaders(true),
        ...form.headers
      };
      const {
        data
      } = await axios.post(`${this.baseURL}/process-video-generation`, form, {
        headers: requestHeaders
      });
      if (data?.content?.mid) {
        return {
          task_id: this.enc({
            mid: data.content.mid
          }),
          ...data
        };
      }
      return data;
    } catch (err) {
      console.error("Error in img2vid:", err.message);
      return {
        error: err.message
      };
    }
  }
  async txt2vid({
    prompt,
    width = 768,
    height = 768,
    model = "v3",
    isFast = false,
    isHighQuality = false,
    is10s = false,
    isCameraFixed = false,
    enhancePrompt = true
  }) {
    try {
      if (!prompt) throw new Error("prompt wajib diisi");
      const form = new FormData();
      form.append("prompt", prompt);
      form.append("width", width);
      form.append("height", height);
      form.append("model", model);
      form.append("isFast", isFast);
      form.append("isHighQuality", isHighQuality);
      form.append("is10s", is10s);
      form.append("isCameraFixed", isCameraFixed);
      form.append("enhancePrompt", enhancePrompt);
      const requestHeaders = {
        ...this.getDynamicHeaders(true),
        ...form.headers
      };
      const {
        data
      } = await axios.post(`${this.baseURL}/process-video-generation`, form, {
        headers: requestHeaders
      });
      if (data?.content?.mid) {
        return {
          task_id: this.enc({
            mid: data.content.mid
          }),
          ...data
        };
      }
      return data;
    } catch (err) {
      console.error("Error in txt2vid:", err.message);
      return {
        error: err.message
      };
    }
  }
  async status({
    task_id
  }) {
    try {
      if (!task_id) throw new Error("task_id wajib diisi");
      const {
        mid
      } = this.dec(task_id);
      const requestHeaders = this.getDynamicHeaders(false);
      const {
        data
      } = await axios.post(`${this.baseURL}/get-processed-video-generation`, {
        mid: mid
      }, {
        headers: requestHeaders
      });
      return data;
    } catch (err) {
      console.error("Error in status:", err.message);
      return {
        error: err.message
      };
    }
  }
}
export default async function handler(req, res) {
  const {
    action,
    ...params
  } = req.method === "GET" ? req.query : req.body;
  if (!action) {
    return res.status(400).json({
      error: "Action is required."
    });
  }
  const ai = new MakeFilm();
  try {
    switch (action) {
      case "txt2vid": {
        if (!params.prompt) {
          return res.status(400).json({
            error: "Prompt is required for 'txt2vid'."
          });
        }
        const result = await ai.txt2vid(params);
        return res.status(200).json(result);
      }
      case "img2vid": {
        if (!params.prompt || !params.imageUrl) {
          return res.status(400).json({
            error: !params.prompt ? "Prompt is required for 'img2vid'." : "imageUrl is required for 'img2vid'."
          });
        }
        const result = await ai.img2vid(params);
        return res.status(200).json(result);
      }
      case "status": {
        if (!params.task_id) {
          return res.status(400).json({
            error: "task_id is required for 'status'."
          });
        }
        const result = await ai.status(params);
        return res.status(200).json(result);
      }
      default:
        return res.status(400).json({
          error: "Invalid action. Supported actions: 'status', 'txt2vid', 'img2vid'."
        });
    }
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}