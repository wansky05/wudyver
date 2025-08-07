import axios from "axios";
import {
  createDecipheriv
} from "crypto";
class GhibliGPTAPI {
  constructor() {
    this.api = {
      base: "https://generate-api.ghibli-gpt.net",
      endpoints: {
        generate: "/v1/gpt4o-image/generate",
        task: "/v1/gpt4o-image/record-info"
      }
    };
    this.headers = {
      accept: "*/*",
      "content-type": "application/json",
      origin: "https://ghibli-gpt.net",
      referer: "https://ghibli-gpt.net/",
      "user-agent": "NB Android/1.0.0",
      authorization: ""
    };
    this.state = {
      token: null
    };
    this.security = {
      keyBase64: "UBsnTxs80g8p4iW72eYyPaDvGZbpzun8K2cnoSSEz1Y",
      ivBase64: "fG1SBDUyE2IG8kPw",
      ciphertextBase64: "2QpqZCkOD/WMHixMqt46AvhdKRYgy5aUMLXi6D0nOPGuDbH4gbNKDV0ZW/+9w9I="
    };
  }
  async decryptToken() {
    if (this.state.token) {
      console.log("Token sudah di-cache. Menggunakan token yang ada.");
      return this.state.token;
    }
    try {
      console.log("Memulai dekripsi token...");
      const buf = k => Buffer.from(this.security[k], "base64");
      const [key, iv, ciphertext] = ["keyBase64", "ivBase64", "ciphertextBase64"].map(buf);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(ciphertext.slice(-16));
      const decrypted = decipher.update(ciphertext.slice(0, -16), undefined, "utf8") + decipher.final("utf8");
      this.state.token = decrypted;
      this.headers.authorization = `Bearer ${decrypted}`;
      console.log("Dekripsi token berhasil.");
      return decrypted;
    } catch (err) {
      console.error("Gagal mendekripsi token:", err.message);
      throw new Error("Gagal mengambil token otentikasi.");
    }
  }
  prepareImageData(imageBuffer) {
    if (!Buffer.isBuffer(imageBuffer)) {
      console.log("Input bukan Buffer, mengembalikan data kosong.");
      return {
        filesUrl: [""],
        files: [""]
      };
    }
    const mime = "image/jpeg";
    const base64 = imageBuffer.toString("base64");
    console.log("Data gambar disiapkan dalam format Base64.");
    return {
      filesUrl: [""],
      files: [`data:${mime};base64,${base64}`]
    };
  }
  async generate({
    prompt,
    imageUrl,
    size = "2:3",
    nVariants = 1
  }) {
    console.log("Memulai proses generasi gambar...");
    if (!prompt?.trim()) {
      console.error("Validasi gagal: Prompt diperlukan.");
      return {
        success: false,
        code: 400,
        result: {
          error: "Prompt diperlukan."
        }
      };
    }
    if (!imageUrl || !(typeof imageUrl === "string" && (imageUrl.startsWith("https://") || imageUrl.startsWith("http://")))) {
      console.error("Validasi gagal: URL gambar tidak valid.");
      return {
        success: false,
        code: 400,
        result: {
          error: "URL gambar yang valid diperlukan."
        }
      };
    }
    let imageBuffer;
    try {
      console.log(`Mengambil gambar dari URL: ${imageUrl}`);
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer"
      });
      imageBuffer = Buffer.from(response.data);
      console.log("Gambar berhasil diunduh.");
    } catch (err) {
      console.error(`Gagal mengambil gambar: ${err.message}`);
      return {
        success: false,
        code: 400,
        result: {
          error: `Gagal mengambil gambar dari URL: ${err.message}`
        }
      };
    }
    const {
      filesUrl,
      files
    } = this.prepareImageData(imageBuffer);
    await this.decryptToken();
    try {
      console.log("Mengirim permintaan ke API...");
      const {
        data
      } = await axios.post(`${this.api.base}${this.api.endpoints.generate}`, {
        filesUrl: filesUrl,
        files: files,
        prompt: prompt,
        size: size,
        nVariants: nVariants
      }, {
        headers: this.headers
      });
      const task_id = data?.data?.taskId;
      if (!task_id) {
        console.error("API tidak mengembalikan ID tugas.");
        return {
          success: false,
          code: 500,
          result: {
            error: "ID tugas tidak dikembalikan oleh server."
          }
        };
      }
      console.log(`Permintaan berhasil dikirim. Mendapat task_id: ${task_id}`);
      return {
        success: true,
        code: 200,
        result: {
          task_id: task_id
        }
      };
    } catch (err) {
      const status = err.response?.status || 500;
      console.error(`Error saat mengirim permintaan API: ${err.message}`);
      return {
        success: false,
        code: status,
        result: {
          error: err.message
        }
      };
    }
  }
  async status({
    task_id
  }) {
    if (!task_id) {
      console.error("Validasi gagal: task_id diperlukan.");
      return {
        success: false,
        code: 400,
        result: {
          error: "ID tugas diperlukan."
        }
      };
    }
    await this.decryptToken();
    try {
      console.log(`Mengecek status untuk task_id: ${task_id}`);
      const {
        data
      } = await axios.get(`${this.api.base}${this.api.endpoints.task}?taskId=${task_id}`, {
        headers: this.headers
      });
      const d = data?.data || {};
      const status = d.status || "pending";
      if (status === "SUCCESS" && d.response?.resultUrls?.length) {
        console.log("Tugas berhasil diselesaikan!");
        return {
          success: true,
          code: 200,
          result: {
            status: "SUCCESS",
            progress: parseFloat(d.progress || "0").toFixed(2),
            link: d.response.resultUrls[0],
            thumbnail: d.response.thumbnailUrls?.[0],
            source: d.response.sourceUrls?.[0]
          }
        };
      }
      return {
        success: true,
        code: 202,
        result: {
          status: status,
          progress: parseFloat(d.progress || "0").toFixed(2),
          message: `Tugas sedang diproses. Status: ${status}`
        }
      };
    } catch (err) {
      const status = err.response?.status || 500;
      console.error(`Error saat mengecek status tugas: ${err.message}`);
      return {
        success: false,
        code: status,
        result: {
          error: err.message
        }
      };
    }
  }
}
export default async function handler(req, res) {
  const {
    action,
    ...params
  } = req.method === "POST" ? req.body : req.query;
  if (!action) {
    return res.status(400).json({
      success: false,
      error: "Action is required."
    });
  }
  try {
    switch (action) {
      case "generate": {
        if (!params.prompt || !params.imageUrl) {
          const error = !params.prompt ? "Prompt is required for 'generate'." : "imageUrl is required for 'generate'.";
          return res.status(400).json({
            success: false,
            error: error
          });
        }
        console.log("Memulai aksi 'generate'...");
        const result = await ghibliGPT.generate(params);
        return res.status(result.code).json(result);
      }
      case "status": {
        if (!params.task_id) {
          return res.status(400).json({
            success: false,
            error: "task_id is required for 'status'."
          });
        }
        console.log(`Memulai aksi 'status' untuk task_id: ${params.task_id}`);
        const result = await ghibliGPT.status(params);
        return res.status(result.code).json(result);
      }
      default:
        return res.status(400).json({
          success: false,
          error: "Invalid action. Supported actions: 'generate', 'status'."
        });
    }
  } catch (error) {
    console.error(`Error pada API: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error"
    });
  }
}