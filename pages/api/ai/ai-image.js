import axios from "axios";
import apiConfig from "@/configs/apiConfig";
const ACTION_REQUIREMENTS = {
  prompt: ["canvas", "text2ghibli2", "txt2ghbli", "nsfw"],
  url: ["hijabkan", "hytam", "jadibabi"],
  prompt_url: ["custom"],
  style_url: ["style"]
};
class AIImageGenerator {
  constructor() {
    this.apiKey = "wudysoft";
    this.baseURL = `https://${apiConfig.DOMAIN_VERCEL}/ai-image`;
  }
  async generate({
    action,
    prompt,
    url,
    style
  }) {
    this.validateParams(action, prompt, url, style);
    const params = {
      apikey: this.apiKey
    };
    if (prompt) params.prompt = prompt;
    if (url) params.url = url;
    if (style) params.style = style;
    try {
      const response = await axios.get(`${this.baseURL}/${action}`, {
        params: params,
        responseType: "arraybuffer"
      });
      return response.data;
    } catch (error) {
      console.error("Error generating image:", error.response?.data?.toString() || error.message);
      throw new Error("Failed to generate image from external API.");
    }
  }
  validateParams(action, prompt, url, style) {
    if (!action) {
      throw new Error('Parameter "action" is required.');
    }
    if (ACTION_REQUIREMENTS.prompt.includes(action) && !prompt) {
      throw new Error(`Parameter "prompt" is required for action "${action}".`);
    }
    if (ACTION_REQUIREMENTS.url.includes(action) && !url) {
      throw new Error(`Parameter "url" is required for action "${action}".`);
    }
    if (ACTION_REQUIREMENTS.prompt_url.includes(action)) {
      if (!prompt) {
        throw new Error(`Parameter "prompt" is required for action "${action}".`);
      }
      if (!url) {
        throw new Error(`Parameter "url" is required for action "${action}".`);
      }
    }
    if (ACTION_REQUIREMENTS.style_url.includes(action)) {
      if (!style) {
        throw new Error(`Parameter "style" is required for action "${action}".`);
      }
      if (!url) {
        throw new Error(`Parameter "url" is required for action "${action}".`);
      }
    }
    const allValidActions = [...ACTION_REQUIREMENTS.prompt, ...ACTION_REQUIREMENTS.url, ...ACTION_REQUIREMENTS.prompt_url, ...ACTION_REQUIREMENTS.style_url];
    if (!allValidActions.includes(action)) {
      throw new Error(`Invalid action: "${action}".`);
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  const aiGenerator = new AIImageGenerator();
  try {
    const imageBuffer = await aiGenerator.generate(params);
    res.setHeader("Content-Type", "image/png");
    return res.status(200).send(imageBuffer);
  } catch (error) {
    console.error("Error in API route:", error);
    const statusCode = error.message.includes("required") || error.message.includes("Invalid action") ? 400 : 500;
    res.status(statusCode).json({
      error: error.message
    });
  }
}