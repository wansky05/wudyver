import axios from "axios";
class BraveSearchAPI {
  constructor() {
    this.baseURL = "https://search.brave.com";
    this.cookies = new Map();
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 3e4,
      maxRedirects: 10,
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "id-ID,id;q=0.9",
        "sec-ch-ua": '"Lemur";v="135", "", "", "Microsoft Edge Simulate";v="135"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36"
      }
    });
    this.api.interceptors.response.use(r => (r.headers["set-cookie"] && this.updC(r.headers["set-cookie"]), r), e => Promise.reject(e));
    this.api.interceptors.request.use(c => (this.cookies.size > 0 && (c.headers["Cookie"] = Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ")), c), e => Promise.reject(e));
  }
  _parse(raw) {
    const texts = [];
    const jsons = {};
    raw.split("\n").forEach(line => {
      const trimL = line.trim();
      if (!trimL) return;
      try {
        let parsed;
        try {
          parsed = JSON.parse(trimL);
        } catch (jsonErr) {
          if (trimL.startsWith('"') && trimL.endsWith('"')) {
            parsed = JSON.parse(trimL);
          } else {
            throw jsonErr;
          }
        }
        if (typeof parsed === "object" && parsed !== null && parsed.type?.length > 0) {
          (jsons[parsed.type] = jsons[parsed.type] || []).push(parsed);
        } else if (typeof parsed === "string") {
          texts.push(this.unescapeString(parsed));
          console.warn(`[BRAVE] JSON string parsed, added to 'result': ${trimL}`);
        } else {
          texts.push(this.unescapeString(String(parsed)));
          console.warn(`[BRAVE] Unhandled parsed data type, added to 'result': ${trimL}`);
        }
      } catch (e) {
        texts.push(this.unescapeString(trimL));
        console.warn(`[BRAVE] Line not parsed as JSON, added to 'result': ${trimL}`);
      }
    });
    return {
      result: texts.join(""),
      ...jsons
    };
  }
  unescapeString(str) {
    str = str.replace(/\\n/g, "\n");
    str = str.replace(/\\"/g, '"');
    str = str.replace(/\\\\/g, "\\");
    return str;
  }
  updC(hdrs) {
    try {
      hdrs.forEach(cookie => {
        const match = cookie.match(/^([^=]+)=([^;]+)/);
        if (match) this.cookies.set(match[1].trim(), match[2].trim());
      });
      console.log("[BRAVE] Cookies updated.");
    } catch (e) {
      console.error("[BRAVE] Error updating cookies:", e.message);
    }
  }
  async srch(query, opts = {}) {
    try {
      console.log(`[BRAVE] Initial search for: "${query}"`);
      const res = await this.api.get("/search", {
        params: {
          q: query,
          source: "llmSuggest",
          summary: "1",
          ...opts
        }
      });
      const {
        chatllmData,
        conversationId
      } = this.extD(res.data);
      if (!chatllmData || !conversationId) throw new Error("Failed to extract chatllm data or conversation ID.");
      console.log(`[BRAVE] Extracted chatllm data: ${chatllmData ? "SUCCESS" : "FAILED"}`);
      console.log(`[BRAVE] Extracted conversation ID: ${conversationId}`);
      return {
        chatllmData: chatllmData,
        conversationId: conversationId
      };
    } catch (e) {
      console.error(`[BRAVE] Initial search error: ${e.message}`);
      throw new Error(`Initial search failed: ${e.message}`);
    }
  }
  extD(html) {
    let match;
    const regex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    while ((match = regex.exec(html)) !== null) {
      const content = match[1];
      if (content.includes("chatllm:")) {
        let cursor = content.indexOf("chatllm:");
        let area = content.substring(cursor);
        const keyM = area.match(/key:\s*"((?:[^"\\]|\\.)*)"/);
        if (!keyM) continue;
        const key = keyM[1];
        cursor += keyM.index + keyM[0].length;
        area = content.substring(cursor);
        const queryM = area.match(/query:\s*"((?:[^"\\]|\\.)*)"/);
        if (!queryM) continue;
        const query = queryM[1];
        cursor += queryM.index + queryM[0].length;
        area = content.substring(cursor);
        const nonceM = area.match(/nonce:\s*"([^"]*)"/);
        const nonce = nonceM ? nonceM[1] : null;
        if (nonceM) cursor += nonceM.index + nonceM[0].length;
        area = content.substring(cursor);
        const convM = area.match(/conversation:\s*"([^"]*)"/);
        if (!convM) continue;
        const convId = convM[1];
        return {
          chatllmData: {
            type: "chatllm",
            key: key,
            query: query,
            nonce: nonce
          },
          conversationId: convId
        };
      }
    }
    console.warn("[BRAVE] No chatllm data or conversation ID found.");
    return {
      chatllmData: null,
      conversationId: null
    };
  }
  async chat({
    prompt,
    conversationId = null,
    rich = true,
    country = "id",
    followup = null,
    index = 1,
    ...rest
  }) {
    try {
      console.log(`\n--- CHAT START ---`);
      let currentConversationId = conversationId;
      let chatllmKey = null;
      if (!currentConversationId || !prompt) {
        if (!prompt) {
          throw new Error("Prompt is required for initial search or if no conversationId is provided.");
        }
        const {
          chatllmData,
          conversationId: newConvId
        } = await this.srch(prompt, {
          country: country,
          ...rest
        });
        currentConversationId = newConvId;
        chatllmKey = typeof chatllmData.key === "string" ? chatllmData.key.replace(/\\"/g, '"').replace(/\\\\/g, "\\") : chatllmData.key;
      } else {
        console.warn("[BRAVE] Reusing existing conversationId. Ensure 'key' is handled correctly if not derived from initial search.");
      }
      const combinedResult = {};
      try {
        console.log(`[BRAVE] Fetching suggest data for "${prompt}"...`);
        const suggestRes = await this.api.get("/api/suggest", {
          params: {
            q: prompt,
            rich: rich,
            source: "web",
            country: country
          }
        });
        if (suggestRes.status === 200 && suggestRes.data) {
          combinedResult.suggest = suggestRes.data;
        } else {
          console.warn("[BRAVE] No suggest data or received empty response.");
        }
      } catch (e) {
        console.error(`[BRAVE] Error fetching suggest data: ${e.message}`);
      }
      if (chatllmKey && currentConversationId) {
        try {
          console.log(`[BRAVE] Fetching chatllm data...`);
          const chatllmRes = await this.api.get("/api/chatllm", {
            params: {
              key: chatllmKey,
              conversation: currentConversationId,
              ...rest
            }
          });
          if (chatllmRes.status === 200 && chatllmRes.data) {
            combinedResult.chatllm = this._parse(chatllmRes.data);
          } else {
            console.warn("[BRAVE] No chatllm data or received empty response.");
          }
        } catch (e) {
          console.error(`[BRAVE] Error fetching chatllm data: ${e.message}`);
        }
        try {
          console.log(`[BRAVE] Fetching enrichments data...`);
          const enrichmentsRes = await this.api.get("/api/chatllm/enrichments", {
            params: {
              key: chatllmKey,
              conversation: currentConversationId,
              ...rest
            }
          });
          if (enrichmentsRes.status === 200 && enrichmentsRes.data) {
            combinedResult.enrichments = enrichmentsRes.data;
          } else {
            console.warn("[BRAVE] No enrichments data or received empty response.");
          }
        } catch (e) {
          console.error(`[BRAVE] Error fetching enrichments data: ${e.message}`);
        }
        if (followup) {
          try {
            console.log(`[BRAVE] Fetching conversation data for followup "${followup}" (index: ${index})...`);
            const conversationRes = await this.api.get("/api/chatllm/conversation", {
              params: {
                key: chatllmKey,
                conversation: currentConversationId,
                index: index,
                followup: followup,
                ...rest
              }
            });
            if (conversationRes.status === 200 && conversationRes.data) {
              combinedResult.conversation = this._parse(conversationRes.data);
            } else {
              console.warn("[BRAVE] No conversation data or received empty response for followup.");
            }
          } catch (e) {
            console.error(`[BRAVE] Error fetching conversation data: ${e.message}`);
          }
        } else {
          console.log("[BRAVE] No followup query provided for conversation endpoint.");
        }
      } else {
        console.warn("[BRAVE] Skipping chatllm, enrichments, and conversation calls because chatllmKey or conversationId is missing after initial search or not provided.");
      }
      console.log(`--- CHAT END ---\n`);
      return combinedResult;
    } catch (e) {
      console.error(`[BRAVE] Chat error: ${e.message}`);
      console.error(`--- CHAT FAILED ---\n`);
      throw new Error(`Chat failed: ${e.message}`);
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
    const api = new BraveSearchAPI();
    const response = await api.chat(params);
    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}