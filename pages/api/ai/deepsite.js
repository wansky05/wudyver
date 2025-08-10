import axios from "axios";
class AIChat {
  constructor() {
    this.apiUrl = "https://victor-deepsite.hf.space/api/ask-ai";
    this.defaultHeaders = {
      accept: "*/*",
      "accept-language": "id-ID,id;q=0.9",
      "content-type": "application/json",
      origin: "https://victor-deepsite.hf.space",
      referer: "https://victor-deepsite.hf.space/",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36"
    };
  }
  async chat({
    prompt = "generate page ai chat same as whatsapp template",
    html = "",
    previousPrompt = "",
    ...rest
  } = {}) {
    try {
      const response = await axios.post(this.apiUrl, {
        prompt: prompt,
        html: html,
        previousPrompt: previousPrompt,
        ...rest
      }, {
        headers: this.defaultHeaders
      });
      return {
        result: response.data
      };
    } catch (error) {
      console.error("Error during AI chat:", error);
      throw error;
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
    const ai = new AIChat();
    const response = await ai.chat(params);
    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}