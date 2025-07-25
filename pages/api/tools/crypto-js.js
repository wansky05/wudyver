import CryptoJS from "crypto-js";
class CryptoDynamic {
  async call(method, ...args) {
    try {
      const [mainKey, subKey] = method.toLowerCase().split(".");
      const groupKey = Object.keys(CryptoJS).find(k => k.toLowerCase() === mainKey);
      if (!groupKey) return `Invalid group: ${mainKey}`;
      const group = CryptoJS[groupKey];
      if (!group) return `Group not found: ${groupKey}`;
      const fn = subKey ? group?.[subKey] : group;
      if (typeof fn !== "function") return `Invalid method: ${method}`;
      const result = fn(...args);
      if (result?.toString) {
        const utf8 = result.toString(CryptoJS.enc.Utf8);
        return utf8 || result.toString();
      }
      return result;
    } catch (e) {
      return `Error in call(): ${e.message}`;
    }
  }
  async hash(type, data) {
    try {
      const fn = Object.keys(CryptoJS).find(k => k.toLowerCase() === type.toLowerCase());
      if (!fn || typeof CryptoJS[fn] !== "function") return `Invalid hash type: ${type}`;
      return CryptoJS[fn](data).toString();
    } catch (e) {
      return `Error in hash(): ${e.message}`;
    }
  }
  async hmac(type, data, key) {
    try {
      const fn = Object.keys(CryptoJS).find(k => k.toLowerCase() === "hmac" + type.toLowerCase());
      if (!fn || typeof CryptoJS[fn] !== "function") return `Invalid hmac type: ${type}`;
      return CryptoJS[fn](data, key).toString();
    } catch (e) {
      return `Error in hmac(): ${e.message}`;
    }
  }
  async encrypt(type, text, key) {
    try {
      const group = Object.keys(CryptoJS).find(k => k.toLowerCase() === type.toLowerCase());
      const fn = CryptoJS[group];
      if (!fn || typeof fn.encrypt !== "function") return `Invalid encrypt type: ${type}`;
      return fn.encrypt(text, key).toString();
    } catch (e) {
      return `Error in encrypt(): ${e.message}`;
    }
  }
  async decrypt(type, ciphertext, key) {
    try {
      const group = Object.keys(CryptoJS).find(k => k.toLowerCase() === type.toLowerCase());
      const fn = CryptoJS[group];
      if (!fn || typeof fn.decrypt !== "function") return `Invalid decrypt type: ${type}`;
      const bytes = fn.decrypt(ciphertext, key);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (e) {
      return `Error in decrypt(): ${e.message}`;
    }
  }
  async encode(type, text) {
    try {
      const enc = Object.keys(CryptoJS.enc).find(k => k.toLowerCase() === type.toLowerCase());
      if (!enc) return `Invalid encode type: ${type}`;
      const parsed = CryptoJS.enc.Utf8.parse(text);
      return CryptoJS.enc[enc].stringify(parsed);
    } catch (e) {
      return `Error in encode(): ${e.message}`;
    }
  }
  async decode(type, encodedText) {
    try {
      const enc = Object.keys(CryptoJS.enc).find(k => k.toLowerCase() === type.toLowerCase());
      if (!enc) return `Invalid decode type: ${type}`;
      const parsed = CryptoJS.enc[enc].parse(encodedText);
      return parsed.toString(CryptoJS.enc.Utf8);
    } catch (e) {
      return `Error in decode(): ${e.message}`;
    }
  }
  async list() {
    try {
      const core = Object.keys(CryptoJS);
      const enc = Object.keys(CryptoJS.enc);
      const methods = core.map(k => {
        const val = CryptoJS[k];
        if (typeof val === "function") return k;
        if (typeof val === "object") {
          const sub = Object.keys(val).filter(f => typeof val[f] === "function");
          return sub.map(s => `${k}.${s}`);
        }
        return null;
      }).flat().filter(Boolean);
      return {
        actions: ["call", "hash", "hmac", "encrypt", "decrypt", "encode", "decode", "list"],
        hashes: core.filter(k => /^sha|md5|ripemd/i.test(k)),
        hmacs: core.filter(k => /^hmac/i.test(k)),
        ciphers: core.filter(k => /aes|des|tripledes|rc4|rabbit/i.test(k)),
        encodings: enc,
        methods: methods
      };
    } catch (e) {
      return `Error in list(): ${e.message}`;
    }
  }
}
export default async function handler(req, res) {
  const crypto = new CryptoDynamic();
  const {
    action,
    method,
    args = [],
    type,
    data,
    key,
    text
  } = req.body || {};
  try {
    let result;
    if (action === "call") result = await crypto.call(method, ...args);
    else if (action === "hash") result = await crypto.hash(type, data);
    else if (action === "hmac") result = await crypto.hmac(type, data, key);
    else if (action === "encrypt") result = await crypto.encrypt(type, data || text, key);
    else if (action === "decrypt") result = await crypto.decrypt(type, data || text, key);
    else if (action === "encode") result = await crypto.encode(type, text);
    else if (action === "decode") result = await crypto.decode(type, text);
    else if (action === "list") result = await crypto.list();
    else return res.status(400).json({
      error: "Invalid action"
    });
    return res.status(200).json({
      result: result
    });
  } catch (e) {
    return res.status(500).json({
      error: "Server error",
      message: e.message
    });
  }
}