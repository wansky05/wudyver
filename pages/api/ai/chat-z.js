import axios from "axios";
class ChatZAI {
  constructor() {
    this.spoofedIP = this.randomIP();
    this.axios = axios.create({
      baseURL: "https://chat.z.ai/api",
      headers: {
        Accept: "*/*",
        "Accept-Language": "id-ID,id;q=0.9",
        Connection: "keep-alive",
        "Content-Type": "application/json",
        Referer: "https://chat.z.ai/",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
        "sec-ch-ua": '"Lemur";v="135", "", "", "Microsoft Edge Simulate";v="135"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "X-Forwarded-For": this.spoofedIP,
        "X-Real-IP": this.spoofedIP,
        "X-Originating-IP": this.spoofedIP,
        "X-Remote-IP": this.spoofedIP,
        "X-Remote-Addr": this.spoofedIP
      }
    });
    this.token = null;
    this.cookies = {
      date: new Date().toISOString().slice(0, 10),
      ip: this.spoofedIP
    };
    console.log(`🌐 ChatZAI Client initialized with spoofed IP: ${this.spoofedIP}`);
  }
  randomIP() {
    return Array.from({
      length: 4
    }, () => Math.floor(Math.random() * 256)).join(".");
  }
  parseArray(dataArray) {
    const result = {};
    dataArray.forEach(item => {
      const phase = item.data?.phase || "unknown";
      if (!result[phase]) {
        result[phase] = {
          content: ""
        };
      }
      if (item.data) {
        for (const prop in item.data) {
          if (Object.prototype.hasOwnProperty.call(item.data, prop)) {
            if (prop === "delta_content" || prop === "edit_content") {
              result[phase].content += item.data[prop];
            } else if (typeof item.data[prop] === "object" && !Array.isArray(item.data[prop]) && prop !== "choices") {
              result[phase][prop] = {
                ...result[phase][prop],
                ...item.data[prop]
              };
            } else {
              result[phase][prop] = item.data[prop];
            }
          }
        }
      }
    });
    return result;
  }
  parseData(rawData) {
    const lines = rawData.split("\n");
    const parsedData = lines.filter(line => line.startsWith("data:")).map(line => {
      const jsonString = line.slice(5);
      try {
        const data = JSON.parse(jsonString);
        return data;
      } catch (error) {
        console.error("❌ Error parsing JSON:", error);
        return null;
      }
    }).filter(data => data !== null);
    return this.parseArray(parsedData);
  }
  guestCredentials() {
    const timestamp = Date.now();
    return {
      id: this.genUUID(),
      email: `Guest-${timestamp}@guest.com`,
      name: `Guest-${timestamp}`,
      timestamp: timestamp
    };
  }
  genUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == "x" ? r : r & 3 | 8;
      return v.toString(16);
    });
  }
  getCookieString() {
    return Object.entries(this.cookies).map(([key, value]) => `${key}=${value}`).join("; ");
  }
  async authenticate() {
    console.log("🔐 Authenticating with spoofed IP:", this.spoofedIP);
    try {
      const response = await this.axios.get("/v1/auths/", {
        headers: {
          Cookie: this.getCookieString()
        }
      });
      const authData = response.data;
      this.token = authData.token;
      this.cookies.token = this.token;
      console.log("✅ Authentication successful");
      console.log("👤 Guest ID:", authData.id);
      console.log("📧 Guest Email:", authData.email);
      console.log("🎯 Token obtained");
      return authData;
    } catch (error) {
      console.error("❌ Authentication failed:", error.response?.data || error.message);
      throw error;
    }
  }
  async ensureAuthenticated() {
    if (!this.token) {
      console.log("🔐 No token found, auto-authenticating...");
      await this.authenticate();
    }
    return this.token;
  }
  async chat({
    prompt,
    messages,
    model,
    ...options
  }) {
    await this.ensureAuthenticated();
    const guestCreds = this.guestCredentials();
    const payloadMessages = messages && messages.length > 0 ? messages : [{
      role: "user",
      content: prompt
    }];
    const chatData = {
      stream: true,
      model: model || "0727-360B-API",
      messages: payloadMessages,
      params: {},
      tool_servers: [],
      features: {
        image_generation: false,
        code_interpreter: false,
        web_search: false,
        auto_web_search: false,
        preview_mode: true,
        flags: [],
        features: [{
          type: "mcp",
          server: "vibe-coding",
          status: "hidden"
        }, {
          type: "mcp",
          server: "ppt-maker",
          status: "hidden"
        }, {
          type: "mcp",
          server: "image-search",
          status: "hidden"
        }]
      },
      variables: {
        "{{USER_NAME}}": guestCreds.name,
        "{{USER_LOCATION}}": "Unknown",
        "{{CURRENT_DATETIME}}": new Date().toISOString().slice(0, 19).replace("T", " "),
        "{{CURRENT_DATE}}": new Date().toISOString().slice(0, 10),
        "{{CURRENT_TIME}}": new Date().toTimeString().slice(0, 8),
        "{{CURRENT_WEEKDAY}}": new Date().toLocaleDateString("en-US", {
          weekday: "long"
        }),
        "{{CURRENT_TIMEZONE}}": "Asia/Makassar",
        "{{USER_LANGUAGE}}": "en-US"
      },
      model_item: {
        id: "0727-360B-API",
        name: "GLM-4.5",
        owned_by: "openai",
        openai: {
          id: "0727-360B-API",
          name: "0727-360B-API",
          owned_by: "openai",
          openai: {
            id: "0727-360B-API"
          },
          urlIdx: 1
        },
        urlIdx: 1,
        info: {
          id: "0727-360B-API",
          user_id: "7080a6c5-5fcc-4ea4-a85f-3b3fac905cf2",
          base_model_id: null,
          name: "GLM-4.5",
          params: {
            top_p: .95,
            temperature: .6,
            max_tokens: 8e4
          },
          meta: {
            profile_image_url: "/static/favicon.png",
            description: "Most advanced model, proficient in coding and tool use",
            capabilities: {
              vision: false,
              citations: false,
              preview_mode: false,
              web_search: false,
              language_detection: false,
              restore_n_source: false,
              mcp: true,
              file_qa: true,
              returnFc: true,
              returnThink: true
            }
          }
        }
      },
      chat_id: "local",
      id: this.genUUID(),
      ...options
    };
    try {
      console.log(`💬 Sending chat request from IP: ${this.spoofedIP}`);
      const response = await this.axios.post("/chat/completions", chatData, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Origin: "https://chat.z.ai",
          "X-FE-Version": "prod-fe-1.0.52",
          Cookie: this.getCookieString()
        }
      });
      console.log("✅ Chat completion successful");
      return this.parseData(response.data);
    } catch (error) {
      console.error("❌ Chat completion failed:", error.response?.data || error.message);
      if (error.response?.status === 401 && this.token) {
        console.log("🔄 Token expired, clearing and retrying...");
        this.token = null;
        return this.chat({
          prompt: prompt,
          messages: messages,
          model: model,
          ...options
        });
      }
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
    const client = new ChatZAI();
    const response = await client.chat(params);
    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}