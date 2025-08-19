import axios from "axios";
import apiConfig from "@/configs/apiConfig";
class PaxsenixBypass {
  constructor(apiUrl) {
    this.apiUrl = apiUrl || `https://${apiConfig.DOMAIN_CF}/tools/`;
  }
  async run({
    url,
    sitekey,
    type = "turnstile",
    ...rest
  }) {
    try {
      const endpoint = {
        turnstile: "cf-turnstile-solver",
        hcaptcha: "hcaptcha-invisible-solver",
        recaptchav3: "recaptchav3-invis-solver"
      } [type] || "cf-turnstile-solver";
      const response = await axios.get(`${this.apiUrl}${endpoint}?${new URLSearchParams({
url: url,
sitekey: sitekey,
...rest
})}`, {
        headers: {
          Authorization: "Bearer YOUR_API_KEY",
          "Content-Type": "application/json"
        }
      });
      if (!response.data.solution_token) throw new Error("No solution_token found");
      return {
        token: response.data.solution_token,
        type: type
      };
    } catch (error) {
      console.error(`Failed to bypass ${type} CAPTCHA:`, error.message);
      throw new Error(`Failed to bypass ${type} CAPTCHA`);
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.url || !params.sitekey) {
    return res.status(400).json({
      error: "Parameters 'url' and 'sitekey' are required"
    });
  }
  try {
    const response = await new PaxsenixBypass().run(params);
    res.status(200).json(response);
  } catch (error) {
    console.error("Bypasser API Error:", error.message);
    res.status(500).json({
      error: error.message
    });
  }
}