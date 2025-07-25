import axios from "axios";
import FormData from "form-data";

function genSerial(length) {
  let result = "";
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}
class DecopyOCRService {
  constructor() {
    this.cookies = "";
    this.axiosInstance = axios.create({
      baseURL: "https://api.decopy.ai/api/decopy/",
      headers: {
        accept: "*/*",
        "accept-language": "id-ID,id;q=0.9",
        "cache-control": "no-cache",
        pragma: "no-cache",
        "product-code": "067003",
        "product-serial": genSerial(32),
        origin: "https://decopy.ai",
        referer: "https://decopy.ai/",
        "sec-ch-ua": '"Lemur";v="135", "", "", "Microsoft Edge Simulate";v="135"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36"
      },
      "Content-Type": undefined
    });
  }
  async getCookies() {
    try {
      const response = await axios.get("https://decopy.ai/", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
          "Accept-Language": "id-ID,id;q=0.9"
        }
      });
      const setCookieHeaders = response.headers["set-cookie"];
      if (setCookieHeaders) {
        this.cookies = setCookieHeaders.map(cookieString => cookieString.split(";")[0]).join("; ");
      }
      return this.cookies;
    } catch (error) {
      console.error("Error fetching initial cookies:", error.message);
      throw error;
    }
  }
  async processImage({
    url
  }) {
    if (!url) {
      throw new Error("Image URL is required for OCR.");
    }
    if (!this.cookies) {
      console.log("Cookies not found, fetching them automatically...");
      try {
        await this.getCookies();
        console.log("Cookies fetched automatically:", this.cookies);
      } catch (cookieError) {
        console.error("Failed to automatically fetch cookies:", cookieError.message);
        throw new Error("Failed to obtain necessary cookies for OCR process.");
      }
    }
    try {
      const imageResponse = await axios.get(url, {
        responseType: "arraybuffer"
      });
      const imageBuffer = Buffer.from(imageResponse.data);
      const contentType = imageResponse.headers["content-type"] || "image/jpeg";
      const filename = url.substring(url.lastIndexOf("/") + 1) || "image.jpg";
      const formData = new FormData();
      formData.append("upload_images", imageBuffer, {
        filename: filename,
        contentType: contentType
      });
      const requestHeaders = {
        ...formData.getHeaders()
      };
      if (this.cookies) {
        requestHeaders["Cookie"] = this.cookies;
      }
      const response = await this.axiosInstance.post("image-to-text/create-job", formData, {
        headers: requestHeaders
      });
      return response.data?.result;
    } catch (error) {
      console.error("Error during OCR process:", error.message);
      if (error.response) {
        console.error("API Response Data:", error.response.data);
        console.error("API Response Status:", error.response.status);
        console.error("API Response Headers:", error.response.headers);
      } else if (error.request) {
        console.error("No response received from API:", error.request);
      }
      throw error;
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.url) {
    return res.status(400).json({
      error: "Url is required"
    });
  }
  const ocrService = new DecopyOCRService();
  try {
    const data = await ocrService.processImage(params);
    return res.status(200).json(data);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
}