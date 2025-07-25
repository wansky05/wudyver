import axios from "axios";
import crypto from "crypto";
import apiConfig from "@/configs/apiConfig";
class Veo3Generator {
  async generate({
    prompt,
    ...rest
  }) {
    try {
      if (!prompt) throw new Error("Prompt is required");
      const {
        data: cf
      } = await axios.get(`https://${apiConfig.DOMAIN_URL}/api/tools/cf-token`, {
        params: {
          mode: "turnstile-min",
          siteKey: "0x4AAAAAAANuFg_hYO9YJZqo",
          url: "https://aivideogenerator.me/features/g-ai-video-generator",
          accessKey: "e2ddc8d3ce8a8fceb9943e60e722018cb23523499b9ac14a8823242e689eefed"
        }
      });
      const uid = crypto.createHash("md5").update(Date.now().toString()).digest("hex");
      const options = {
        imgUrls: [],
        quality: "720p",
        duration: 8,
        autoSoundFlag: false,
        soundPrompt: "",
        autoSpeechFlag: false,
        speechPrompt: "",
        speakerId: "Auto",
        aspectRatio: "16:9",
        secondaryPageId: 1811,
        channel: "VEO3",
        source: "aivideogenerator.me",
        type: "features",
        watermarkFlag: false,
        privateFlag: false,
        isTemp: true,
        vipFlag: false,
        model: "veo-3-fast",
        ...rest
      };
      const {
        data: task
      } = await axios.post("https://aiarticle.erweima.ai/api/v1/secondary-page/api/create", {
        prompt: prompt,
        ...options
      }, {
        headers: {
          uniqueid: uid,
          verify: cf.data.token
        }
      });
      while (true) {
        const {
          data
        } = await axios.get(`https://aiarticle.erweima.ai/api/v1/secondary-page/api/${task.data.recordId}`, {
          headers: {
            uniqueid: uid,
            verify: cf.data.token
          }
        });
        if (data.data.state === "success") {
          return JSON.parse(data.data.completeData);
        }
        await new Promise(resolve => setTimeout(resolve, 1e3));
      }
    } catch (error) {
      throw new Error(error.message);
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.prompt) {
    return res.status(400).json({
      error: "Prompt are required"
    });
  }
  try {
    const veo3 = new Veo3Generator();
    const response = await veo3.generate(params);
    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}