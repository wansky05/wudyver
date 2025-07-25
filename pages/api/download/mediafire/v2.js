import axios from "axios";
import * as cheerio from "cheerio";
import apiConfig from "@/configs/apiConfig";
class MFDownloader {
  constructor(host = "v1") {
    this.api = `https://${apiConfig.DOMAIN_URL}/api/tools/web/html/${host}`;
  }
  b64(s = "") {
    try {
      return Buffer.from(s, "base64").toString();
    } catch {
      return "";
    }
  }
  async get({
    url
  }) {
    try {
      const full = `${this.api}?url=${encodeURIComponent(url)}`;
      let $, btn, i = 0;
      while (!btn?.attr("data-scrambled-url") && i++ < 15) {
        const res = await axios.get(full);
        $ = cheerio.load(res.data || "");
        btn = $("a#downloadButton[data-scrambled-url]");
        if (btn.length) break;
        await new Promise(r => setTimeout(r, 3e3));
      }
      if (!btn?.length) return null;
      return {
        name: $(".promoDownloadName .dl-btn-label").attr("title") || $(".promoDownloadName .dl-btn-label").text().trim(),
        size: btn.text().match(/\((.*?)\)/)?.[1] || "",
        url: $("#copy").val() || $("#copyShareURL").attr("href") || url,
        download: this.b64(btn.attr("data-scrambled-url")),
        title: $("title").text().trim(),
        head: $(".header h1.logo a").text().trim()
      };
    } catch (e) {
      console.error("MFDownloader error:", e.message);
      return null;
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.url) {
    return res.status(400).json({
      error: "Url are required"
    });
  }
  const host = params.host || "v1";
  try {
    const d = new MFDownloader(host);
    const response = await d.get(params);
    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}