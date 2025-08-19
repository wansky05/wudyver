import axios from "axios";
import apiConfig from "@/configs/apiConfig";
class PaxsenixBypass {
  constructor(apiUrl) {
    this.apiUrl = apiUrl || `https://${apiConfig.DOMAIN_CF}/tools/`;
  }
  getSolverEndpoint(type) {
    const solvers = {
      turnstile: "cf-turnstile-solver",
      hcaptcha: "hcaptcha-invisible-solver",
      recaptchav3: "recaptchav3-invis-solver"
    };
    return solvers[type] || "cf-turnstile-solver";
  }
  async run(params) {
    try {
      const {
        url,
        sitekey,
        type = "turnstile",
        ...rest
      } = params;
      const endpoint = this.getSolverEndpoint(type);
      const fullUrl = `${this.apiUrl}${endpoint}`;
      const queryParams = new URLSearchParams({
        url: url,
        sitekey: sitekey,
        ...rest
      });
      const response = await axios.get(`${fullUrl}?${queryParams.toString()}`, {
        headers: {
          Authorization: "Bearer YOUR_API_KEY",
          "Content-Type": "application/json"
        }
      });
      if (response.data.solution_token) {
        return {
          token: response.data.solution_token,
          type: type
        };
      }
      throw new Error("No solution_token found in response");
    } catch (error) {
      console.error("Failed to bypass CAPTCHA:", error.message);
      throw new Error(`Failed to bypass ${type} CAPTCHA.`);
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.url) {
    return res.status(400).json({
      error: "Parameter 'url' is required."
    });
  }
  if (!params.sitekey) {
    return res.status(400).json({
      error: "Parameter 'sitekey' is required."
    });
  }
  try {
    const bypasser = new PaxsenixBypass();
    const response = await bypasser.run(params);
    return res.status(200).json(response);
  } catch (error) {
    console.error("Bypasser API Error:", error.message);
    res.status(500).json({
      error: error.message || "Internal server error while processing CAPTCHA bypass."
    });
  }
}