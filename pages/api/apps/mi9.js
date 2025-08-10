import {
  spawn
} from "child_process";
import * as cheerio from "cheerio";
const generateRandomIp = () => {
  const randomByte = () => Math.floor(Math.random() * 255) + 1;
  return `${randomByte()}.${randomByte()}.${randomByte()}.${randomByte()}`;
};
class ApkDownloader {
  constructor() {
    this.tokenUrl = "https://token.mi9.com/";
    this.streamUrl = "https://api.mi9.com/get";
    this.pageUrl = "https://apkdownloader.pages.dev/";
    this.availableOptions = null;
  }
  async fetchAvailableOptions() {
    if (this.availableOptions) {
      return this.availableOptions;
    }
    console.log("[LOG] Mengambil daftar opsi konfigurasi dari halaman web...");
    try {
      const html = await this.runCurlCommand([this.pageUrl]);
      const $ = cheerio.load(html);
      const options = {
        device: $("#device option").map((_, el) => $(el).attr("value")).get(),
        arch: $("#arch option").map((_, el) => $(el).attr("value")).get(),
        sdk: $("#sdk option").map((_, el) => $(el).attr("value")).get(),
        language: $("#lang option").map((_, el) => $(el).attr("value")).get()
      };
      this.availableOptions = options;
      return options;
    } catch (error) {
      console.error("[ERROR] Gagal mengambil opsi dari halaman web.");
      throw error;
    }
  }
  runCurlCommand(args) {
    return new Promise((resolve, reject) => {
      const curl = spawn("curl", args, {
        stdio: ["inherit", "pipe", "pipe"]
      });
      let data = "";
      let errorData = "";
      curl.stdout.on("data", chunk => {
        data += chunk.toString();
      });
      curl.stderr.on("data", chunk => {
        errorData += chunk.toString();
      });
      curl.on("close", code => {
        if (code !== 0) {
          return reject(new Error(`cURL process exited with code ${code}: ${errorData}`));
        }
        resolve(data);
      });
      curl.on("error", err => {
        reject(new Error(`Failed to start curl process: ${err.message}`));
      });
    });
  }
  async download({
    package: packageName,
    ...options
  } = {}) {
    if (!packageName) {
      throw new Error("Nama paket tidak boleh kosong.");
    }
    await this.fetchAvailableOptions();
    let finalHtml = "";
    try {
      const available = this.availableOptions;
      for (const key in options) {
        if (available[key] && !available[key].includes(options[key])) {
          console.error(`[ERROR] Nilai tidak valid untuk '${key}': '${options[key]}'.`);
          console.log(`[INFO] Opsi yang valid untuk '${key}': ${available[key].join(", ")}.`);
          throw new Error(`Input tidak valid.`);
        }
      }
      console.log(`[LOG] Memulai proses download untuk paket: ${packageName}`);
      const payload = {
        package: packageName,
        device: options.device || "phone",
        arch: options.arch || "arm64-v8a",
        vc: "",
        device_id: "",
        sdk: options.sdk || "default",
        ...options
      };
      const tokenArgs = [this.tokenUrl, "-H", "accept: */*", "-H", "accept-language: id-ID,id;q=0.9", "-H", "content-type: application/json", "-H", "origin: https://apkdownloader.pages.dev", "-H", "referer: https://apkdownloader.pages.dev/", "-H", "user-agent: Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36", "-H", `X-Forwarded-For: ${generateRandomIp()}`, "--data-raw", JSON.stringify(payload)];
      console.log("[LOG] Mengirim permintaan token dengan curl...");
      const tokenOutput = await this.runCurlCommand(tokenArgs);
      const tokenData = JSON.parse(tokenOutput);
      if (!tokenData?.success || !tokenData.token) {
        throw new Error("Gagal mendapatkan token. Respon tidak valid.");
      }
      const {
        token,
        timestamp
      } = tokenData;
      console.log(`[LOG] Token berhasil didapat.`);
      const streamData = {
        hl: options.language || "en",
        package: packageName,
        timestamp: timestamp,
        ...payload
      };
      const dataBase64 = Buffer.from(JSON.stringify(streamData)).toString("base64");
      const finalUrl = `${this.streamUrl}?token=${token}&data=${dataBase64}`;
      const streamArgs = [finalUrl, "-H", "accept: text/event-stream", "-H", "accept-language: id-ID,id;q=0.9", "-H", "cache-control: no-cache", "-H", "origin: https://apkdownloader.pages.dev", "-H", "referer: https://apkdownloader.pages.dev/", "-H", "user-agent: Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36", "-H", `X-Forwarded-For: ${generateRandomIp()}`];
      console.log("[LOG] Memulai koneksi stream dengan curl...");
      const streamOutput = await this.runCurlCommand(streamArgs);
      const lines = streamOutput.split("\n");
      for (const line of lines) {
        if (line.startsWith("data:")) {
          const eventData = line.substring(5).trim();
          try {
            const data = JSON.parse(eventData);
            console.log(`[LOG] Status: ${data.status} | Progress: ${data.progress}%`);
            if (data.progress === 100 && data.html) {
              finalHtml = data.html;
              break;
            }
          } catch (error) {
            console.warn("[WARNING] Gagal mem-parsing event data:", error);
          }
        }
      }
      if (!finalHtml) {
        throw new Error("HTML akhir tidak ditemukan dari event stream.");
      }
      console.log("[LOG] HTML berhasil diterima. Mengurai data...");
      return {
        result: this.parseHtml(finalHtml),
        options: available
      };
    } catch (error) {
      console.error(`[ERROR] Terjadi kesalahan dalam proses download: ${error.message}`);
      throw error;
    }
  }
  parseHtml(htmlString) {
    try {
      const $ = cheerio.load(htmlString);
      const appTitle = $(".apk_ad_info ._title a").eq(0).text().trim() || "Judul Tidak Diketahui";
      const appVersion = $(".apk_ad_info ._version").eq(0).text().trim() || "Versi Tidak Diketahui";
      const downloadLinks = $(".apk_files_list .apk_files_item").map((_, elm) => {
        const linkElm = $(elm).find("a");
        return {
          name: linkElm.find(".der_name").text().trim() || "Nama File Tidak Diketahui",
          size: linkElm.find(".der_size").text().trim() || "Ukuran Tidak Diketahui",
          url: linkElm.attr("href") || "#"
        };
      }).get();
      return {
        title: appTitle,
        version: appVersion,
        links: downloadLinks
      };
    } catch (error) {
      throw new Error(`Gagal mengurai HTML: ${error.message}`);
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.package) {
    return res.status(400).json({
      error: "package are required"
    });
  }
  try {
    const downloader = new ApkDownloader();
    const response = await downloader.download(params);
    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}