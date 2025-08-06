import axios from "axios";
import apiConfig from "@/configs/apiConfig";
import CryptoJS from "crypto-js";
class VivagoAPI {
  constructor() {
    this.baseURL = "https://vivago.ai";
    this.prodAPI = `${this.baseURL}/prod-api`;
    this.emailService = `https://${apiConfig.DOMAIN_URL}/api/mails/v9`;
    this.encKey = CryptoJS.enc.Utf8.parse(apiConfig.PASSWORD.padEnd(32, "x"));
    this.encIV = CryptoJS.enc.Utf8.parse(apiConfig.PASSWORD.padEnd(16, "x"));
    this.headers = {
      accept: "application/json, text/plain, */*",
      "accept-language": "id-ID,id;q=0.9",
      "content-type": "application/json;charset=UTF-8",
      origin: this.baseURL,
      referer: `${this.baseURL}/video-generation?activeTab=text-to-video`,
      "sec-ch-ua": '"Lemur";v="135", "", "", "Microsoft Edge Simulate";v="135"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
      "x-accept-language": "en",
      "x-client-platform": "web",
      priority: "u=1, i"
    };
    this.ticket = null;
    this.refreshToken = null;
    this.userId = null;
    this.username = null;
    this.deviceId = this.generateUUID();
    this.email = null;
    this.cookies = {};
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
    if (!json) {
      throw new Error("Dekripsi mengembalikan data kosong atau tidak valid.");
    }
    return JSON.parse(json);
  }
  generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : r & 3 | 8;
      return v.toString(16);
    });
  }
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  _updateCookies(setCookieHeaders) {
    if (setCookieHeaders) {
      setCookieHeaders.forEach(cookieString => {
        const [cookiePair] = cookieString.split(";");
        const [name, value] = cookiePair.split("=");
        this.cookies[name.trim()] = value.trim();
      });
    }
  }
  _getCookies() {
    let cookieString = `region=1; device_id=${this.deviceId}`;
    for (const key in this.cookies) {
      cookieString += `; ${key}=${this.cookies[key]}`;
    }
    console.log(`[LOG] Cookies yang dikirim: ${cookieString}`);
    return cookieString;
  }
  async _createTempEmail() {
    console.log("[LOG] Autentikasi: Membuat email sementara.");
    try {
      const response = await axios.get(`${this.emailService}?action=create`);
      this.email = response.data.email;
      console.log(`[LOG] Autentikasi: Email sementara berhasil dibuat: ${this.email}`);
      return this.email;
    } catch (error) {
      throw new Error(`Failed to create temp email: ${error.message}`);
    }
  }
  async _sendCaptcha() {
    console.log(`[LOG] Autentikasi: Mengirim captcha ke email: ${this.email}`);
    try {
      const requestId = this.generateUUID();
      const response = await axios.post(`${this.prodAPI}/user/captcha`, {
        method: "email",
        email: this.email,
        request_id: requestId
      }, {
        headers: {
          ...this.headers,
          Cookie: this._getCookies()
        }
      });
      this._updateCookies(response.headers["set-cookie"]);
      console.log("[LOG] Autentikasi: Permintaan captcha berhasil dikirim.");
    } catch (error) {
      throw new Error(`Failed to send captcha: ${error.message}`);
    }
  }
  async _getEmailMessages() {
    console.log("[LOG] Autentikasi: Memeriksa email masuk.");
    try {
      const response = await axios.get(`${this.emailService}?action=message&email=${this.email}`);
      console.log("[LOG] Autentikasi: Pesan email berhasil diambil.");
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get email messages: ${error.message}`);
    }
  }
  _extractCaptcha(emailData) {
    console.log("[LOG] Autentikasi: Mengekstrak kode captcha dari email.");
    if (emailData.data && emailData.data.length > 0) {
      const textContent = emailData.data[0].text_content;
      const codeMatch = textContent.match(/verify code:\s*(\d{6})/);
      if (codeMatch) {
        console.log(`[LOG] Autentikasi: Captcha berhasil diekstrak: ${codeMatch[1]}`);
        return codeMatch[1];
      }
    }
    console.warn("[WARNING] Autentikasi: Kode captcha tidak ditemukan.");
    return null;
  }
  async _login(captcha) {
    console.log("[LOG] Autentikasi: Mencoba login dengan captcha.");
    try {
      const requestId = this.generateUUID();
      const response = await axios.post(`${this.prodAPI}/user/login/email/captcha`, {
        captcha: captcha,
        email: this.email,
        request_id: requestId
      }, {
        headers: {
          ...this.headers,
          Cookie: this._getCookies()
        }
      });
      if (response.data.code !== 0 || !response.data.result) {
        throw new Error(`Login failed with message: ${response.data.message}`);
      }
      this._updateCookies(response.headers["set-cookie"]);
      const result = response.data.result;
      this.userId = result.id;
      this.username = result.nickname;
      this.ticket = this.cookies["ticket"] || null;
      this.refreshToken = this.cookies["refresh_token"] || null;
      console.log("[LOG] Autentikasi: Login berhasil. Informasi pengguna disimpan.");
      console.log(`[LOG] Autentikasi: Ticket: ${this.ticket ? this.ticket.substring(0, 10) + "..." : "N/A"}`);
      console.log(`[LOG] Autentikasi: Refresh Token: ${this.refreshToken ? this.refreshToken.substring(0, 10) + "..." : "N/A"}`);
      console.log(`[LOG] Autentikasi: User ID: ${this.userId}`);
      console.log(`[LOG] Autentikasi: Username: ${this.username}`);
      return result;
    } catch (error) {
      throw new Error(`Failed to login: ${error.message}`);
    }
  }
  async _ensureAuth() {
    console.log("[LOG] Autentikasi: Memeriksa status autentikasi.");
    if (this.ticket && this.userId) {
      console.log("[LOG] Autentikasi: Pengguna sudah terautentikasi, dilewati.");
      return;
    }
    console.log("[LOG] Autentikasi: Pengguna belum terautentikasi. Memulai proses login.");
    try {
      await this._createTempEmail();
      await this._sendCaptcha();
      let captcha;
      let attempts = 0;
      const maxAttempts = 10;
      console.log("[LOG] Autentikasi: Menunggu email captcha...");
      while (!captcha && attempts < maxAttempts) {
        await this.sleep(5e3);
        const emailData = await this._getEmailMessages();
        captcha = this._extractCaptcha(emailData);
        attempts++;
        if (!captcha) {
          console.log(`[LOG] Autentikasi: Kode tidak ditemukan, mencoba lagi... (Percobaan ${attempts}/${maxAttempts})`);
        }
      }
      if (!captcha) {
        throw new Error("Captcha code not found in email after multiple attempts.");
      }
      await this._login(captcha);
      console.log("[LOG] Autentikasi: Proses autentikasi selesai.");
    } catch (error) {
      console.error(`[ERROR] Autentikasi: Gagal dalam alur autentikasi: ${error.message}`);
      throw error;
    }
  }
  async _getPresignedUrl(fileName, contentType) {
    console.log(`[LOG] Unggahan: Meminta URL presigned untuk ${fileName} (${contentType}).`);
    try {
      const response = await axios.get(`${this.prodAPI}/user/google_key/hidreamai-image?filename=${fileName}&content_type=${encodeURIComponent(contentType)}`, {
        headers: {
          ...this.headers,
          Cookie: this._getCookies()
        }
      });
      if (response.data.code !== 0 || !response.data.result) {
        throw new Error(`Failed to get presigned URL: ${response.data.message}`);
      }
      console.log(`[LOG] Unggahan: URL presigned diterima.`);
      return response.data.result;
    } catch (error) {
      throw new Error(`Failed to get presigned URL: ${error.message}`);
    }
  }
  async _uploadImageToPresignedUrl(url, buffer, contentType) {
    console.log(`[LOG] Unggahan: Mengunggah gambar ke URL presigned.`);
    try {
      await axios.put(url, buffer, {
        headers: {
          "Content-Type": contentType
        }
      });
      console.log("[LOG] Unggahan: Gambar berhasil diunggah ke URL presigned.");
    } catch (error) {
      throw new Error(`Failed to upload file to presigned URL: ${error.message}`);
    }
  }
  async _commitAsset(mediaKey) {
    console.log(`[LOG] Unggahan: Melakukan commit aset untuk media key: ${mediaKey}.`);
    try {
      const requestId = this.generateUUID();
      await axios.put(`${this.prodAPI}/content/assets_folder/v1/auto`, {
        algo_type: 1,
        media_type: 1,
        media_key: mediaKey
      }, {
        headers: {
          ...this.headers,
          Cookie: this._getCookies()
        }
      });
      console.log("[LOG] Unggahan: Aset berhasil di-commit.");
    } catch (error) {
      throw new Error(`Failed to commit asset: ${error.message}`);
    }
  }
  async _uploadImageFromUrl(imageUrl) {
    console.log(`[LOG] Unggahan: Memulai alur unggahan gambar dari URL: ${imageUrl}.`);
    try {
      const imageResponse = await axios.get(imageUrl, {
        responseType: "arraybuffer"
      });
      const imageBuffer = Buffer.from(imageResponse.data);
      const contentType = imageResponse.headers["content-type"] || "image/jpeg";
      const fileExtension = contentType.split("/")[1] || "jpeg";
      const mediaKey = `j_${this.generateUUID()}.${fileExtension}`;
      const presignedUrl = await this._getPresignedUrl(mediaKey, contentType);
      await this._uploadImageToPresignedUrl(presignedUrl, imageBuffer, contentType);
      await this._commitAsset(mediaKey);
      console.log(`[LOG] Unggahan: Gambar berhasil diunggah. Media Key: ${mediaKey}.`);
      return mediaKey;
    } catch (error) {
      throw new Error(`Failed to upload image from URL: ${error.message}`);
    }
  }
  async _refinePrompt(prompt) {
    console.log(`[LOG] Prompt Refinement: Meminta penyempurnaan prompt untuk: "${prompt}".`);
    try {
      const requestId = this.generateUUID();
      const response = await axios.post(`${this.baseURL}/api/gw/v2/text/img2video_prompt_refine/sync`, {
        prompt: prompt,
        request_id: requestId
      }, {
        headers: {
          ...this.headers,
          Cookie: this._getCookies()
        }
      });
      if (response.data.code !== 0 || !response.data.result) {
        throw new Error(`Failed to refine prompt: ${response.data.message}`);
      }
      console.log(`[LOG] Prompt Refinement: Prompt berhasil disempurnakan.`);
      return response.data.result.prompt;
    } catch (error) {
      console.warn(`[WARNING] Prompt Refinement: Gagal menyempurnakan prompt. Menggunakan prompt asli. Error: ${error.message}`);
      return prompt;
    }
  }
  async txt2vid({
    prompt,
    negative_prompt = "",
    ...rest
  }) {
    console.log("[LOG] Txt2vid: Memulai pembuatan video dari teks.");
    try {
      await this._ensureAuth();
      const refinedPrompt = await this._refinePrompt(prompt);
      const requestId = this.generateUUID();
      const payload = {
        image: null,
        module: "video_diffusion",
        params: {
          batch_size: 1,
          guidance_scale: 7,
          sample_steps: 80,
          width: 512,
          height: 910,
          fast_mode: false,
          frame_num: 16,
          seed: -1,
          motion_strength: 9,
          max_width: 1024,
          wh_ratio: "9:16",
          cm_x: 0,
          cm_y: 0,
          cm_d: 0,
          custom_params: {
            wh_ratio: "9:16"
          },
          mode: "Slow",
          duration: 5,
          x: 0,
          y: 0,
          z: 0,
          style: "default",
          ...rest
        },
        prompt: prompt,
        negative_prompt: negative_prompt,
        role: "general",
        style: "default",
        wh_ratio: "9:16",
        version: "v3Pro",
        magic_prompt: refinedPrompt,
        images: [],
        videos: [],
        audios: [],
        request_id: requestId
      };
      console.log("[LOG] Txt2vid: Mengirim permintaan pembuatan video.");
      const response = await axios.post(`${this.baseURL}/api/gw/v3/video/video_diffusion/async`, payload, {
        headers: {
          ...this.headers,
          Cookie: this._getCookies()
        }
      });
      if (response.data.code !== 0 || !response.data.result || !response.data.result.task_id) {
        throw new Error(`Video creation failed: ${response.data.message}`);
      }
      const task_id = response.data.result.task_id;
      const encryptedData = {
        ticket: this.ticket,
        refreshToken: this.refreshToken,
        userId: this.userId,
        username: this.username,
        deviceId: this.deviceId,
        id: task_id
      };
      console.log(`[LOG] Txt2vid: Tugas video berhasil dibuat. ID terenkripsi: ${this.enc(encryptedData)}`);
      return this.enc(encryptedData);
    } catch (error) {
      throw new Error(`Failed to create txt2vid task: ${error.message}`);
    }
  }
  async img2vid({
    imageUrl,
    prompt,
    negative_prompt = "",
    ...rest
  }) {
    console.log("[LOG] Img2vid: Memulai pembuatan video dari gambar.");
    try {
      await this._ensureAuth();
      const mediaKey = await this._uploadImageFromUrl(imageUrl);
      const refinedPrompt = await this._refinePrompt(prompt);
      const requestId = this.generateUUID();
      const payload = {
        image: null,
        module: "video_diffusion_img2vid",
        params: {
          batch_size: 1,
          guidance_scale: 7,
          sample_steps: 80,
          width: 960,
          height: 1280,
          fast_mode: false,
          frame_num: 16,
          seed: -1,
          motion_strength: 9,
          max_width: 1024,
          wh_ratio: "keep",
          cm_x: 0,
          cm_y: 0,
          cm_d: 0,
          custom_params: {
            wh_ratio: "960:1280"
          },
          mode: "Slow",
          duration: 5,
          x: 0,
          y: 0,
          z: 0,
          style: "default",
          ...rest
        },
        prompt: prompt,
        negative_prompt: negative_prompt,
        role: "general",
        style: "default",
        wh_ratio: "960:1280",
        version: "v3Pro",
        magic_prompt: refinedPrompt,
        images: [mediaKey],
        videos: [],
        audios: [],
        request_id: requestId
      };
      console.log("[LOG] Img2vid: Mengirim permintaan pembuatan video.");
      const response = await axios.post(`${this.baseURL}/api/gw/v3/video/video_diffusion_img2vid/async`, payload, {
        headers: {
          ...this.headers,
          Cookie: this._getCookies()
        }
      });
      if (response.data.code !== 0 || !response.data.result || !response.data.result.task_id) {
        throw new Error(`Video creation failed: ${response.data.message}`);
      }
      const task_id = response.data.result.task_id;
      const encryptedData = {
        ticket: this.ticket,
        refreshToken: this.refreshToken,
        userId: this.userId,
        username: this.username,
        deviceId: this.deviceId,
        id: task_id
      };
      console.log(`[LOG] Img2vid: Tugas video berhasil dibuat. ID terenkripsi: ${this.enc(encryptedData)}`);
      return this.enc(encryptedData);
    } catch (error) {
      throw new Error(`Failed to create img2vid task: ${error.message}`);
    }
  }
  async status({
    task_id
  }) {
    console.log(`[LOG] Status: Memeriksa status untuk ID tugas terenkripsi: ${task_id}.`);
    try {
      const decryptedData = this.dec(task_id);
      const {
        ticket,
        userId,
        id,
        deviceId,
        refreshToken,
        username
      } = decryptedData;
      const cookies = `region=1; device_id=${deviceId}; ticket=${ticket}; refresh_token=${refreshToken}; username=${username};`;
      console.log(`[LOG] Status: ID tugas terdekripsi: ${id}.`);
      const response = await axios.post(`${this.baseURL}/api/gw/v3/video/video_diffusion/async/results/batch`, {
        task_id_list: [id]
      }, {
        headers: {
          ...this.headers,
          Cookie: cookies
        }
      });
      if (response.data.code !== 0 || !response.data.result) {
        throw new Error(`Failed to get task status: ${response.data.message}`);
      }
      const task = response.data.result.find(t => t.task_id === id);
      if (!task) {
        console.warn(`[WARNING] Status: Tugas dengan ID ${id} tidak ditemukan dalam riwayat.`);
        return {
          task_id: id,
          status: "not_found",
          message: "Task with this ID was not found."
        };
      }
      const status = task.process_seconds !== null ? "success" : "processing";
      const videoUrl = task.url || null;
      console.log(`[LOG] Status: Status tugas ${id}: ${status}.`);
      return {
        task_id: task.task_id,
        status: status,
        queue_count: task.queue_count,
        process_seconds: task.process_seconds,
        output_url: videoUrl
      };
    } catch (error) {
      throw new Error(`Failed to retrieve task status: ${error.message}`);
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
  const vivagoAPI = new VivagoAPI();
  try {
    let response;
    switch (action) {
      case "img2vid":
        if (!params.prompt || !params.imageUrl) {
          return res.status(400).json({
            error: "Prompt and imageUrl are required for img2vid."
          });
        }
        const img2vid_task_id = await vivagoAPI.img2vid(params);
        return res.status(200).json({
          task_id: img2vid_task_id
        });
      case "txt2vid":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Prompt is required for txt2vid."
          });
        }
        const txt2vid_task_id = await vivagoAPI.txt2vid(params);
        return res.status(200).json({
          task_id: txt2vid_task_id
        });
      case "status":
        if (!params.task_id) {
          return res.status(400).json({
            error: "task_id is required for status."
          });
        }
        response = await vivagoAPI.status(params);
        return res.status(200).json(response);
      default:
        return res.status(400).json({
          error: `Invalid action: ${action}. Supported actions are 'img2vid', 'txt2vid', and 'status'.`
        });
    }
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}