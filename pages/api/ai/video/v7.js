import axios from "axios";
import crypto from "crypto";
import apiConfig from "@/configs/apiConfig";
class Text2VideoGenerator {
  constructor() {
    this.availableRatios = ["16:9", "9:16", "1:1", "4:3", "3:4"];
  }
  async generate({
    prompt,
    ratio = "16:9",
    ...rest
  }) {
    try {
      if (!prompt) throw new Error("Prompt is required");
      if (!this.availableRatios.includes(ratio)) {
        throw new Error(`Available ratios: ${this.availableRatios.join(", ")}`);
      }
      const {
        data: cf
      } = await axios.get(`https://${apiConfig.DOMAIN_URL}/api/tools/cf-token`, {
        params: {
          mode: "turnstile-min",
          siteKey: "0x4AAAAAAATOXAtQtziH-Rwq",
          url: "https://www.yeschat.ai/features/text-to-video-generator",
          accessKey: "a40fc14224e8a999aaf0c26739b686abfa4f0b1934cda7fa3b34522b0ed5125d"
        }
      });
      const uid = crypto.createHash("md5").update(Date.now().toString()).digest("hex");
      const options = {
        imgUrls: [],
        quality: "540p",
        duration: 5,
        autoSoundFlag: false,
        soundPrompt: "",
        autoSpeechFlag: false,
        speechPrompt: "",
        speakerId: "Auto",
        aspectRatio: ratio,
        secondaryPageId: 388,
        channel: "PIXVERSE",
        source: "yeschat.ai",
        type: "features",
        watermarkFlag: false,
        privateFlag: false,
        isTemp: true,
        vipFlag: false,
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
  getAvailableRatios() {
    return this.availableRatios;
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
    const txt2vid = new Text2VideoGenerator();
    const response = await txt2vid.generate(params);
    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}