import crypto from "crypto";
import * as cheerio from "cheerio";
import fetch from "node-fetch";
class DoodsScraper {
  constructor() {
    this.proxyLink = "";
    this.baseUrl = "https://d-s.io";
    this.headers = {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      Referer: "https://d-s.io/",
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; Pixel 4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Mobile Safari/537.36"
    };
    this.logger = console;
  }
  async #fetchWithRetry(url, options = {}, retries = 3, delay = 1e3) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response;
    } catch (error) {
      if (retries > 0) {
        this.logger.warn(`Retrying (${retries} left) for URL: ${url}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.#fetchWithRetry(url, options, retries - 1, delay * 1.5);
      }
      throw error;
    }
  }
  async #extractMetadata($) {
    try {
      return {
        title: $(".title-wrap h4").text().trim(),
        duration: $(".length").text().trim(),
        size: $(".size").text().trim(),
        uploadDate: $(".uploadate").text().trim()
      };
    } catch (error) {
      this.logger.error("Failed to extract metadata:", error);
      return {};
    }
  }
  async #generateRandomString(length = 10) {
    try {
      return Array.from(crypto.randomFillSync(new Uint8Array(length))).map(x => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" [x % 62]).join("");
    } catch (error) {
      this.logger.error("Failed to generate random string:", error);
      return Math.random().toString(36).substring(2, 2 + length);
    }
  }
  async download({
    url
  }) {
    try {
      if (!url || typeof url !== "string") {
        throw new Error("URL must be a valid string");
      }
      this.logger.info(`Starting scrape for URL: ${url}`);
      const idMatch = url.match(/\/[de]\/([a-zA-Z0-9]+)/);
      if (!idMatch || !idMatch[1]) {
        throw new Error("Invalid URL format. Could not extract video ID");
      }
      const id = idMatch[1];
      await new Promise(resolve => setTimeout(resolve, 14e3));
      const initialUrl = `${this.baseUrl}/d/${id}`;
      this.logger.debug(`Fetching initial page: ${initialUrl}`);
      const initialResponse = await this.#fetchWithRetry(initialUrl);
      const html = await initialResponse.text();
      const $ = cheerio.load(html);
      if ($("#os_player iframe").length === 0) {
        throw new Error("Video player iframe not found. The video might be removed or unavailable");
      }
      const result = await this.#extractMetadata($);
      this.logger.debug("Extracted metadata:", result);
      const doodstreamUrl = `${this.proxyLink}${this.baseUrl}/e/${id}`;
      this.logger.debug(`Fetching doodstream page: ${doodstreamUrl}`);
      const doodResponse = await this.#fetchWithRetry(doodstreamUrl, {
        headers: this.headers
      });
      const doodText = await doodResponse.text();
      const urlInsideGet = doodText.match(/\$.get\('([^']+)',\s*function\(data\)/)?.[1];
      if (!urlInsideGet) {
        throw new Error("Could not find secondary URL in the response");
      }
      const lastValue = urlInsideGet.match(/\/([^/]+)$/)?.[1];
      const secondaryUrl = `${this.proxyLink}${this.baseUrl}${urlInsideGet}`;
      this.logger.debug(`Fetching secondary URL: ${secondaryUrl}`);
      const secondaryResponse = await this.#fetchWithRetry(secondaryUrl, {
        headers: this.headers
      });
      const part1 = await secondaryResponse.text();
      const randomString = await this.#generateRandomString();
      result.finalLink = `${this.proxyLink}${part1}${randomString}?token=${lastValue}&expiry=${Date.now()}`;
      this.logger.debug("Generated final link");
      this.logger.info("Scraping completed successfully");
      return result;
    } catch (error) {
      this.logger.error("Scraping failed:", {
        error: error.message,
        stack: error.stack,
        url: url
      });
      return {
        success: false,
        error: error.message,
        details: "Terjadi kesalahan saat scraping. Silakan coba lagi atau gunakan link yang berbeda."
      };
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.url) return res.status(400).json({
    error: "Missing required field: url"
  });
  const downloader = new DoodsScraper();
  try {
    const result = await downloader.download(params);
    return res.status(200).json(result);
  } catch (err) {
    res.status(500).json({
      error: "Internal Server Error",
      message: err.message
    });
  }
}