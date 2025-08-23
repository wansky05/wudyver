import axios from "axios";
import https from "https";
import apiConfig from "@/configs/apiConfig";
import SpoofHead from "@/lib/spoof-head";
const api = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  })
});
api.interceptors.request.use(config => {
  console.log("Memulai Permintaan:", {
    method: config.method,
    url: config.url,
    headers: config.headers,
    data: config.data,
    params: config.params
  });
  return config;
}, error => {
  return Promise.reject(error);
});
class AIVideoMaker {
  constructor() {
    this.userId = null;
    this.cfToken = null;
    this.baseURL = `https://aivideomaker.ai`;
    this.baseHeaders = {
      "content-type": "application/json",
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
      ...SpoofHead()
    };
  }
  async init() {
    try {
      const cfResponse = await api.get(`https://${apiConfig.DOMAIN_URL}/api/tools/cf-token`, {
        params: {
          sitekey: "0x4AAAAAABrddy3Hsje8mwB_",
          url: "https://aivideomaker.ai"
        }
      });
      this.cfToken = cfResponse.data.token;
      console.log("CF Token Response:", cfResponse.data);
      const userData = JSON.stringify({
        0: {
          json: null,
          meta: {
            values: ["undefined"]
          }
        }
      });
      const userResponse = await api.post(`${this.baseURL}/api/admin.anonymous?batch=1`, userData, {
        headers: {
          ...this.baseHeaders,
          Referer: `${this.baseURL}/text-to-video`
        }
      });
      console.log("User ID Response:", userResponse.data);
      this.userId = userResponse.data?.[0]?.result?.data?.json;
      if (!this.userId) {
        throw new Error("Gagal mendapatkan User ID dari respons API.");
      }
      return {
        cfToken: this.cfToken,
        userId: this.userId
      };
    } catch (error) {
      console.error("Initialization error:", error.message);
      throw error;
    }
  }
  async txt2vid({
    prompt,
    aspectRatio = "16:9",
    duration = 5,
    resolution = 480,
    quality = "medium"
  }) {
    try {
      if (!this.userId || !this.cfToken) {
        await this.init();
      }
      const postData = JSON.stringify({
        0: {
          json: {
            token: this.cfToken,
            content: prompt,
            aspectRatio: aspectRatio,
            duration: duration,
            resolution: resolution,
            quality: quality,
            lottery: null,
            userId: this.userId
          }
        }
      });
      const response = await api.post(`${this.baseURL}/api/ai.textToVideoForFree?batch=1`, postData, {
        headers: {
          ...this.baseHeaders,
          Referer: `${this.baseURL}/text-to-video`
        }
      });
      console.log("Text to Video Response:", response.data);
      const taskId = response.data?.[0]?.result?.data?.json;
      return {
        task_id: taskId
      };
    } catch (error) {
      console.error("Text to video error:", error.message);
      throw error;
    }
  }
  async img2vid({
    prompt,
    imageUrl,
    duration = 5,
    resolution = 480,
    quality = "medium"
  }) {
    try {
      if (!this.userId || !this.cfToken) {
        await this.init();
      }
      const postData = JSON.stringify({
        0: {
          json: {
            token: this.cfToken,
            image: imageUrl,
            content: prompt,
            duration: duration,
            resolution: resolution,
            quality: quality,
            lottery: null,
            userId: this.userId
          }
        }
      });
      const response = await api.post(`${this.baseURL}/api/ai.imageToVideoForFree?batch=1`, postData, {
        headers: {
          ...this.baseHeaders,
          Referer: `${this.baseURL}/image-to-video`
        }
      });
      console.log("Image to Video Response:", response.data);
      const taskId = response.data?.[0]?.result?.data?.json;
      return {
        task_id: taskId
      };
    } catch (error) {
      console.error("Image to video error:", error.message);
      throw error;
    }
  }
  async status({
    task_id
  }) {
    try {
      const encodedInput = encodeURIComponent(JSON.stringify({
        0: {
          json: {
            id: task_id
          }
        }
      }));
      const response = await api.get(`${this.baseURL}/api/model.getModel?batch=1&input=${encodedInput}`, {
        headers: {
          ...this.baseHeaders,
          Referer: `${this.baseURL}/text-to-video`
        }
      });
      console.log("Status Check Response (Raw):", response.data);
      const statusData = response.data?.[0]?.result?.data;
      return statusData ?? null;
    } catch (error) {
      console.error("Status check error:", error.message);
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
  const videoMaker = new AIVideoMaker();
  try {
    let response;
    switch (action) {
      case "img2vid":
        if (!params.prompt || !params.imageUrl) {
          return res.status(400).json({
            error: "Prompt and imageUrl are required for img2vid."
          });
        }
        const img2vid_task_id = await videoMaker.img2vid(params);
        return res.status(200).json(img2vid_task_id);
      case "txt2vid":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Prompt is required for txt2vid."
          });
        }
        const txt2vid_task_id = await videoMaker.txt2vid(params);
        return res.status(200).json(txt2vid_task_id);
      case "status":
        if (!params.task_id) {
          return res.status(400).json({
            error: "task_id is required for status."
          });
        }
        response = await videoMaker.status(params);
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