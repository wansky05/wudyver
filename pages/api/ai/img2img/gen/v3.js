import https from "https";
import axios from "axios";
import FormData from "form-data";
import crypto from "crypto";
const FIGURE_PROMPT = "Using the nano-banana model, a commercial 1/7 scale figurine of the character in the picture was created, depicting a realistic style and a realistic environment. The figurine is placed on a computer desk with a round transparent acrylic base. There is no text on the base. The computer screen shows the Zbrush modeling process of the figurine. Next to the computer screen is a BANDAI-style toy box with the original painting printed on it.";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const httpsAgent = new https.Agent({
  keepAlive: true
});
class ImageAIProcessor {
  constructor(opts = {}) {
    this.baseURL = "https://ai-apps.codergautam.dev";
    this.uploadURL = "https://wudysoft.xyz/api/tools/upload";
    this.api = axios.create({
      httpsAgent: httpsAgent
    });
    this.enableLogging = opts.log ?? true;
  }
  logActivity(msg) {
    if (this.enableLogging) console.log(`[ImageAIProcessor LOG] ${msg}`);
  }
  generateRandomName(len = 10) {
    const chars = "abcdefghijklmnopqrstuvwxyz";
    return Array.from({
      length: len
    }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  }
  async createTemporaryUser() {
    this.logActivity("Membuat pengguna sesi sementara...");
    const uid = crypto.randomBytes(12).toString("hex");
    const email = `temp-user-${Date.now()}@example.com`;
    const payload = {
      uid: uid,
      email: email,
      displayName: this.generateRandomName(),
      photoURL: "https://i.pravatar.cc/150",
      appId: "photogpt"
    };
    try {
      const res = await this.api.post(`${this.baseURL}/photogpt/create-user`, payload, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "okhttp/4.9.2"
        }
      });
      if (res.data.success) {
        this.logActivity(`Pengguna sementara berhasil dibuat dengan UID: ${uid}`);
        return uid;
      }
      throw new Error(`Respons pembuatan pengguna tidak berhasil: ${JSON.stringify(res.data)}`);
    } catch (err) {
      throw new Error(`Pembuatan pengguna gagal: ${err.response?.data?.message || err.message}`);
    }
  }
  async convertImageToBuffer(imgData) {
    this.logActivity("Memproses input gambar ke format Buffer...");
    if (Buffer.isBuffer(imgData)) {
      this.logActivity("Input sudah dalam format Buffer.");
      return imgData;
    }
    if (typeof imgData === "string" && imgData.startsWith("data:image/")) {
      this.logActivity("Input adalah Base64. Mengonversi ke Buffer...");
      const base64Data = imgData.split(";base64,").pop();
      return Buffer.from(base64Data, "base64");
    }
    if (typeof imgData === "string" && imgData.startsWith("http")) {
      this.logActivity(`Input adalah URL. Mengunduh gambar dari: ${imgData}`);
      try {
        const res = await this.api.get(imgData, {
          responseType: "arraybuffer"
        });
        return Buffer.from(res.data);
      } catch (err) {
        throw new Error(`Gagal mengunduh gambar dari URL: ${err.message}`);
      }
    }
    throw new Error("Format gambar tidak valid. Gunakan Buffer, URL, atau string Base64.");
  }
  async uploadImageAndGetURL(imageBuffer) {
    this.logActivity(`Mengunggah gambar hasil ke ${this.uploadURL}...`);
    const form = new FormData();
    form.append("file", imageBuffer, {
      filename: "result.jpg",
      contentType: "image/jpeg"
    });
    try {
      const res = await this.api.post(this.uploadURL, form, {
        headers: {
          ...form.getHeaders()
        }
      });
      if (res.data) {
        this.logActivity("Unggah berhasil!");
        return res.data;
      }
      throw new Error(`Respons unggah tidak valid: ${JSON.stringify(res.data)}`);
    } catch (err) {
      throw new Error(`Gagal mengunggah gambar hasil: ${err.response?.data?.message || err.message}`);
    }
  }
  async generateImageFromPrompt({
    imageUrl,
    prompt = FIGURE_PROMPT
  }) {
    if (!imageUrl || !prompt) {
      throw new Error("Parameter 'imageUrl' dan 'prompt' wajib diisi.");
    }
    const uid = await this.createTemporaryUser();
    const imageBuffer = await this.convertImageToBuffer(imageUrl);
    this.logActivity("Membuat FormData untuk pengiriman gambar...");
    const form = new FormData();
    form.append("image", imageBuffer, {
      filename: "input.jpg",
      contentType: "image/jpeg"
    });
    form.append("prompt", prompt);
    form.append("userId", uid);
    this.logActivity("Mengirim permintaan pembuatan gambar...");
    let pollingUrl;
    try {
      const uploadRes = await this.api.post(`${this.baseURL}/photogpt/generate-image`, form, {
        headers: {
          ...form.getHeaders(),
          Accept: "application/json",
          "User-Agent": "okhttp/4.9.2",
          "Accept-Encoding": "gzip"
        }
      });
      if (!uploadRes.data.success || !uploadRes.data.pollingUrl) throw new Error(JSON.stringify(uploadRes.data));
      pollingUrl = uploadRes.data.pollingUrl;
      this.logActivity(`Berhasil dikirim. URL Polling: ${pollingUrl}`);
    } catch (err) {
      throw new Error(`Gagal mengirim gambar: ${err.response?.data?.message || err.message}`);
    }
    this.logActivity("Memulai polling untuk hasil gambar...");
    let status = "pending",
      resultUrl = null;
    while (status !== "Ready") {
      try {
        const pollRes = await this.api.get(pollingUrl, {
          headers: {
            Accept: "application/json",
            "User-Agent": "okhttp/4.9.2"
          }
        });
        if (!pollRes.data) {
          this.logActivity("Respons polling kosong, mencoba lagi...");
          await sleep(3e3);
          continue;
        }
        status = pollRes.data.status;
        this.logActivity(`Status saat ini: ${status}`);
        if (status === "Ready") {
          resultUrl = pollRes.data.result.url;
          break;
        }
        await sleep(3e3);
      } catch (err) {
        throw new Error(`Gagal melakukan polling: ${err.message}`);
      }
    }
    if (!resultUrl) throw new Error("Gagal mendapatkan URL hasil gambar setelah polling.");
    this.logActivity(`Hasil gambar ditemukan. Mengunduh dari: ${resultUrl}`);
    let resultBuffer;
    try {
      const resultImg = await this.api.get(resultUrl, {
        responseType: "arraybuffer"
      });
      resultBuffer = Buffer.from(resultImg.data);
    } catch (err) {
      throw new Error(`Gagal mengunduh gambar hasil akhir: ${err.message}`);
    }
    return await this.uploadImageAndGetURL(resultBuffer);
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.imageUrl) {
    return res.status(400).json({
      error: "imageUrl are required"
    });
  }
  try {
    const processor = new ImageAIProcessor();
    const response = await processor.generateImageFromPrompt(params);
    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}