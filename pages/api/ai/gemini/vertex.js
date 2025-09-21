import axios from "axios";
import FormData from "form-data";
import apiConfig from "@/configs/apiConfig";
class VertexAI {
  constructor() {
    this.api_url = "https://firebasevertexai.googleapis.com/v1beta";
    this.model_url = "projects/gemmy-ai-bdc03/locations/us-central1/publishers/google/models";
    this.uploadUrl = `https://${apiConfig.DOMAIN_URL}/api/tools/upload`;
    this.headers = {
      "content-type": "application/json",
      "x-goog-api-client": "gl-kotlin/2.1.0-ai fire/16.5.0",
      "x-goog-api-key": "AIzaSyD6QwvrvnjU7j-R6fkOghfIVKwtvc7SmLk"
    };
    this.ratio = ["1:1", "3:4", "4:3", "9:16", "16:9"];
    this.model = {
      search: ["gemini-2.0-flash", "gemini-2.0-flash-001", "gemini-2.5-flash", "gemini-2.5-flash-lite-preview-06-17", "gemini-2.5-pro"],
      chat: ["gemini-1.5-flash", "gemini-1.5-flash-002", "gemini-1.5-pro", "gemini-1.5-pro-002", "gemini-2.0-flash", "gemini-2.0-flash-001", "gemini-2.0-flash-lite", "gemini-2.0-flash-lite-001", "gemini-2.5-flash", "gemini-2.5-flash-lite-preview-06-17", "gemini-2.5-pro"],
      image: ["imagen-3.0-generate-002", "imagen-3.0-generate-001", "imagen-3.0-fast-generate-001", "imagen-3.0-capability-001", "imagen-4.0-generate-preview-06-06", "imagen-4.0-fast-generate-preview-06-06", "imagen-4.0-ultra-generate-preview-06-06"]
    };
  }
  async chat({
    prompt: question,
    model = "gemini-1.5-flash",
    system_instruction = null,
    imageUrl = null,
    search = false
  } = {}) {
    if (!question) throw new Error("Question is required");
    if (!this.model.chat.includes(model)) throw new Error(`Available models: ${this.model.chat.join(", ")}`);
    if (search && !this.model.search.includes(model)) throw new Error(`Available search models: ${this.model.search.join(", ")}`);
    const parts = [{
      text: question
    }];
    let fileBuffer = null;
    let mimeType = null;
    if (imageUrl) {
      try {
        const imageResponse = await axios.get(imageUrl, {
          responseType: "arraybuffer"
        });
        fileBuffer = Buffer.from(imageResponse.data);
        mimeType = imageResponse.headers["content-type"];
        if (!mimeType) throw new Error("Could not determine MIME type from image URL response.");
      } catch (imageDownloadError) {
        throw new Error(`Failed to download image from URL: ${imageDownloadError.message}`);
      }
      parts.unshift({
        inlineData: {
          mimeType: mimeType,
          data: fileBuffer.toString("base64")
        }
      });
    }
    const r = await axios.post(`${this.api_url}/${this.model_url}/${model}:generateContent`, {
      model: `${this.model_url}/${model}`,
      contents: [...system_instruction ? [{
        role: "model",
        parts: [{
          text: system_instruction
        }]
      }] : [], {
        role: "user",
        parts: parts
      }],
      ...search ? {
        tools: [{
          googleSearch: {}
        }]
      } : {}
    }, {
      headers: this.headers
    });
    if (r.status !== 200) throw new Error("No result found");
    return r.data.candidates;
  }
  async image({
    prompt,
    model = "imagen-3.0-generate-002",
    aspect_ratio = "1:1"
  } = {}) {
    if (!prompt) throw new Error("Prompt is required");
    if (!this.model.image.includes(model)) throw new Error(`Available models: ${this.model.image.join(", ")}`);
    if (!this.ratio.includes(aspect_ratio)) throw new Error(`Available ratios: ${this.ratio.join(", ")}`);
    const r = await axios.post(`${this.api_url}/${this.model_url}/${model}:predict`, {
      instances: [{
        prompt: prompt
      }],
      parameters: {
        sampleCount: 1,
        includeRaiReason: true,
        aspectRatio: aspect_ratio,
        safetySetting: "block_only_high",
        personGeneration: "allow_adult",
        addWatermark: false,
        imageOutputOptions: {
          mimeType: "image/jpeg",
          compressionQuality: 100
        }
      }
    }, {
      headers: this.headers
    });
    if (r.status !== 200) throw new Error("No result found");
    const prediction = r.data.predictions[0];
    if (prediction?.bytesBase64Encoded && prediction?.mimeType) {
      const catboxUrl = await this.uploadToCatbox({
        bytesBase64Encoded: prediction.bytesBase64Encoded,
        mimeType: prediction.mimeType
      });
      return {
        url: catboxUrl,
        prompt: prompt,
        mime: prediction.mimeType
      };
    } else {
      throw new Error("No valid image data found in prediction.");
    }
  }
  async uploadToCatbox({
    bytesBase64Encoded,
    mimeType
  }) {
    if (!bytesBase64Encoded || typeof bytesBase64Encoded !== "string") {
      throw new Error("bytesBase64Encoded is required and must be a string.");
    }
    if (!mimeType || typeof mimeType !== "string") {
      throw new Error('mimeType is required and must be a string (e.g., "image/png").');
    }
    try {
      const buffer = Buffer.from(bytesBase64Encoded, "base64");
      const formData = new FormData();
      const fileExtension = mimeType.split("/")[1] || "png";
      formData.append("file", buffer, `image.${fileExtension}`);
      const response = await axios.post(this.uploadUrl, formData, {
        headers: {
          ...formData.getHeaders()
        }
      });
      if (response.status !== 200) {
        throw new Error(`upload failed with status ${response.status}: ${response.data}`);
      }
      return response.data?.result;
    } catch (error) {
      throw new Error(`Error uploading image to: ${error.message}`);
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
      error: "Missing required field: action",
      required: {
        action: "chat | image"
      }
    });
  }
  const api = new VertexAI();
  try {
    let result;
    switch (action) {
      case "chat":
        if (!params.prompt) {
          return res.status(400).json({
            error: `Missing required field: prompt (required for ${action})`
          });
        }
        result = await api[action](params);
        break;
      case "image":
        if (!params.prompt) {
          return res.status(400).json({
            error: `Missing required field: prompt (required for ${action})`
          });
        }
        result = await api[action](params);
        break;
      default:
        return res.status(400).json({
          error: `Invalid action: ${action}. Allowed: chat | image`
        });
    }
    return res.status(200).json({
      success: true,
      result: result
    });
  } catch (error) {
    return res.status(500).json({
      error: `Processing error: ${error.message}`
    });
  }
}