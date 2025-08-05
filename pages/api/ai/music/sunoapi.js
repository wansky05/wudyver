import axios from "axios";
import CryptoJS from "crypto-js";
import apiConfig from "@/configs/apiConfig";
class SunoAPI {
  constructor() {
    this.baseUrl = "https://api.sunoapi.org/api/v1";
    this.token = apiConfig.SUNOAPI_KEY;
    this.encKey = CryptoJS.enc.Utf8.parse(apiConfig.PASSWORD.padEnd(32, "x"));
    this.encIV = CryptoJS.enc.Utf8.parse(apiConfig.PASSWORD.padEnd(16, "x"));
  }
  enc(data) {
    const text = JSON.stringify(data);
    const encrypted = CryptoJS.AES.encrypt(text, this.encKey, {
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
    if (!json) throw new Error("Failed to decrypt or empty data.");
    return JSON.parse(json);
  }
  async generate({
    prompt,
    style = "pop",
    title = "untitled",
    instrumental = false,
    model = "V3_5",
    customMode = true
  }) {
    if (!prompt) throw new Error("Prompt is required.");
    try {
      const res = await axios.post(`${this.baseUrl}/generate`, {
        prompt: prompt,
        style: style,
        title: title,
        instrumental: instrumental,
        model: model,
        customMode: customMode,
        callBackUrl: "playground"
      }, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K)",
          Referer: "https://sunoapi.org/id/playground"
        }
      });
      if (res.data.code !== 200) throw new Error(res.data.msg || "Failed to create task.");
      const task_id = this.enc({
        token: this.token,
        taskId: res.data.data.taskId
      });
      return {
        task_id: task_id,
        message: "Task created successfully."
      };
    } catch (err) {
      throw new Error(`Generate failed: ${err.message}`);
    }
  }
  async status({
    task_id
  }) {
    if (!task_id) throw new Error("task_id is required.");
    try {
      const {
        token,
        taskId
      } = this.dec(task_id);
      const res = await axios.get(`${this.baseUrl}/generate/record-info`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K)",
          Referer: "https://sunoapi.org/id/playground"
        },
        params: {
          taskId: taskId
        }
      });
      return res.data;
    } catch (err) {
      throw new Error(`Status check failed: ${err.message}`);
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
      error: "Action (create or status) is required."
    });
  }
  const suno = new SunoAPI();
  try {
    switch (action) {
      case "create":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Prompt is required for 'create' action."
          });
        }
        const createResponse = await suno.generate(params);
        return res.status(200).json(createResponse);
      case "status":
        if (!params.task_id) {
          return res.status(400).json({
            error: "task_id is required for 'status' action."
          });
        }
        const statusResponse = await suno.status(params);
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