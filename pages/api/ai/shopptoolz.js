import axios from "axios";
import {
  v4 as uuidv4
} from "uuid";
import SpoofHead from "@/lib/spoof-head";
const FIREBASE_API_KEY = "AIzaSyD_dgBfd2tvlKNLe_di57VeTPdgGLfiRu0";
const FAL_API_KEY = "8b4b3fbc-0faf-4d1a-a47f-69ae9d50b3d4:742b677edb772b0357d5766084dcd30d";
class Api {
  constructor(email, password) {
    console.log("Inisialisasi instance Api...");
    this.email = email || `${uuidv4()}@mail.com`;
    this.password = password || "Shopptoolz123";
    this.token = null;
    this.user = null;
    this.axios = axios.create({
      headers: {
        accept: "*/*",
        "accept-language": "id-ID",
        "content-type": "application/json",
        origin: "https://www.shopptoolz.com",
        priority: "u=1, i",
        referer: "https://www.shopptoolz.com/",
        "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "user-agent": "Mozilla.5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
        ...SpoofHead()
      }
    });
  }
  async ensureAuth() {
    console.log("Memeriksa status autentikasi...");
    if (this.token && this.user) {
      console.log("Pengguna sudah diautentikasi.");
      return;
    }
    try {
      console.log("Token tidak ada, mencoba mendaftar...");
      const signUpResponse = await this.axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`, {
        returnSecureToken: true,
        email: this.email,
        password: this.password,
        clientType: "CLIENT_TYPE_WEB"
      });
      this.token = signUpResponse?.data?.idToken;
      console.log("Pendaftaran berhasil, token diterima.");
      console.log("Memverifikasi token dan mengambil data pengguna...");
      const lookupResponse = await this.axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
        idToken: this.token
      });
      this.user = lookupResponse?.data?.users?.[0];
      if (!this.user) throw new Error("Gagal mendapatkan informasi pengguna.");
      this.axios.defaults.headers.common["Authorization"] = `Bearer ${this.token}`;
      console.log("Autentikasi berhasil untuk:", this.user.email);
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      console.error("Gagal memastikan autentikasi:", errorMessage);
      throw new Error(`Authentication failed: ${errorMessage}`);
    }
  }
  async presign(imageUrl) {
    console.log(`Memulai proses presign...`);
    try {
      await this.ensureAuth();
      let buffer, contentType;
      if (typeof imageUrl === "string" && imageUrl.startsWith("http")) {
        console.log("Mengunduh gambar dari URL...");
        const response = await axios.get(imageUrl, {
          responseType: "arraybuffer"
        });
        buffer = Buffer.from(response.data);
        contentType = response.headers["content-type"] || "image/jpeg";
      } else if (typeof imageUrl === "string") {
        console.log("Mengonversi Base64 ke buffer...");
        buffer = Buffer.from(imageUrl, "base64");
        contentType = "image/jpeg";
      } else if (Buffer.isBuffer(imageUrl)) {
        console.log("Input sudah dalam bentuk buffer.");
        buffer = imageUrl;
        contentType = "image/jpeg";
      } else {
        throw new Error("Format imageUrl tidak didukung.");
      }
      console.log(`Tipe konten terdeteksi: ${contentType}`);
      const initiateResponse = await this.axios.post("https://rest.alpha.fal.ai/storage/upload/initiate", {
        content_type: contentType,
        file_name: `image-${uuidv4()}.jpg`
      }, {
        headers: {
          Authorization: `Key ${FAL_API_KEY}`
        }
      });
      const {
        upload_url,
        file_url
      } = initiateResponse.data;
      console.log("Upload URL diterima, mengunggah gambar...");
      await axios.put(upload_url, buffer, {
        headers: {
          "Content-Type": contentType
        }
      });
      console.log("Gambar berhasil diunggah ke:", file_url);
      return file_url;
    } catch (error) {
      console.error("Gagal melakukan presign:", error.response?.data || error.message);
      throw error;
    }
  }
  async _pollForResult(initialResponse) {
    let result = initialResponse;
    console.log(`Memulai polling untuk request ID: ${result.request_id}`);
    while (result?.status !== "COMPLETED") {
      const status = result?.status || "UNKNOWN";
      console.log(`Status saat ini: ${status}, posisi antrian: ${result?.queue_position ?? "N/A"}. Menunggu 2 detik...`);
      if (status === "ERROR" || status === "CANCELLED") {
        throw new Error(`Proses gagal dengan status: ${status}. Logs: ${JSON.stringify(result.logs)}`);
      }
      await new Promise(resolve => setTimeout(resolve, 3e3));
      const statusUrl = result.status_url.endsWith("?logs=1") ? result.status_url : `${result.status_url}?logs=1`;
      const statusResponse = await this.axios.get(statusUrl, {
        headers: {
          Authorization: `Key ${FAL_API_KEY}`
        }
      });
      result = statusResponse.data;
    }
    console.log("Proses selesai! Mengambil hasil akhir...");
    const finalResponse = await this.axios.get(result.response_url, {
      headers: {
        Authorization: `Key ${FAL_API_KEY}`
      }
    });
    console.log("Respon data akhir diterima.");
    return finalResponse.data;
  }
  async txt2img({
    prompt,
    ...rest
  }) {
    console.log("Memulai proses Text-to-Image...");
    try {
      await this.ensureAuth();
      const payload = {
        prompt: prompt,
        image_size: rest.image_size || "landscape_4_3",
        strength: rest.strength ?? .85,
        num_inference_steps: rest.num_inference_steps || 20,
        guidance_scale: rest.guidance_scale ?? 2.5,
        num_images: rest.num_images || 1,
        enable_safety_checker: rest.enable_safety_checker !== undefined ? rest.enable_safety_checker : true
      };
      const initialResponse = await this.axios.post("https://queue.fal.run/fal-ai/flux/dev", payload, {
        headers: {
          Authorization: `Key ${FAL_API_KEY}`
        }
      });
      return this._pollForResult(initialResponse.data);
    } catch (error) {
      console.error("Gagal pada txt2img:", error.response?.data || error.message);
      throw error;
    }
  }
  async img2img({
    prompt,
    imageUrl,
    ...rest
  }) {
    console.log("Memulai proses Image-to-Image...");
    try {
      const presignedUrl = await this.presign(imageUrl);
      const payload = {
        image_url: presignedUrl,
        prompt: prompt,
        strength: rest.strength ?? .85,
        image_size: rest.image_size || "landscape_4_3",
        num_inference_steps: rest.num_inference_steps || 20,
        guidance_scale: rest.guidance_scale ?? 2.5,
        num_images: rest.num_images || 1
      };
      const initialResponse = await this.axios.post("https://queue.fal.run/fal-ai/flux/dev/image-to-image", payload, {
        headers: {
          Authorization: `Key ${FAL_API_KEY}`
        }
      });
      return this._pollForResult(initialResponse.data);
    } catch (error) {
      console.error("Gagal pada img2img:", error.response?.data || error.message);
      throw error;
    }
  }
  async img2text({
    imageUrl,
    ...rest
  }) {
    console.log("Memulai proses Image-to-Text...");
    try {
      const presignedUrl = await this.presign(imageUrl);
      const payload = {
        model: rest.model || "google/gemini-flash-1.5",
        prompt: rest.prompt || "Jelaskan gambar ini sedetail mungkin.",
        image_url: presignedUrl,
        ...rest.system_prompt && {
          system_prompt: rest.system_prompt
        }
      };
      const initialResponse = await this.axios.post("https://queue.fal.run/fal-ai/any-llm/vision", payload, {
        headers: {
          Authorization: `Key ${FAL_API_KEY}`
        }
      });
      return this._pollForResult(initialResponse.data);
    } catch (error) {
      console.error("Gagal pada img2text:", error.response?.data || error.message);
      throw error;
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
  const api = new Api();
  try {
    let response;
    switch (action) {
      case "img2img":
        if (!params.prompt || !params.imageUrl) {
          return res.status(400).json({
            error: "Prompt and imageUrl are required for img2img."
          });
        }
        response = await api.img2img(params);
        return res.status(200).json(response);
      case "txt2img":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Prompt is required for txt2img."
          });
        }
        response = await api.txt2img(params);
        return res.status(200).json(response);
      case "img2text":
        if (!params.imageUrl) {
          return res.status(400).json({
            error: "imageUrl are required for img2text."
          });
        }
        response = await api.img2text(params);
        return res.status(200).json(response);
      default:
        return res.status(400).json({
          error: `Invalid action: ${action}. Supported actions are 'img2text', 'img2img', and 'txt2img'.`
        });
    }
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}