import axios from "axios";
import crypto from "crypto";
import Encoder from "@/lib/encoder";
class VheerEncryption {
  constructor() {
    this.encryptionKey = "vH33r_2025_AES_GCM_S3cur3_K3y_9X7mP4qR8nT2wE5yU1oI6aS3dF7gH0jK9lZ";
    this.key = this.deriveKey(this.encryptionKey);
  }
  async deriveKey(keyString) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(keyString);
    const importedKey = await crypto.subtle.importKey("raw", keyData, {
      name: "PBKDF2"
    }, false, ["deriveKey"]);
    const salt = encoder.encode("vheer-salt-2024");
    return await crypto.subtle.deriveKey({
      name: "PBKDF2",
      salt: salt,
      iterations: 1e4,
      hash: "SHA-256"
    }, importedKey, {
      name: "AES-GCM",
      length: 256
    }, false, ["encrypt", "decrypt"]);
  }
  async encrypt(plaintext) {
    try {
      const key = await this.key;
      const encoder = new TextEncoder();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt({
        name: "AES-GCM",
        iv: iv
      }, key, encoder.encode(plaintext));
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error("Encryption error:", error);
      throw new Error("Failed to encrypt data");
    }
  }
  async decrypt(ciphertextBase64) {
    try {
      const key = await this.key;
      const decoder = new TextDecoder();
      const binaryString = atob(ciphertextBase64);
      const combined = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        combined[i] = binaryString.charCodeAt(i);
      }
      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);
      const decrypted = await crypto.subtle.decrypt({
        name: "AES-GCM",
        iv: iv
      }, key, ciphertext);
      return decoder.decode(decrypted);
    } catch (error) {
      console.error("Decryption error:", error);
      throw new Error("Failed to decrypt data");
    }
  }
}
class VheerAPI {
  constructor() {
    this.baseURL = "https://vheer.com";
    this.uploadURL = "https://access.vheer.com/api/Vheer/UploadByFileNew";
    this.encryption = new VheerEncryption();
    this.headers = {
      accept: "application/json, text/plain, */*",
      "accept-language": "id-ID,id;q=0.9",
      origin: "https://vheer.com",
      referer: "https://vheer.com/",
      "sec-ch-ua": '"Lemur";v="135", "", "", "Microsoft Edge Simulate";v="135"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36"
    };
  }
  async enc(data) {
    const {
      uuid: jsonUuid
    } = await Encoder.enc({
      data: data,
      method: "combined"
    });
    return jsonUuid;
  }
  async dec(uuid) {
    const decryptedJson = await Encoder.dec({
      uuid: uuid,
      method: "combined"
    });
    return decryptedJson.text;
  }
  async txt2img({
    prompt,
    width = 1248,
    height = 702,
    aspect_ratio = "16:9",
    flux_model = 1,
    email = "",
    lan_code = "en",
    ...rest
  }) {
    try {
      const uploadPayload = {
        prompt: prompt,
        type: 1,
        width: width,
        height: height,
        email: email,
        lan_code: lan_code,
        aspect_ratio: aspect_ratio,
        flux_model: flux_model,
        ...rest
      };
      const encryptedParams = await this.encryption.encrypt(JSON.stringify(uploadPayload));
      const formData = new FormData();
      formData.append("params", encryptedParams);
      const uploadResponse = await axios.post(this.uploadURL, formData, {
        headers: {
          ...this.headers,
          "content-type": "multipart/form-data"
        }
      });
      if (!uploadResponse.data || !uploadResponse.data.code) {
        throw new Error("Failed to get task code from upload");
      }
      const taskCode = uploadResponse.data.code;
      const submitPayload = {
        type: 1,
        code: taskCode,
        email: email || ""
      };
      const encryptedSubmit = await this.encryption.encrypt(JSON.stringify(submitPayload));
      const submitResponse = await axios.post(`${this.baseURL}/app/text-to-image`, [{
        params: encryptedSubmit
      }], {
        headers: {
          ...this.headers,
          accept: "text/x-component",
          "content-type": "text/plain;charset=UTF-8",
          "next-action": "1eeefc61e5469e1a173b48743a3cb8dd77eed91b",
          referer: `${this.baseURL}/app/text-to-image`
        }
      });
      const encryptedData = {
        success: true,
        taskCode: taskCode,
        type: "txt2img",
        message: "Generation started successfully"
      };
      return {
        task_id: await this.enc(encryptedData)
      };
    } catch (error) {
      console.error("Text-to-image generation error:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  async img2img({
    prompt,
    imageUrl,
    positive_prompts = "",
    negative_prompts = "low quality, bad quality, blurry, pixelated, distorted, poorly drawn, out of focus",
    strength = .9,
    control_strength = .2,
    width = 1024,
    height = 1024,
    email = "",
    lora = "",
    batch_size = 1,
    ...rest
  }) {
    try {
      const imageResponse = await axios.get(imageUrl, {
        responseType: "arraybuffer"
      });
      const imageBuffer = Buffer.from(imageResponse.data);
      const formData = new FormData();
      formData.append("file", new Blob([imageBuffer], {
        type: "image/jpeg"
      }), "uploaded_image.jpg");
      const uploadPayload = {
        positive_prompts: prompt + (positive_prompts ? "," + positive_prompts : ""),
        negative_prompts: negative_prompts,
        strength: strength,
        control_strength: control_strength,
        type: 4,
        width: width,
        height: height,
        email: email,
        lora: lora,
        batch_size: batch_size,
        ...rest
      };
      const encryptedParams = await this.encryption.encrypt(JSON.stringify(uploadPayload));
      formData.append("params", encryptedParams);
      const uploadResponse = await axios.post(this.uploadURL, formData, {
        headers: this.headers
      });
      if (!uploadResponse.data || !uploadResponse.data.code) {
        throw new Error("Failed to get task code from upload");
      }
      const taskCode = uploadResponse.data.code;
      const submitPayload = {
        type: 4,
        code: taskCode,
        email: email || ""
      };
      const encryptedSubmit = await this.encryption.encrypt(JSON.stringify(submitPayload));
      const submitResponse = await axios.post(`${this.baseURL}/app/image-to-image`, [{
        params: encryptedSubmit
      }], {
        headers: {
          ...this.headers,
          accept: "text/x-component",
          "content-type": "text/plain;charset=UTF-8",
          "next-action": "1eeefc61e5469e1a173b48743a3cb8dd77eed91b",
          referer: `${this.baseURL}/app/image-to-image`
        }
      });
      const encryptedData = {
        taskCode: taskCode,
        type: "img2img",
        email: email || ""
      };
      return {
        task_id: await this.enc(encryptedData)
      };
    } catch (error) {
      console.error("Image-to-image generation error:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  async img2vid({
    prompt,
    imageUrl,
    positive_prompts = "",
    negative_prompts = "low quality, bad quality, blurry, pixelated, distorted, poorly drawn, out of focus",
    width = 1100,
    height = 733,
    frameRate = 24,
    videoLength = 5,
    videoFormat = "mp4",
    videoDimension = 768,
    model = 1,
    email = "",
    costCredits = 0,
    ...rest
  }) {
    try {
      const imageResponse = await axios.get(imageUrl, {
        responseType: "arraybuffer"
      });
      const imageBuffer = Buffer.from(imageResponse.data);
      const formData = new FormData();
      formData.append("file", new Blob([imageBuffer], {
        type: "image/jpeg"
      }), "uploaded_image.jpg");
      const uploadPayload = {
        positive_prompts: prompt + (positive_prompts ? "," + positive_prompts : ""),
        negative_prompts: negative_prompts,
        type: 5,
        width: width,
        height: height,
        frameRate: frameRate,
        videoLength: videoLength,
        videoFormat: videoFormat,
        videoDimension: videoDimension,
        model: model,
        email: email,
        costCredits: costCredits,
        ...rest
      };
      const encryptedParams = await this.encryption.encrypt(JSON.stringify(uploadPayload));
      formData.append("params", encryptedParams);
      const uploadResponse = await axios.post(this.uploadURL, formData, {
        headers: this.headers
      });
      if (!uploadResponse.data || !uploadResponse.data.code) {
        throw new Error("Failed to get task code from upload");
      }
      const taskCode = uploadResponse.data.code;
      const submitPayload = {
        type: 5,
        code: taskCode,
        email: email || "",
        model: model
      };
      const encryptedSubmit = await this.encryption.encrypt(JSON.stringify(submitPayload));
      const submitResponse = await axios.post(`${this.baseURL}/app/image-to-video`, [{
        params: encryptedSubmit
      }], {
        headers: {
          ...this.headers,
          accept: "text/x-component",
          "content-type": "text/plain;charset=UTF-8",
          "next-action": "1eeefc61e5469e1a173b48743a3cb8dd77eed91b",
          referer: `${this.baseURL}/app/image-to-video`
        }
      });
      const encryptedData = {
        taskCode: taskCode,
        type: "img2vid",
        email: email || ""
      };
      return {
        task_id: await this.enc(encryptedData)
      };
    } catch (error) {
      console.error("Image-to-video generation error:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  async status({
    task_id,
    ...rest
  }) {
    try {
      const decryptedData = await this.dec(task_id);
      const {
        taskCode,
        type,
        email
      } = decryptedData;
      const statusPayload = {
        type: this.getTypeNumber(type),
        code: taskCode,
        email: email,
        ...rest
      };
      const encryptedStatus = await this.encryption.encrypt(JSON.stringify(statusPayload));
      const endpoint = this.getStatusEndpoint(type);
      const response = await axios.post(`${this.baseURL}${endpoint}`, [{
        params: encryptedStatus
      }], {
        headers: {
          ...this.headers,
          accept: "text/x-component",
          "content-type": "text/plain;charset=UTF-8",
          "next-action": "1eeefc61e5469e1a173b48743a3cb8dd77eed91b",
          referer: `${this.baseURL}${endpoint.replace("/app/", "/app")}`
        }
      });
      return response.data;
    } catch (error) {
      console.error("Status check error:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  getTypeNumber(type) {
    const typeMap = {
      txt2img: 1,
      img2img: 4,
      img2vid: 5
    };
    return typeMap[type] || 1;
  }
  getStatusEndpoint(type) {
    const endpointMap = {
      txt2img: "/app/text-to-image",
      img2img: "/app/image-to-image",
      img2vid: "/app/image-to-video"
    };
    return endpointMap[type] || "/app/text-to-image";
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
        action: "txt2img | img2img | img2vid | status"
      }
    });
  }
  const generator = new VheerAPI();
  try {
    let result;
    switch (action) {
      case "txt2img":
        if (!params.prompt) {
          return res.status(400).json({
            error: `Missing required field: prompt (required for ${action})`
          });
        }
        result = await generator.txt2img(params);
        break;
      case "img2img":
        if (!params.prompt || !params.imageUrl) {
          return res.status(400).json({
            error: `Missing required field: prompt, imageUrl (required for ${action})`
          });
        }
        result = await generator.img2img(params);
        break;
      case "img2vid":
        if (!params.prompt || !params.imageUrl) {
          return res.status(400).json({
            error: `Missing required field: prompt, imageUrl (required for ${action})`
          });
        }
        result = await generator.img2vid(params);
        break;
      case "status":
        if (!params.task_id) {
          return res.status(400).json({
            error: `Missing required fields: task_id (required for ${action})`
          });
        }
        result = await generator.status(params);
        break;
      default:
        return res.status(400).json({
          error: `Invalid action: ${action}. Allowed: txt2img | img2img | img2vid | status`
        });
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      error: `Processing error: ${error.message}`
    });
  }
}