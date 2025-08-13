import axios from "axios";
import apiConfig from "@/configs/apiConfig";
class PaxsenixBypass {
  constructor(apiUrl) {
    this.apiUrl = apiUrl || `https://${apiConfig.DOMAIN_CF}/tools/cf-turnstile-solver`;
  }
  async run(params) {
    try {
      const {
        url,
        sitekey,
        ...rest
      } = params;
      const queryParams = new URLSearchParams({
        url: url,
        sitekey: sitekey,
        ...rest
      });
      const response = await axios.get(`${this.apiUrl}?${queryParams.toString()}`, {
        headers: {
          Authorization: "Bearer YOUR_API_KEY",
          "Content-Type": "application/json"
        }
      });
      if (response.data.turnstile_result) {
        return {
          token: response.data.turnstile_result
        };
      }
      throw new Error("Tidak ada turnstile_result dalam response");
    } catch (error) {
      console.error("Gagal melakukan bypass");
      throw new Error("Gagal melakukan bypass Cloudflare.");
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.url) {
    return res.status(400).json({
      error: "Parameter 'url' wajib disediakan."
    });
  }
  if (!params.sitekey) {
    return res.status(400).json({
      error: "Parameter 'sitekey' wajib disediakan."
    });
  }
  try {
    const bypasser = new PaxsenixBypass();
    const response = await bypasser.run(params);
    return res.status(200).json(response);
  } catch (error) {
    console.error("Kesalahan API Bypasser:", error.message);
    res.status(500).json({
      error: error.message || "Terjadi kesalahan server internal saat melakukan bypass Cloudflare."
    });
  }
}