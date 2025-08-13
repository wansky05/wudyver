import axios from "axios";
import FormData from "form-data";
class AiLabs {
  constructor() {
    this.api = {
      base: "https://text2video.aritek.app",
      endpoints: {
        text2img: "/text2img",
        generate: "/txt2videov3",
        video: "/video"
      }
    };
    this.headers = {
      "user-agent": "NB Android/1.0.0",
      "accept-encoding": "gzip",
      "content-type": "application/json",
      authorization: ""
    };
    this.state = {
      token: null,
      tasks: new Map()
    };
    this.setup = {
      cipher: "hbMcgZLlzvghRlLbPcTbCpfcQKM0PcU0zhPcTlOFMxBZ1oLmruzlVp9remPgi0QWP0QW",
      shiftValue: 3
    };
  }
  dec(text, shift) {
    return [...text].map(c => /[a-z]/.test(c) ? String.fromCharCode((c.charCodeAt(0) - 97 - shift + 26) % 26 + 97) : /[A-Z]/.test(c) ? String.fromCharCode((c.charCodeAt(0) - 65 - shift + 26) % 26 + 65) : c).join("");
  }
  async decrypt() {
    if (this.state.token) return this.state.token;
    try {
      const input = this.setup.cipher;
      const shift = this.setup.shiftValue;
      const decrypted = this.dec(input, shift);
      this.state.token = decrypted;
      this.headers.authorization = decrypted;
      return decrypted;
    } catch (error) {
      console.error("Authentication failed:", error.message);
      throw new Error("Failed to authenticate with the API");
    }
  }
  deviceId() {
    return Array.from({
      length: 16
    }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  }
  async text2img(prompt) {
    if (!prompt?.trim()) {
      throw new Error("Prompt cannot be empty");
    }
    try {
      const token = await this.decrypt();
      const form = new FormData();
      form.append("prompt", prompt);
      form.append("token", token);
      console.log("[AI Labs] Generating image from text...");
      const url = this.api.base + this.api.endpoints.text2img;
      const res = await axios.post(url, form, {
        headers: {
          ...this.headers,
          ...form.getHeaders()
        }
      });
      const {
        code,
        url: imageUrl
      } = res.data;
      if (code !== 0 || !imageUrl) {
        throw new Error("Image generation failed");
      }
      console.log("[AI Labs] Image generated successfully");
      return {
        url: imageUrl.trim(),
        prompt: prompt
      };
    } catch (error) {
      console.error("[AI Labs] Image generation error:", error.message);
      throw error;
    }
  }
  async create({
    prompt = "",
    type = "video",
    isPremium = 1
  } = {}) {
    try {
      if (!prompt?.trim()) {
        throw new Error("Prompt cannot be empty");
      }
      if (!/^(image|video)$/.test(type)) {
        throw new Error('Type must be either "image" or "video"');
      }
      console.log(`[AI Labs] Starting ${type} generation...`);
      if (type === "image") {
        const result = await this.text2img(prompt);
        const taskId = `img_${Date.now()}`;
        this.state.tasks.set(taskId, {
          status: "completed",
          result: result
        });
        return {
          taskId: taskId
        };
      }
      await this.decrypt();
      const payload = {
        deviceID: this.deviceId(),
        isPremium: isPremium,
        prompt: prompt,
        used: [],
        versionCode: 59
      };
      console.log("[AI Labs] Initializing video generation...");
      const url = this.api.base + this.api.endpoints.generate;
      const res = await axios.post(url, payload, {
        headers: this.headers
      });
      const {
        code,
        key
      } = res.data;
      if (code !== 0 || !key) {
        throw new Error("Failed to start video generation");
      }
      const taskId = `vid_${Date.now()}`;
      this.state.tasks.set(taskId, {
        status: "processing",
        key: key,
        progress: 0,
        lastChecked: Date.now()
      });
      return {
        task_id: taskId,
        key: key
      };
    } catch (error) {
      console.error("[AI Labs] Generation failed:", error.message);
      throw error;
    }
  }
  async status({
    task_id: taskId
  }) {
    if (!this.state.tasks.has(taskId)) {
      throw new Error("Invalid task ID");
    }
    const task = this.state.tasks.get(taskId);
    if (task.status === "completed") {
      return {
        status: "completed",
        result: task.result
      };
    }
    if (task.status === "failed") {
      return {
        status: "failed",
        error: task.error
      };
    }
    try {
      await this.decrypt();
      const payload = {
        keys: [task.key]
      };
      const url = this.api.base + this.api.endpoints.video;
      const res = await axios.post(url, payload, {
        headers: this.headers,
        timeout: 1e4
      });
      const {
        code,
        datas
      } = res.data;
      if (code !== 0 || !datas?.[0]) {
        throw new Error("Invalid response from server");
      }
      const data = datas[0];
      if (data.url && data.url.trim() !== "") {
        const result = {
          url: data.url.trim(),
          safe: data.safe === "true",
          key: data.key
        };
        this.state.tasks.set(taskId, {
          status: "completed",
          result: result
        });
        console.log("[AI Labs] Video generation completed");
        return {
          status: "completed",
          result: result
        };
      } else {
        const progress = parseFloat(data.progress || 0);
        this.state.tasks.set(taskId, {
          ...task,
          progress: progress,
          lastChecked: Date.now()
        });
        return {
          status: "processing",
          progress: progress,
          message: this._getProgressMessage(progress)
        };
      }
    } catch (error) {
      console.error("[AI Labs] Status check failed:", error.message);
      if (!["ECONNRESET", "ECONNABORTED", "ETIMEDOUT"].includes(error.code)) {
        this.state.tasks.set(taskId, {
          status: "failed",
          error: error.message
        });
      }
      throw error;
    }
  }
  _getProgressMessage(progress) {
    if (progress < 30) return "Video processing started";
    if (progress < 70) return "Video is being generated";
    return "Finalizing video";
  }
  async cancelTask(taskId) {
    if (this.state.tasks.has(taskId)) {
      this.state.tasks.delete(taskId);
      console.log(`[AI Labs] Task ${taskId} cancelled`);
      return true;
    }
    return false;
  }
}
export default async function handler(req, res) {
  const {
    action,
    ...params
  } = req.method === "GET" ? req.query : req.body;
  if (!action) {
    return res.status(400).json({
      error: "Action (create or status) is required."
    });
  }
  const aiLabs = new AiLabs();
  try {
    switch (action) {
      case "create":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Prompt is required for 'create' action."
          });
        }
        const createResponse = await aiLabs.create(params);
        return res.status(200).json(createResponse);
      case "status":
        if (!params.task_id) {
          return res.status(400).json({
            error: "task_id is required for 'status' action."
          });
        }
        const statusResponse = await aiLabs.status(params);
        return res.status(200).json(statusResponse);
      default:
        return res.status(400).json({
          error: "Invalid action. Supported actions are 'create' and 'status'."
        });
    }
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}