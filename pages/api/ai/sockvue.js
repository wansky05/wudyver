import axios from "axios";
import crypto from "crypto";
import {
  CookieJar,
  Cookie
} from "tough-cookie";
import {
  wrapper
} from "axios-cookiejar-support";
import apiConfig from "@/configs/apiConfig";
const wudysoftApiClient = axios.create({
  baseURL: `https://${apiConfig.DOMAIN_URL}/api`
});
class WudysoftAPI {
  constructor() {
    this.client = wudysoftApiClient;
  }
  async createPaste(title, content) {
    try {
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "create",
          title: title,
          content: content
        }
      });
      return response.data?.key || null;
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.createPaste': ${error.message}`);
      throw error;
    }
  }
  async getPaste(key) {
    try {
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "get",
          key: key
        }
      });
      return response.data?.content || null;
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.getPaste' untuk kunci ${key}: ${error.message}`);
      return null;
    }
  }
  async listPastes() {
    try {
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "list"
        }
      });
      return response.data || [];
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.listPastes': ${error.message}`);
      return [];
    }
  }
  async delPaste(key) {
    try {
      await this.client.get("/tools/paste/v1", {
        params: {
          action: "delete",
          key: key
        }
      });
      return true;
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.delPaste' untuk kunci ${key}: ${error.message}`);
      return false;
    }
  }
  async createEmail() {
    try {
      const response = await this.client.get("/mails/v9", {
        params: {
          action: "create"
        }
      });
      return response.data?.email;
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.createEmail': ${error.message}`);
      throw error;
    }
  }
  async checkMessages(email) {
    try {
      const response = await this.client.get("/mails/v9", {
        params: {
          action: "message",
          email: email
        }
      });
      const link = response.data?.data?.[0]?.text_content?.match(/https:\/\/xwlraklganiikvvqujuk\.supabase\.co\/auth\/v1\/verify\?[^\]]+/);
      return link?.[0] || null;
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.checkMessages' untuk email ${email}: ${error.message}`);
      return null;
    }
  }
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
class Shockvue {
  constructor() {
    this.jar = new CookieJar();
    this.api = wrapper(axios.create({
      baseURL: "https://xwlraklganiikvvqujuk.supabase.co",
      headers: {
        apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3bHJha2xnYW5paWt2dnF1anVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEwMjg5OTEsImV4cCI6MjA2NjYwNDk5MX0.oU-LDjrYklc6zuG2UlYGk3V1Tzv2tGuacMhJIC_Sobw",
        origin: "https://www.shockvueapp.com",
        referer: "https://www.shockvueapp.com/",
        "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36"
      },
      jar: this.jar,
      maxRedirects: 10,
      validateStatus: status => status >= 200 && status < 400
    }));
    this.token = null;
    this.pkce = {};
    this.wudysoft = new WudysoftAPI();
  }
  random() {
    return Math.random().toString(36).substring(2);
  }
  genChallenge() {
    console.log("Membuat tantangan PKCE...");
    const verifier = crypto.randomBytes(64).toString("hex");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    this.pkce = {
      verifier: verifier,
      challenge: challenge
    };
  }
  async toB64(image) {
    console.log("Mengonversi gambar ke base64...");
    try {
      if (Buffer.isBuffer(image)) {
        return `data:image/jpeg;base64,${image.toString("base64")}`;
      }
      if (typeof image === "string" && image.startsWith("http")) {
        const response = await axios.get(image, {
          responseType: "arraybuffer"
        });
        const buffer = Buffer.from(response.data, "binary");
        const contentType = response.headers["content-type"] || "image/jpeg";
        return `data:${contentType};base64,${buffer.toString("base64")}`;
      }
      return image;
    } catch (error) {
      console.error("Gagal mengonversi gambar:", error.message);
      throw error;
    }
  }
  async _performLogin() {
    console.log("Memulai proses otentikasi baru...");
    try {
      const email = await this.wudysoft.createEmail();
      if (!email) throw new Error("Gagal mendapatkan email.");
      console.log(`Email didapat: ${email}`);
      const password = this.random() + "@A1";
      const fullName = this.random();
      this.genChallenge();
      await this.api.post("/auth/v1/signup?redirect_to=https%3A%2F%2Fwww.shockvueapp.com%2F", {
        email: email,
        password: password,
        data: {
          full_name: fullName
        },
        code_challenge: this.pkce.challenge,
        code_challenge_method: "s256"
      });
      let verifyLink;
      for (let i = 0; i < 60; i++) {
        console.log(`Polling email (${i + 1}/60)...`);
        const link = await this.wudysoft.checkMessages(email);
        if (link) {
          verifyLink = link;
          break;
        }
        await sleep(3e3);
      }
      if (!verifyLink) throw new Error("Gagal menemukan tautan verifikasi.");
      const verifyResponse = await this.api.get(verifyLink).catch(e => e.response);
      const finalUrl = verifyResponse.request.res.responseUrl;
      if (!finalUrl) throw new Error("Tidak dapat menemukan URL final setelah redirect.");
      const url = new URL(finalUrl);
      const authCode = url.searchParams.get("code");
      if (!authCode) throw new Error("Gagal mendapatkan kode otentikasi dari URL redirect.");
      const tokenResponse = await this.api.post("/auth/v1/token?grant_type=pkce", {
        auth_code: authCode,
        code_verifier: this.pkce.verifier
      });
      this.token = tokenResponse.data?.access_token;
      if (!this.token) throw new Error("Gagal mendapatkan access token.");
      this.api.defaults.headers.common["authorization"] = `Bearer ${this.token}`;
      console.log("Login berhasil, cookie dan token telah disetel.");
    } catch (error) {
      console.error("Login gagal:", error.response?.data || error.message);
      throw error;
    }
  }
  async register() {
    try {
      console.log("Memulai proses registrasi sesi baru...");
      await this._performLogin();
      const allCookies = await this.jar.getCookies("https://xwlraklganiikvvqujuk.supabase.co", {
        allPaths: true
      });
      const sessionToSave = JSON.stringify({
        token: this.token,
        cookies: allCookies.map(cookie => cookie.toJSON())
      });
      const sessionTitle = `shockvue-${this.random()}`;
      const newKey = await this.wudysoft.createPaste(sessionTitle, sessionToSave);
      if (!newKey) throw new Error("Gagal menyimpan sesi baru ke Wudysoft.");
      console.log(`Sesi baru berhasil didaftarkan. Kunci Anda: ${newKey}`);
      return {
        key: newKey
      };
    } catch (error) {
      console.error("Proses registrasi gagal:", error.message);
      throw error;
    }
  }
  async list_key() {
    try {
      console.log("Mengambil daftar semua kunci sesi...");
      const allPastes = await this.wudysoft.listPastes();
      const filteredKeys = allPastes.filter(paste => paste.title && paste.title.startsWith("shockvue-")).map(paste => paste.key);
      console.log(`Ditemukan ${filteredKeys.length} kunci yang cocok.`);
      return filteredKeys;
    } catch (error) {
      console.error("Gagal mengambil daftar kunci:", error.message);
      throw error;
    }
  }
  async del_key({
    key
  }) {
    if (!key) {
      console.error("Kunci tidak disediakan untuk dihapus.");
      return false;
    }
    try {
      console.log(`Mencoba menghapus kunci: ${key}`);
      const success = await this.wudysoft.delPaste(key);
      if (success) {
        console.log(`Kunci ${key} berhasil dihapus.`);
        return true;
      } else {
        console.error(`Gagal menghapus kunci ${key}.`);
        return false;
      }
    } catch (error) {
      console.error(`Terjadi error saat menghapus kunci ${key}:`, error.message);
      throw error;
    }
  }
  async _loadSession(key) {
    console.log(`Mencoba memuat sesi dengan kunci: ${key}`);
    const savedSession = await this.wudysoft.getPaste(key);
    if (!savedSession) {
      throw new Error(`Sesi dengan kunci "${key}" tidak ditemukan.`);
    }
    try {
      const sessionData = JSON.parse(savedSession);
      this.token = sessionData.token;
      if (sessionData.cookies && Array.isArray(sessionData.cookies)) {
        this.jar = new CookieJar();
        for (const cookieData of sessionData.cookies) {
          const cookie = Cookie.fromJSON(JSON.stringify(cookieData));
          if (cookie) {
            await this.jar.setCookie(cookie, `https://${cookie.domain}`);
          }
        }
        this.api.defaults.jar = this.jar;
      } else {
        throw new Error("Format cookie dalam sesi tidak valid.");
      }
      this.api.defaults.headers.common["authorization"] = `Bearer ${this.token}`;
      if (!this.token) throw new Error("Token tidak valid di sesi yang tersimpan.");
      console.log("Sesi berhasil dimuat.");
    } catch (e) {
      throw new Error(`Gagal memuat sesi dari kunci "${key}": ${e.message}`);
    }
  }
  async generate({
    key,
    mode,
    prompt,
    imageUrl,
    ...rest
  }) {
    try {
      let sessionKey = key;
      if (!sessionKey) {
        console.log("Kunci tidak disediakan, mendaftarkan sesi baru...");
        sessionKey = (await this.register())?.key;
        console.log(`-> PENTING: Simpan kunci ini untuk penggunaan selanjutnya: ${sessionKey}`);
      } else {
        await this._loadSession(sessionKey);
      }
      console.log(`Memulai aksi: ${mode}`);
      const endpointMap = {
        seedream: "seedream-4-generation",
        "nano-banana": "nano-banana-edit",
        "image-edit": "image-edit",
        "qwen-edit": "qwen-image-edit"
      };
      const endpoint = endpointMap[mode] || "image-edit";
      if (!endpoint) {
        const availableModes = Object.keys(endpointMap).join(", ");
        throw new Error(`Aksi tidak valid. Mode yang tersedia adalah: ${availableModes}`);
      }
      console.log(`Endpoint yang digunakan: ${endpoint}`);
      let payload = {
        prompt: prompt,
        ...rest
      };
      const imageKey = mode === "qwen-edit" ? "image" : mode === "image-edit" ? "input_image" : "image_input";
      if (imageUrl) {
        const base64Image = await this.toB64(imageUrl);
        payload[imageKey] = mode === "seedream" || mode === "nano-banana-edit" ? [base64Image] : base64Image;
      }
      const initialResponse = await this.api.post(`/functions/v1/${endpoint}`, payload);
      const predictionId = initialResponse.data?.predictions?.[0]?.id;
      if (!predictionId) throw new Error("Gagal mendapatkan ID prediksi.");
      console.log(`Prediksi dibuat dengan ID: ${predictionId}`);
      for (let i = 0; i < 60; i++) {
        console.log(`Mengecek status prediksi (${i + 1}/60)...`);
        const statusResponse = await this.api.post(`/functions/v1/${endpoint}`, {
          prediction_id: predictionId
        });
        const status = statusResponse.data?.status;
        if (status === "succeeded") {
          console.log("Prediksi berhasil!");
          const output = statusResponse.data;
          return output;
        } else if (status === "failed" || status === "canceled") {
          throw new Error(`Prediksi gagal: ${statusResponse.data?.error || "Status " + status}`);
        }
        await sleep(3e3);
      }
      throw new Error("Waktu tunggu prediksi habis.");
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message;
      console.error(`Proses generate gagal: ${errorMessage}`);
      throw new Error(errorMessage.startsWith("API Error:") ? errorMessage : `Error: ${errorMessage}`);
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
      error: "Parameter 'action' wajib diisi."
    });
  }
  const api = new Shockvue();
  try {
    let response;
    switch (action) {
      case "register":
        response = await api.register();
        break;
      case "generate":
        if (!params.prompt) return res.status(400).json({
          error: "Parameter 'prompt' wajib diisi untuk action 'generate'."
        });
        response = await api.generate(params);
        break;
      case "list_key":
        response = await api.list_key();
        break;
      case "del_key":
        if (!params.key) return res.status(400).json({
          error: "Parameter 'key' wajib diisi untuk action 'del_key'."
        });
        response = await api.del_key(params);
        break;
      default:
        return res.status(400).json({
          error: `Action tidak valid: ${action}. Action yang didukung adalah 'register', 'generate', 'list_key, and 'del_key'.`
        });
    }
    if (response === null) {
      return res.status(500).json({
        error: `Proses untuk action '${action}' gagal. Periksa log server untuk detail.`
      });
    }
    console.log(`Handler - Merespons untuk action '${action}':`, JSON.stringify(response, null, 2));
    return res.status(200).json(response);
  } catch (error) {
    console.error(`[FATAL ERROR] Kegagalan tidak terduga di handler untuk action '${action}':`, error);
    return res.status(500).json({
      error: error.message || "Terjadi kesalahan internal pada server."
    });
  }
}