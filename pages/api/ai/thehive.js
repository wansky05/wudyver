import axios from "axios";
import {
  CookieJar,
  Cookie
} from "tough-cookie";
import {
  wrapper as axiosCookieJarSupport
} from "axios-cookiejar-support";
import apiConfig from "@/configs/apiConfig";
import SpoofHead from "@/lib/spoof-head";
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
      console.error("Gagal membuat paste di Wudysoft:", error.message);
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
      console.error(`Gagal mengambil paste dengan kunci ${key}:`, error.message);
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
      console.error("Gagal mengambil daftar paste:", error.message);
      return [];
    }
  }
  async createEmail() {
    try {
      const response = await this.client.get("/mails/v13", {
        params: {
          action: "create"
        }
      });
      return response.data?.data?.address;
    } catch (error) {
      console.error("Gagal membuat email di Wudysoft:", error.message);
      throw error;
    }
  }
  async checkMessages(email) {
    try {
      const response = await this.client.get("/mails/v13", {
        params: {
          action: "message",
          email: email
        }
      });
      const message = response.data?.data?.rows?.[0];
      if (message && message.html) {
        const match = message.html.match(/https:\/\/mandrillapp\.com\/track\/click\/[^"]+/);
        return match?.[0] || null;
      }
      return null;
    } catch (error) {
      console.error(`Gagal memeriksa pesan untuk ${email}:`, error.message);
      return null;
    }
  }
}
class HiveAI {
  constructor() {
    this.jar = new CookieJar();
    this.client = axios.create({
      jar: this.jar,
      withCredentials: true,
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
        accept: "application/json, text/plain, */*",
        "accept-language": "id-ID",
        origin: "https://portal.thehive.ai",
        referer: "https://portal.thehive.ai/",
        "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "x-forwarded-proto": "https",
        ...SpoofHead()
      }
    });
    axiosCookieJarSupport(this.client);
    this.wudysoftClient = new WudysoftAPI();
  }
  randomString(length) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
  async uploadSession(cookieString, orgId) {
    try {
      console.log("Mengunggah sesi (cookie dan orgId)...");
      const title = `hiveai-${this.randomString(10)}`;
      const content = JSON.stringify({
        cookie: cookieString,
        orgId: orgId
      });
      const key = await this.wudysoftClient.createPaste(title, content);
      if (key) {
        console.log(`Sesi berhasil diunggah dengan kunci: ${key}`);
        return key;
      }
      throw new Error("Gagal mendapatkan kunci dari respons unggahan.");
    } catch (error) {
      console.error("Gagal mengunggah sesi:", error.message);
      throw error;
    }
  }
  async getSession(key) {
    try {
      console.log(`Mengambil sesi untuk kunci: ${key}...`);
      const contentString = await this.wudysoftClient.getPaste(key);
      return contentString ? JSON.parse(contentString) : null;
    } catch (error) {
      console.error(`Gagal mengambil sesi untuk kunci ${key}:`, error.message);
      return null;
    }
  }
  async listKeys() {
    try {
      console.log("Mengambil daftar kunci...");
      const allPastes = await this.wudysoftClient.listPastes();
      const hiveKeys = allPastes.filter(paste => paste?.title?.startsWith("hiveai-")).map(paste => paste.key);
      console.log(`Ditemukan ${hiveKeys.length} kunci hiveai.`);
      return hiveKeys;
    } catch (error) {
      console.error("Gagal mengambil daftar kunci:", error.message);
      return [];
    }
  }
  async poll(fn, ms = 3e3) {
    const startTime = Date.now();
    const timeout = 6e4;
    while (Date.now() - startTime < timeout) {
      try {
        const result = await fn();
        if (result) return result;
      } catch (error) {
        console.error("Error selama polling:", error.message);
      }
      console.log("Mengecek ulang...");
      await new Promise(resolve => setTimeout(resolve, ms));
    }
    console.log("Batas waktu polling (1 menit) tercapai. Gagal mendapatkan hasil.");
    return null;
  }
  async rgstr(email) {
    try {
      console.log("Mendaftarkan akun...");
      const response = await this.client.post("https://portal-customer-api.thehive.ai/api/register", {
        name: `hiveai-${this.randomString(5)}`,
        email: email,
        company: "6",
        phone: "",
        terms_of_service: true,
        product_interests: [],
        how_did_you_find_us: ["billboard"],
        password: `@-${this.randomString(10)}`,
        source: "signup_from_models-black-forest-labs-flux-schnell-submit"
      });
      return response.data;
    } catch (error) {
      console.error("Gagal mendaftarkan akun:", error.message);
      throw error;
    }
  }
  async vrfy(link) {
    try {
      console.log("Memverifikasi email...");
      const response = await this.client.get(link);
      const token = new URL(response.request.res.responseUrl).searchParams.get("token");
      return token;
    } catch (error) {
      console.error("Gagal memverifikasi email:", error.message);
      throw error;
    }
  }
  async auth(token) {
    try {
      console.log("Mengautentikasi...");
      const authResponse = await this.client.get(`https://portal-customer-api.thehive.ai/api/authenticate?token=${token}`);
      const orgId = authResponse.data?.data?.default_organization?.organization_id;
      if (!orgId) throw new Error("Org ID tidak ditemukan setelah autentikasi.");
      console.log("Mendapatkan kode otorisasi...");
      const authCodeResponse = await this.client.get(`https://portal-customer-api.thehive.ai/oauth/authorize?client_id=09aa2314-c8b3-4eb3-b740-d3ed63ea7eee`);
      const authCode = authCodeResponse.data?.data?.code;
      if (!authCode) throw new Error("Authorization code tidak ditemukan.");
      console.log("Menukar kode otorisasi...");
      await this.client.post("https://ajax.thehive.ai/api/authentication/oauth_token", {
        authorization_code: authCode
      });
      return orgId;
    } catch (error) {
      console.error("Gagal dalam proses otorisasi:", error.message);
      throw error;
    }
  }
  async register() {
    try {
      this.jar = new CookieJar();
      this.client.defaults.jar = this.jar;
      const email = await this.wudysoftClient.createEmail();
      await this.rgstr(email);
      const verificationLink = await this.poll(() => this.wudysoftClient.checkMessages(email));
      if (!verificationLink) {
        throw new Error("Gagal mendapatkan link verifikasi setelah polling.");
      }
      const token = await this.vrfy(verificationLink);
      const orgId = await this.auth(token);
      if (!orgId) {
        throw new Error("Registrasi gagal: Tidak mendapatkan ID Organisasi.");
      }
      console.log("Registrasi dan autentikasi berhasil.");
      const cookieString = this.jar.getCookieStringSync("https://ajax.thehive.ai");
      const key = await this.uploadSession(cookieString, orgId);
      return {
        key: key,
        cookie: cookieString,
        orgId: orgId
      };
    } catch (error) {
      console.error("Terjadi kesalahan selama proses registrasi:", error.message);
      return null;
    }
  }
  async generate({
    key,
    prompt,
    model = "flux-schnell",
    ...rest
  }) {
    try {
      let sessionData = null;
      if (key) {
        console.log(`Menggunakan kunci yang ada: ${key}`);
        sessionData = await this.getSession(key);
      }
      if (!sessionData) {
        console.log(key ? `Kunci ${key} tidak valid.` : "Tidak ada kunci.", "Mendaftarkan sesi baru...");
        sessionData = await this.register();
        if (!sessionData) {
          throw new Error("Otentikasi gagal: Tidak dapat mendaftarkan sesi baru.");
        }
      }
      const {
        cookie: cookieContent,
        orgId
      } = sessionData;
      this.jar = new CookieJar();
      this.client.defaults.jar = this.jar;
      for (const cookie of cookieContent.split("; ")) {
        this.jar.setCookieSync(Cookie.parse(cookie), "https://ajax.thehive.ai");
      }
      const models = {
        "vision-language": "chat/completions",
        sdxl: "stabilityai/sdxl",
        "sdxl-enhanced": "hive/sdxl-enhanced",
        "flux-schnell-emoji": "hive/flux-schnell-emoji",
        "flux-schnell-enhanced": "hive/flux-schnell-enhanced",
        "flux-schnell": "black-forest-labs/flux-schnell"
      };
      const endpoint = models[model] || models["flux-schnell"];
      console.log(`Membuat gambar dengan model: ${model}...`);
      const response = await this.client.post(`https://ajax.thehive.ai/api/v3/${endpoint}`, {
        input: {
          prompt: prompt,
          ...rest
        },
        org_id: orgId
      });
      return response.data;
    } catch (error) {
      console.error("Terjadi kesalahan pada proses generate:", error.message);
      if (error.response) {
        console.error("Detail Error:", error.response.data);
      }
      return null;
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
  const api = new HiveAI();
  try {
    let response;
    switch (action) {
      case "register":
        response = await api.register();
        return res.status(200).json(response);
      case "generate":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Prompt is required for generate."
          });
        }
        response = await api.generate(params);
        return res.status(200).json(response);
      case "keys":
        response = await api.listKeys();
        return res.status(200).json(response);
      default:
        return res.status(400).json({
          error: `Invalid action: ${action}. Supported actions are 'register', 'generate', and 'keys'.`
        });
    }
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}