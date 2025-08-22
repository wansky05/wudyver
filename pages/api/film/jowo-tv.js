import axios from "axios";
import crypto from "crypto";
class JowoDramaAPI {
  constructor(auto_cache = true) {
    this.api = {
      base: "https://us-drama-api.pixtv.cc",
      endpoints: {
        init: "/Android/Users/init",
        list: "/Android/VideoCenter/getVideoList",
        drama: "/Android/VideoCenter/getVideoDrama",
        get_user_info: "/Android/Users/getUserInfo"
      }
    };
    this.block_map = {
      selected: 1,
      hot: 5,
      new: 6,
      male: 7,
      female: 8,
      original: 9
    };
    this.headers = {
      "user-agent": "NB Android/1.0.0",
      "accept-encoding": "gzip",
      "content-type": "application/json"
    };
    this.user_cache = null;
    this.device_cache = null;
    this.cache_enabled = auto_cache;
    if (auto_cache) {
      console.log("Auto cache enabled");
    }
  }
  async ensure_initialized() {
    try {
      if (this.cache_enabled && this.user_cache) {
        console.log("Using cached session");
        return true;
      }
      console.log("Initializing session...");
      this.device_cache = this.generate_device();
      const headers = {
        ...this.headers,
        aid: this.device_cache.aid,
        gaid: this.device_cache.gaid,
        adjustgaid: "",
        channel: "google",
        source: "android",
        version: "1.0.45",
        vcode: "60",
        language: "en",
        ts: Math.floor(Date.now() / 1e3).toString(),
        systemversion: this.device_cache.systemversion
      };
      const {
        data
      } = await axios.post(`${this.api.base}${this.api.endpoints.init}`, {
        aid: this.device_cache.aid
      }, {
        headers: headers,
        timeout: 1e4,
        validateStatus: status => status < 500
      });
      if (!data?.data?.token) {
        throw new Error(`Invalid init response: ${JSON.stringify(data)}`);
      }
      const token = data.data.token;
      const user_info = await this.get_user_info_internal(token, headers);
      this.user_cache = {
        token: token,
        headers: headers,
        info: user_info
      };
      console.log("Session initialized successfully");
      return true;
    } catch (error) {
      console.error("Failed to initialize session:", error.message);
      if (error.response?.status === 401) {
        throw new Error("Authentication failed during initialization");
      }
      if (error.code === "ECONNABORTED") {
        throw new Error("Connection timeout during initialization");
      }
      throw new Error(`Initialization failed: ${error.message}`);
    }
  }
  async handle_auth_error(method_name, retry_callback) {
    try {
      console.log(`Token expired in ${method_name}, reinitializing...`);
      this.user_cache = null;
      return await retry_callback();
    } catch (retry_error) {
      console.error(`Retry failed in ${method_name}:`, retry_error.message);
      throw retry_error;
    }
  }
  generate_device() {
    try {
      const brands = {
        Oppo: ["CPH2699", "CPH2739", "CPH2735"],
        Xiaomi: ["2407FPN8EG", "24116RNC1I", "25057RN09E"],
        Samsung: ["SM-A566V", "SM-A176B", "SM-E366B"],
        Realme: ["RMX3562", "RMX3286", "RMX3286"]
      };
      const versions = ["12", "13", "14"];
      const brand_keys = Object.keys(brands);
      const brand = brand_keys[Math.floor(Math.random() * brand_keys.length)];
      const model = brands[brand][Math.floor(Math.random() * brands[brand].length)];
      const version = versions[Math.floor(Math.random() * versions.length)];
      return {
        aid: Array.from({
          length: 16
        }, () => Math.random().toString(36).charAt(2)).join(""),
        gaid: crypto.randomUUID(),
        systemversion: `${brand}|${model}|${version}`
      };
    } catch (error) {
      console.error("Failed to generate device:", error.message);
      throw new Error("Device generation failed");
    }
  }
  async get_user_info_internal(token, headers) {
    try {
      const head = {
        ...headers,
        token: token,
        ts: Math.floor(Date.now() / 1e3).toString()
      };
      const {
        data
      } = await axios.post(`${this.api.base}${this.api.endpoints.get_user_info}`, {}, {
        headers: head,
        timeout: 1e4,
        validateStatus: status => status < 500
      });
      if (!data?.data) {
        throw new Error("Invalid user info response");
      }
      return data.data;
    } catch (error) {
      console.error("Failed to get user info internally:", error.message);
      if (error.response?.status === 401) {
        throw new Error("Unauthorized access to user info");
      }
      throw error;
    }
  }
  async get_user_info() {
    try {
      await this.ensure_initialized();
      console.log("Fetching user info...");
      const user_info = await this.get_user_info_internal(this.user_cache.token, this.user_cache.headers);
      this.user_cache.info = user_info;
      console.log("User info retrieved successfully");
      return {
        success: true,
        code: 200,
        result: user_info
      };
    } catch (error) {
      console.error("Error getting user info:", error.message);
      if (error.response?.status === 401) {
        return await this.handle_auth_error("get_user_info", () => this.get_user_info());
      }
      return {
        success: false,
        code: error.response?.status || 500,
        result: {
          error: "Failed to get user information",
          details: error.message
        }
      };
    }
  }
  async list({
    category,
    block_id,
    vid,
    page = 1,
    page_size = 10,
    ...rest
  } = {}) {
    try {
      await this.ensure_initialized();
      console.log(`Fetching video list - Category: ${category || "N/A"}, Page: ${page}`);
      const resolved_block_id = block_id || this.block_map[category];
      if (!resolved_block_id) {
        const valid_categories = Object.keys(this.block_map).join(", ");
        return {
          success: false,
          code: 400,
          result: {
            error: `Invalid category. Available: ${valid_categories}`
          }
        };
      }
      const headers = {
        ...this.user_cache.headers,
        token: this.user_cache.token,
        ts: Math.floor(Date.now() / 1e3).toString()
      };
      const payload = {
        blockId: resolved_block_id.toString(),
        page: page.toString(),
        pageSize: page_size.toString(),
        vid: vid?.toString() || "",
        ...rest
      };
      console.log("Making video list request...");
      const {
        data
      } = await axios.post(`${this.api.base}${this.api.endpoints.list}`, payload, {
        headers: headers,
        timeout: 15e3,
        validateStatus: status => status < 500
      });
      if (!data?.data) {
        throw new Error("Invalid list response");
      }
      const videos = data.data.list || [];
      console.log(`Retrieved ${videos.length} videos`);
      return {
        success: true,
        code: 200,
        result: {
          mode: vid ? "season" : "category",
          category: category || null,
          block_id: resolved_block_id,
          vid: vid || null,
          page: page,
          page_size: page_size,
          total: videos.length,
          videos: videos.map(v => ({
            title: v.name,
            vid: v.vid,
            thumb: v.thumb,
            is_free: v.is_free,
            episode_count: v.publishCount
          }))
        }
      };
    } catch (error) {
      console.error("Error fetching video list:", error.message);
      if (error.response?.status === 401) {
        return await this.handle_auth_error("list", () => this.list({
          category: category,
          block_id: block_id,
          vid: vid,
          page: page,
          page_size: page_size,
          ...rest
        }));
      }
      return {
        success: false,
        code: error.response?.status || 500,
        result: {
          error: "Failed to fetch video list",
          details: error.message
        }
      };
    }
  }
  async info({
    vid = "",
    ...rest
  }) {
    try {
      if (!vid || typeof vid !== "string") {
        return {
          success: false,
          code: 400,
          result: {
            error: "Video ID is required and must be a string"
          }
        };
      }
      await this.ensure_initialized();
      console.log(`Fetching drama details for VID: ${vid}`);
      const headers = {
        ...this.user_cache.headers,
        token: this.user_cache.token,
        ts: Math.floor(Date.now() / 1e3).toString()
      };
      const payload = {
        vid: vid,
        ...rest
      };
      console.log("Making drama details request...");
      const {
        data
      } = await axios.post(`${this.api.base}${this.api.endpoints.drama}`, payload, {
        headers: headers,
        timeout: 15e3,
        validateStatus: status => status < 500
      });
      if (!data?.data) {
        throw new Error("Invalid drama response");
      }
      const episodes = data.data.list || [];
      console.log(`Retrieved ${episodes.length} episodes`);
      return {
        success: true,
        code: 200,
        result: {
          vid: vid,
          total_episodes: episodes.length,
          episodes: episodes.map(ep => ({
            id: ep.id,
            drama_num: ep.dramaNum,
            play_url: ep.playUrl,
            thumb: ep.thumb,
            price: ep.price,
            unlock: ep.unlock,
            subtitles_url: ep.subtitlesUrl || null
          }))
        }
      };
    } catch (error) {
      console.error("Error fetching drama details:", error.message);
      if (error.response?.status === 401) {
        return await this.handle_auth_error("drama", () => this.drama(vid, ...rest));
      }
      return {
        success: false,
        code: error.response?.status || 500,
        result: {
          error: "Failed to fetch drama details",
          details: error.message
        }
      };
    }
  }
  get_categories() {
    try {
      return Object.keys(this.block_map);
    } catch (error) {
      console.error("Failed to get categories:", error.message);
      return [];
    }
  }
  clear_cache() {
    try {
      this.user_cache = null;
      this.device_cache = null;
      console.log("Cache cleared successfully");
    } catch (error) {
      console.error("Failed to clear cache:", error.message);
    }
  }
  enable_cache() {
    try {
      this.cache_enabled = true;
      console.log("Cache enabled");
    } catch (error) {
      console.error("Failed to enable cache:", error.message);
    }
  }
  disable_cache() {
    try {
      this.cache_enabled = false;
      this.clear_cache();
      console.log("Cache disabled");
    } catch (error) {
      console.error("Failed to disable cache:", error.message);
    }
  }
  get_cache_status() {
    return {
      cache_enabled: this.cache_enabled,
      has_user_cache: !!this.user_cache,
      has_device_cache: !!this.device_cache
    };
  }
}
export default async function handler(req, res) {
  const {
    action,
    ...params
  } = req.method === "GET" ? req.query : req.body;
  const jowo = new JowoDramaAPI();
  try {
    let result;
    switch (action) {
      case "list":
        if (!params.category) {
          return res.status(400).json({
            error: "category parameter is required for list"
          });
        }
        result = await jowo.list(params);
        break;
      case "info":
        if (!params.vid) {
          return res.status(400).json({
            error: "vid parameter is required for info"
          });
        }
        result = await jowo.info(params);
        break;
      default:
        return res.status(400).json({
          error: `Invalid action: ${action}. Allowed: list | info`
        });
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      error: "An error occurred",
      details: error.message
    });
  }
}