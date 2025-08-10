import {
  LRUCache
} from "lru-cache";
import CryptoJS from "crypto-js";
import apiConfig from "@/configs/apiConfig";
const uuidMapping = new LRUCache({
  max: 1e3,
  ttl: 1e3 * 60 * 60 * 12
});
class EncoderClient {
  constructor(key) {
    if (!key) {
      throw new Error("Kunci enkripsi harus disediakan.");
    }
    this.defaultKey = key;
    this.methods = ["aes", "combined"];
  }
  generateKey(length = 256) {
    return CryptoJS.lib.WordArray.random(length / 8).toString();
  }
  padKey(key, length = 32) {
    return key.padEnd(length, "0");
  }
  formatAsUUID(str) {
    const hash = CryptoJS.SHA256(str).toString();
    const uuid = [hash.substring(0, 8), hash.substring(8, 12), "4" + hash.substring(13, 16), (parseInt(hash.substring(16, 17), 16) & 3 | 8).toString(16) + hash.substring(17, 20), hash.substring(20, 32)].join("-");
    uuidMapping.set(uuid, str);
    return uuid;
  }
  parseFromUUID(uuid) {
    const value = uuidMapping.get(uuid);
    if (value === undefined) {
      throw new Error("UUID tidak ditemukan atau tidak valid");
    }
    return value;
  }
  encryptAES(text, key) {
    const paddedKey = this.padKey(key);
    const iv = CryptoJS.lib.WordArray.random(128 / 8);
    const encrypted = CryptoJS.AES.encrypt(text, paddedKey, {
      iv: iv
    });
    const combined = iv.toString() + ":" + encrypted.toString();
    return this.formatAsUUID(combined);
  }
  decryptAES(uuidText, key) {
    const paddedKey = this.padKey(key);
    const encryptedText = this.parseFromUUID(uuidText);
    const parts = encryptedText.split(":");
    if (parts.length !== 2) throw new Error("Format teks terenkripsi tidak valid");
    const iv = CryptoJS.enc.Hex.parse(parts[0]);
    const encrypted = parts[1];
    const decrypted = CryptoJS.AES.decrypt(encrypted, paddedKey, {
      iv: iv
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
  }
  encryptMultiLayer(text, key) {
    const paddedKey = this.padKey(key);
    const timestamp = Date.now().toString();
    const textWithTime = timestamp + "|" + text;
    const iv = CryptoJS.lib.WordArray.random(128 / 8);
    const encrypted = CryptoJS.AES.encrypt(textWithTime, paddedKey, {
      iv: iv
    });
    const aesEncrypted = iv.toString() + ":" + encrypted.toString();
    const base64Encoded = Buffer.from(aesEncrypted).toString("base64");
    const checksum = CryptoJS.MD5(base64Encoded + paddedKey).toString().substring(0, 8);
    const combined = checksum + "." + base64Encoded;
    return this.formatAsUUID(combined);
  }
  decryptMultiLayer(uuidText, key) {
    const paddedKey = this.padKey(key);
    const encryptedText = this.parseFromUUID(uuidText);
    const parts = encryptedText.split(".");
    if (parts.length !== 2) throw new Error("Format multi-layer tidak valid");
    const checksum = parts[0];
    const base64Data = parts[1];
    const expectedChecksum = CryptoJS.MD5(base64Data + paddedKey).toString().substring(0, 8);
    if (checksum !== expectedChecksum) {
      throw new Error("Checksum tidak valid - kunci salah");
    }
    const aesEncrypted = Buffer.from(base64Data, "base64").toString();
    const aesParts = aesEncrypted.split(":");
    if (aesParts.length !== 2) throw new Error("Format AES tidak valid");
    const iv = CryptoJS.enc.Hex.parse(aesParts[0]);
    const encrypted = aesParts[1];
    const decrypted = CryptoJS.AES.decrypt(encrypted, paddedKey, {
      iv: iv
    });
    const textWithTime = decrypted.toString(CryptoJS.enc.Utf8);
    const parts2 = textWithTime.split("|");
    if (parts2.length < 2) throw new Error("Format timestamp tidak valid");
    const timestamp = parts2[0];
    const originalText = parts2.slice(1).join("|");
    return {
      text: originalText,
      timestamp: new Date(parseInt(timestamp)).toISOString(),
      age: Math.floor((Date.now() - parseInt(timestamp)) / 1e3)
    };
  }
  enc({
    data,
    method = "combined",
    ...rest
  }) {
    if (!data) {
      throw new Error("Data diperlukan untuk enkripsi.");
    }
    const dataToEncrypt = typeof data === "object" ? JSON.stringify(data) : data;
    let encrypted;
    switch (method.toLowerCase()) {
      case "aes":
        encrypted = this.encryptAES(dataToEncrypt, this.defaultKey);
        break;
      case "combined":
      case "multilayer":
        encrypted = this.encryptMultiLayer(dataToEncrypt, this.defaultKey);
        break;
      default:
        throw new Error(`Metode enkripsi tidak didukung: ${method}`);
    }
    return {
      uuid: encrypted
    };
  }
  dec({
    uuid,
    method = "combined",
    ...rest
  }) {
    if (!uuid) {
      throw new Error("UUID diperlukan untuk dekripsi.");
    }
    let decrypted;
    switch (method.toLowerCase()) {
      case "aes":
        decrypted = this.decryptAES(uuid, this.defaultKey);
        break;
      case "combined":
      case "multilayer":
        decrypted = this.decryptMultiLayer(uuid, this.defaultKey);
        break;
      default:
        throw new Error(`Metode dekripsi tidak didukung: ${method}`);
    }
    if (!decrypted || typeof decrypted === "string" && decrypted.length === 0) {
      throw new Error("Dekripsi gagal - periksa kunci dan format teks");
    }
    if (typeof decrypted === "string") {
      try {
        const jsonResult = JSON.parse(decrypted);
        if (typeof jsonResult === "string") {
          return decrypted;
        }
        return jsonResult;
      } catch (e) {
        return decrypted;
      }
    } else if (typeof decrypted.text === "string") {
      try {
        const jsonResult = JSON.parse(decrypted.text);
        decrypted.text = jsonResult;
        return decrypted;
      } catch (e) {
        return decrypted;
      }
    }
    return decrypted;
  }
  clearCache() {
    uuidMapping.clear();
  }
  getCacheSize() {
    return uuidMapping.size;
  }
}
const Encoder = new EncoderClient(apiConfig.PASSWORD);
export default Encoder;