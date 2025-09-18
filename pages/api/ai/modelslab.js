import axios from "axios";
class ModelsLab {
  constructor() {
    this.keys = null;
    this.is_initialized = false;
    this.api_url = "https://apikey-api.vercel.app/apiKey";
    this.base_url = "https://modelslab.com/api/v6";
    this.client = axios.create({
      baseURL: this.base_url,
      timeout: 12e4,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  _log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const safeData = JSON.parse(JSON.stringify(data || {}));
    if (safeData?.payload?.key) {
      safeData.payload.key = "***";
    }
    console.log(`[${timestamp}] [ModelsLab] [${level.toUpperCase()}] ${message}`, data ? safeData : "");
  }
  async _initialize_keys() {
    try {
      this._log("info", "Fetching API keys...");
      const response = await axios.get(this.api_url);
      if (response.status !== 200) throw new Error(`HTTP error: ${response.status}`);
      const data = response.data.data;
      this.keys = {
        txt2img: data[79]?.apiKey || null,
        txt2vid: data[80]?.apiKey || null
      };
      if (!this.keys.txt2img && !this.keys.txt2vid) {
        throw new Error("No valid API keys found.");
      }
      this.is_initialized = true;
      this._log("info", "API keys initialized successfully.");
    } catch (error) {
      this._log("error", "Key initialization failed.", {
        message: error.message
      });
      throw new Error(`Key initialization failed: ${error.message}`);
    }
  }
  async _ensure_auth() {
    if (this.is_initialized) return;
    await this._initialize_keys();
  }
  async _request(endpoint, payload) {
    try {
      this._log("info", `Sending request to ${endpoint}`, {
        payload: payload
      });
      const response = await this.client.post(endpoint, payload);
      this._log("info", `Response from ${endpoint}`, {
        status: response.status
      });
      return response.data;
    } catch (error) {
      this._log("error", `Error calling ${endpoint}`, error?.response?.data || error.message);
      throw new Error(`API call to ${endpoint} failed: ${error?.response?.data?.message || error.message}`);
    }
  }
  _process_image(image_input) {
    if (!image_input) return null;
    if (Buffer.isBuffer(image_input)) return `data:image/jpeg;base64,${image_input.toString("base64")}`;
    if (typeof image_input === "string" && image_input.startsWith("data:image/")) return image_input;
    if (typeof image_input === "string" && !image_input.startsWith("http")) return `data:image/jpeg;base64,${image_input}`;
    return image_input;
  }
  async txt2img({
    prompt,
    realtime = true,
    ...rest
  }) {
    await this._ensure_auth();
    const endpoint = realtime ? "/realtime/text2img" : "/images/text2img";
    const base_payload = realtime ? {
      prompt: "ultra realistic close up portrait ((beautiful pale cyberpunk female with heavy black eyeliner))",
      negative_prompt: "bad quality",
      width: "512",
      height: "512",
      safety_checker: false,
      seed: null,
      samples: 1,
      base64: false,
      webhook: null,
      track_id: null
    } : {
      model_id: "flux",
      prompt: "ultra realistic close up portrait ((beautiful pale cyberpunk female with heavy black eyeliner)), blue eyes, shaved side haircut, hyper detail, cinematic lighting, magic neon, dark red city, Canon EOS R3, nikon, f/1.4, ISO 200, 1/160s, 8K, RAW, unedited, symmetrical balance, in-frame, 8K",
      negative_prompt: "bad quality",
      width: "512",
      height: "512",
      samples: "1",
      num_inference_steps: "31",
      safety_checker: "no",
      seed: null,
      guidance_scale: 7.5,
      clip_skip: "2",
      vae: null,
      webhook: null,
      track_id: null
    };
    const payload = {
      key: this.keys.txt2img || this.keys.txt2vid,
      ...base_payload,
      ...rest
    };
    if (prompt) payload.prompt = prompt;
    return this._request(endpoint, payload);
  }
  async img2img({
    prompt,
    imageUrl,
    realtime = true,
    ...rest
  }) {
    await this._ensure_auth();
    const endpoint = realtime ? "/realtime/img2img" : "/images/img2img";
    const base_payload = realtime ? {
      prompt: "a cat sitting on a bench",
      negative_prompt: "bad quality",
      init_image: null,
      width: "512",
      height: "512",
      samples: "1",
      temp: false,
      safety_checker: false,
      strength: .7,
      seed: null,
      webhook: null,
      track_id: null
    } : {
      init_image: null,
      init_image_2: null,
      prompt: "a girl from image one holding the can from image two",
      negative_prompt: "(worst quality:2), (low quality:2), (normal quality:2), (jpeg artifacts), (blurry), (duplicate), (morbid), (mutilated), (out of frame), (extra limbs), (bad anatomy), (disfigured), (deformed), (cross-eye), (glitch), (oversaturated), (overexposed), (underexposed), (bad proportions), (bad hands), (bad feet), (cloned face), (long neck), (missing arms), (missing legs), (extra fingers), (fused fingers), (poorly drawn hands), (poorly drawn face), (mutation), (deformed eyes), watermark, text, logo, signature, grainy, tiling, censored, nsfw, ugly, blurry eyes, noisy image, bad lighting, unnatural skin, asymmetry",
      model_id: "flux-kontext-dev",
      num_inference_steps: "28",
      strength: "0.5",
      guidance: "2.5",
      enhance_prompt: null
    };
    const payload = {
      key: this.keys.txt2img || this.keys.txt2vid,
      ...base_payload,
      ...rest
    };
    if (prompt) payload.prompt = prompt;
    payload.init_image = this._process_image(imageUrl);
    if (rest.init_image_2) payload.init_image_2 = this._process_image(rest.init_image_2);
    return this._request(endpoint, payload);
  }
  async txt2vid({
    prompt,
    ultra = false,
    ...rest
  }) {
    await this._ensure_auth();
    const endpoint = ultra ? "/video/text2video_ultra" : "/video/text2video";
    const base_payload = ultra ? {
      prompt: "Space Station in space",
      negative_prompt: "low quality",
      model_id: "wan2.1",
      resolution: 480,
      num_frames: 92,
      num_inference_steps: 8,
      guidance_scale: 1,
      shift_sample: 3,
      fps: 18,
      webhook: null,
      track_id: null
    } : {
      model_id: "cogvideox",
      prompt: "Space Station in space",
      negative_prompt: "low quality",
      height: 512,
      width: 512,
      num_frames: 25,
      num_inference_steps: 20,
      guidance_scale: 7,
      upscale_height: 640,
      upscale_width: 1024,
      upscale_strength: .6,
      upscale_guidance_scale: 12,
      upscale_num_inference_steps: 20,
      output_type: "gif",
      webhook: null,
      track_id: null
    };
    const payload = {
      key: this.keys.txt2vid || this.keys.txt2img,
      ...base_payload,
      ...rest
    };
    if (prompt) payload.prompt = prompt;
    return this._request(endpoint, payload);
  }
  async img2vid({
    prompt,
    imageUrl,
    ultra = false,
    ...rest
  }) {
    await this._ensure_auth();
    const endpoint = ultra ? "/video/img2video_ultra" : "/video/img2video";
    const base_payload = ultra ? {
      init_image: null,
      prompt: "moving character",
      model_id: "wan2.1",
      negative_prompt: "low quality",
      resolution: 320,
      num_frames: 92,
      num_inference_steps: 8,
      guidance_scale: 1,
      webhook: null,
      track_id: null
    } : {
      model_id: "svd",
      init_image: null,
      height: 512,
      width: 512,
      num_frames: 25,
      num_inference_steps: 20,
      min_guidance_scale: 1,
      max_guidance_scale: 3,
      motion_bucket_id: 20,
      noise_aug_strength: .02,
      webhook: null,
      track_id: null
    };
    const payload = {
      key: this.keys.txt2vid || this.keys.txt2img,
      ...base_payload,
      ...rest
    };
    if (prompt) payload.prompt = prompt;
    payload.init_image = this._process_image(imageUrl);
    return this._request(endpoint, payload);
  }
}
export default async function handler(req, res) {
  const {
    action,
    ...params
  } = req.method === "GET" ? req.query : req.body;
  if (!action) {
    return res.status(400).json({
      error: "Action is required."
    });
  }
  const api = new ModelsLab();
  try {
    let response;
    switch (action) {
      case "img2vid":
        if (!params.prompt || !params.imageUrl) {
          return res.status(400).json({
            error: "Prompt and imageUrl are required for img2vid."
          });
        }
        response = await api.img2vid(params);
        return res.status(200).json(response);
      case "txt2vid":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Prompt is required for txt2vid."
          });
        }
        response = await api.txt2vid(params);
        return res.status(200).json(response);
      case "img2img":
        if (!params.prompt || !params.imageUrl) {
          return res.status(400).json({
            error: "Prompt and imageUrl are required for img2img."
          });
        }
        response = await api.img2img(params);
        return res.status(200).json(response);
      case "txt2img":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Prompt is required for txt2img."
          });
        }
        response = await api.txt2img(params);
        return res.status(200).json(response);
      default:
        return res.status(400).json({
          error: `Invalid action: ${action}. Supported actions are 'img2vid', 'txt2vid', 'img2img', and 'txt2img'.`
        });
    }
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}