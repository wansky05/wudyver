import axios from "axios";
import SpoofHead from "@/lib/spoof-head";
class VondyChat {
  constructor() {
    this.apiUrl = "https://vondyapi-proxy.com/bot/8e5fddc2-d5bb-42be-9f63-3142d73ccfd6/chat-stream-assistant-dfp/";
    this.headers = {
      accept: "text/event-stream",
      "content-type": "application/json",
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      Referer: "https://www.vondy.com/assistant?chat=SGFp&lc=5",
      ...SpoofHead()
    };
  }
  async chat({
    prompt,
    ...rest
  }) {
    try {
      const payload = this._createPayload({
        prompt: prompt,
        ...rest
      });
      const response = await axios.post(this.apiUrl, payload, {
        headers: this.headers,
        responseType: "text"
      });
      return this._parse(response.data);
    } catch (error) {
      console.error("[VondyChat] Chat error:", error);
      throw error;
    }
  }
  _createPayload({
    prompt = "Hello",
    messages,
    ...opts
  }) {
    try {
      return {
        messages: prompt ? [{
          role: "user",
          content: [{
            type: "text",
            text: prompt
          }]
        }] : messages || [],
        context: {
          url: opts?.url || "https://www.vondy.com/assistant?chat=SGFp"
        },
        mod: opts?.mod ?? true,
        useCredit: opts?.useCredit ?? true,
        fp: opts?.fp ?? null,
        isVision: opts?.isVision ?? 0,
        claude: opts?.claude ?? false,
        mini: opts?.mini ?? true,
        ...opts
      };
    } catch (error) {
      console.error("[VondyChat] Payload error:", error);
      throw error;
    }
  }
  _parse(data) {
    try {
      let result = "";
      for (const event of data.split("\n")) {
        if (!event.startsWith("data:")) continue;
        const content = event.slice(6);
        if (!content) continue;
        try {
          const parsed = JSON.parse(content);
          if (parsed?.content) result += parsed.content;
        } catch {
          result += content;
        }
      }
      return {
        result: result.trim()
      };
    } catch (error) {
      console.error("[VondyChat] Parse error:", error);
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
    const vondy = new VondyChat();
    const response = await vondy.chat(params);
    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}