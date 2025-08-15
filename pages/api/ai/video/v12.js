import axios from "axios";
import crypto from "crypto";
import apiConfig from "@/configs/apiConfig";
import Encoder from "@/lib/encoder";
class Image2VideoGenerator {
  constructor() {
    this.availableRatios = ["16:9", "9:16", "1:1", "4:3", "3:4"];
    this.availableQualities = ["360p", "540p", "720p", "1080p"];
  }
  enc(data) {
    const {
      uuid: jsonUuid
    } = Encoder.enc({
      data: data,
      method: "combined"
    });
    return jsonUuid;
  }
  dec(uuid) {
    const decryptedJson = Encoder.dec({
      uuid: uuid,
      method: "combined"
    });
    return decryptedJson.text;
  }
  async generate({
    prompt,
    imgUrls = [],
    ratio = "16:9",
    quality = "360p",
    duration = 5,
    ...rest
  }) {
    try {
      if (!prompt) throw new Error("Prompt is required");
      if (!this.availableRatios.includes(ratio)) {
        throw new Error(`Available ratios: ${this.availableRatios.join(", ")}`);
      }
      if (!this.availableQualities.includes(quality)) {
        throw new Error(`Available qualities: ${this.availableQualities.join(", ")}`);
      }
      const {
        data: cf
      } = await axios.get(`https://${apiConfig.DOMAIN_URL}/api/tools/cf-token`, {
        params: {
          mode: "turnstile-min",
          sitekey: "0x4AAAAAAANuFg_hYO9YJZqo",
          url: "https://aivideogenerator.me/features/image-to-video"
        }
      });
      const uid = crypto.createHash("md5").update(Date.now().toString()).digest("hex");
      const options = {
        prompt: prompt,
        imgUrls: imgUrls,
        quality: quality,
        duration: duration,
        autoSoundFlag: false,
        soundPrompt: "",
        autoSpeechFlag: false,
        speechPrompt: "",
        speakerId: "Auto",
        aspectRatio: ratio,
        secondaryPageId: 1379,
        channel: "PIXVERSE",
        source: "aivideogenerator.me",
        type: "features",
        watermarkFlag: false,
        privateFlag: false,
        isTemp: true,
        vipFlag: false,
        ...rest
      };
      const {
        data: task
      } = await axios.post("https://aiarticle.erweima.ai/api/v1/secondary-page/api/create", options, {
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "id-ID,id;q=0.9",
          "content-type": "application/json",
          origin: "https://aivideogenerator.me",
          priority: "u=1, i",
          referer: "https://aivideogenerator.me/",
          "sec-ch-ua": '"Lemur";v="135", "", "", "Microsoft Edge Simulate";v="135"',
          "sec-ch-ua-mobile": "?1",
          "sec-ch-ua-platform": '"Android"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "cross-site",
          uniqueid: uid,
          "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
          verify: cf.token
        }
      });
      const task_id = this.enc({
        uid: uid,
        cfToken: cf.token,
        recordId: task.data.recordId
      });
      return {
        task_id: task_id,
        message: "Task initiated successfully. Use the /api/image-to-video?action=status endpoint to check its progress."
      };
    } catch (error) {
      throw new Error(error.message);
    }
  }
  async status({
    task_id
  }) {
    try {
      if (!task_id) {
        throw new Error("task_id is required to check status.");
      }
      const decryptedData = this.dec(task_id);
      const {
        uid,
        cfToken,
        recordId
      } = decryptedData;
      if (!uid || !cfToken || !recordId) {
        throw new Error("Invalid task_id: Missing required data after decryption.");
      }
      const {
        data
      } = await axios.get(`https://aiarticle.erweima.ai/api/v1/secondary-page/api/${recordId}`, {
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "id-ID,id;q=0.9",
          origin: "https://aivideogenerator.me",
          referer: "https://aivideogenerator.me/",
          "sec-ch-ua": '"Lemur";v="135", "", "", "Microsoft Edge Simulate";v="135"',
          "sec-ch-ua-mobile": "?1",
          "sec-ch-ua-platform": '"Android"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "cross-site",
          uniqueid: uid,
          "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
          verify: cfToken
        }
      });
      if (data.data.state === "success") {
        return {
          status: "success",
          result: JSON.parse(data.data.completeData)
        };
      } else if (data.data.state === "processing" || data.data.state === "pending") {
        return {
          status: "processing",
          message: "Task is still being processed."
        };
      } else {
        return {
          status: data.data.state,
          message: "Task status is unknown or failed.",
          rawData: data.data
        };
      }
    } catch (error) {
      console.error("Error in status check:", error);
      throw new Error(`Failed to check task status: ${error.message}`);
    }
  }
  getAvailableRatios() {
    return this.availableRatios;
  }
  getAvailableQualities() {
    return this.availableQualities;
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
  const img2vid = new Image2VideoGenerator();
  try {
    switch (action) {
      case "create":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Prompt are required for 'create' action."
          });
        }
        const createResponse = await img2vid.generate(params);
        return res.status(200).json(createResponse);
      case "status":
        if (!params.task_id) {
          return res.status(400).json({
            error: "task_id is required for 'status' action."
          });
        }
        const statusResponse = await img2vid.status(params);
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