import WebSocket from "ws";
class AIArtGenerator {
  constructor() {
    this.websocketUrl = "wss://app.yimeta.ai/ai-art-generator/queue/join";
    this.defaultNegativePrompt = "(worst quality, low quality:1.4), (greyscale, monochrome:1.1), cropped, lowres , username, blurry, trademark, watermark, title, multiple view, Reference sheet, curvy, plump, fat, strabismus, clothing cutout, side slit,worst hand, (ugly face:1.2), extra leg, extra arm, bad foot, text, name";
    this.availableStyles = ["Anime", "Realistic"];
  }
  async generate({
    prompt,
    style = "Anime",
    negativePrompt = this.defaultNegativePrompt,
    scale = 7
  }) {
    return new Promise((resolve, reject) => {
      if (!prompt) {
        return reject(new Error("Prompt is required."));
      }
      if (!this.availableStyles.includes(style)) {
        return reject(new Error(`Available styles: ${this.availableStyles.join(", ")}`));
      }
      const session_hash = Math.random().toString(36).substring(2);
      const socket = new WebSocket(this.websocketUrl);
      socket.on("message", data => {
        const d = JSON.parse(data.toString("utf8"));
        switch (d.msg) {
          case "send_hash":
            socket.send(JSON.stringify({
              fn_index: 31,
              session_hash: session_hash
            }));
            break;
          case "send_data":
            socket.send(JSON.stringify({
              fn_index: 31,
              session_hash: session_hash,
              data: [style, prompt, negativePrompt, scale, ""]
            }));
            break;
          case "estimation":
          case "process_starts":
            break;
          case "process_completed":
            socket.close();
            if (d.output && d.output.data && d.output.data[0] && d.output.data[0][0] && d.output.data[0][0].name) {
              resolve({
                result: d.output.data[0][0].name
              });
            } else {
              reject(new Error("Failed to get image URL from response."));
            }
            break;
          default:
            console.log(`[AIArtGenerator] Unexpected message type: ${data.toString("utf8")}`);
            break;
        }
      });
      socket.on("error", error => {
        socket.close();
        reject(new Error(`WebSocket error: ${error.message}`));
      });
      socket.on("close", () => {});
    });
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
    const gen = new AIArtGenerator();
    const response = await gen.generate(params);
    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}