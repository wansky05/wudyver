const PASSWORD = process.env.MY_PASSWORD || "";
const MONGODB_URI = process.env.MY_MONGODB_URI || "";
const DOMAIN_URL = process.env.MY_DOMAIN_URL || "wudysoft.xyz";
const DOMAIN_CF = process.env.MY_DOMAIN_CF || "api.paxsenix.biz.id";
const DOMAIN_KOYEB = process.env.MY_DOMAIN_KOYEB || "wudysoft.koyeb.app";
const DOMAIN_VERCEL = process.env.MY_DOMAIN_VERCEL || "koyeb-api-wudy-team.vercel.app";
const EMAIL = process.env.MY_EMAIL || "wudysoft@mail.com";
const LIMIT_POINTS = process.env.MY_LIMIT_POINTS || 30;
const LIMIT_DURATION = process.env.MY_LIMIT_DURATION || 60;
const JWT_SECRET = process.env.MY_NEXTAUTH_SECRET || "";
const GOOGLE_CLIENT_ID = process.env.MY_GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.MY_GOOGLE_CLIENT_SECRET || "";
const GITHUB_ID = process.env.MY_GITHUB_ID || "";
const GITHUB_SECRET = process.env.MY_GITHUB_SECRET || "";
const SONIVA_KEY = process.env.MY_SONIVA_KEY || "";
const SUNOAPI_KEY = process.env.MY_SUNOAPI_KEY || "";
const apiConfig = {
  PASSWORD: PASSWORD,
  MONGODB_URI: MONGODB_URI,
  DOMAIN_URL: DOMAIN_URL,
  DOMAIN_CF: DOMAIN_CF,
  DOMAIN_KOYEB: DOMAIN_KOYEB,
  DOMAIN_VERCEL: DOMAIN_VERCEL,
  EMAIL: EMAIL,
  LIMIT_POINTS: LIMIT_POINTS,
  LIMIT_DURATION: LIMIT_DURATION,
  JWT_SECRET: JWT_SECRET,
  SONIVA_KEY: SONIVA_KEY,
  SUNOAPI_KEY: SUNOAPI_KEY,
  GOOGLE_CLIENT_ID: GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: GOOGLE_CLIENT_SECRET,
  GITHUB_ID: GITHUB_ID,
  GITHUB_SECRET: GITHUB_SECRET
};
const validateAllConfig = () => {
  let hasError = false;
  for (const key in apiConfig) {
    if (typeof apiConfig[key] === "string" && apiConfig[key].trim() === "") {
      console.info(`FATAL CONFIG ERROR: ${key} is not set. Please set it in your environment variables.`);
      hasError = true;
    }
  }
  if (hasError) {
    console.warn("One or more essential configuration variables are missing. Application might not function correctly.");
  } else {
    console.log("All essential configuration variables are validated successfully.");
  }
};
validateAllConfig();
export default apiConfig;