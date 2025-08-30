// pages/api/validate.js - Backend validation API (separated from middleware)
import { getToken } from "next-auth/jwt";
import apiConfig from "@/configs/apiConfig";
import NextCors from "nextjs-cors";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const axios = require("axios");
const os = require("os");

const DOMAIN_URL = apiConfig.DOMAIN_URL || "wudysoft.xyz";
const NEXTAUTH_SECRET = apiConfig.JWT_SECRET;
const DEFAULT_PROTOCOL = "https://";

// CORS configuration
const corsOptions = {
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  origin: "*",
  optionsSuccessStatus: 200,
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Cookie", "User-Agent", "X-Forwarded-For", "X-Real-IP"]
};

// Initialize axios instance
const axiosInstance = axios.create({
  timeout: 5000,
  headers: {
    "Content-Type": "application/json",
    "Accept-Encoding": "gzip"
  }
});

// Rate limiter initialization
let rateLimiter = null;

async function initRateLimiter() {
  if (!rateLimiter) {
    try {
      const { RateLimiterMemory } = require("rate-limiter-flexible");
      rateLimiter = new RateLimiterMemory({
        points: apiConfig.LIMIT_POINTS,
        duration: apiConfig.LIMIT_DURATION
      });
      console.log("[Rate-Limiter] Initialized successfully");
    } catch (error) {
      console.error("[Rate-Limiter] Failed to initialize:", error.message);
      rateLimiter = createSimpleRateLimiter();
    }
  }
  return rateLimiter;
}

function createSimpleRateLimiter() {
  const requests = new Map();
  return {
    async consume(key, points = 1) {
      const now = Date.now();
      const windowStart = now - (apiConfig.LIMIT_DURATION * 1000);
      
      if (!requests.has(key)) {
        requests.set(key, []);
      }
      
      const userRequests = requests.get(key);
      const validRequests = userRequests.filter(timestamp => timestamp > windowStart);
      
      if (validRequests.length >= apiConfig.LIMIT_POINTS) {
        const oldestRequest = Math.min(...validRequests);
        const msBeforeNext = (oldestRequest + (apiConfig.LIMIT_DURATION * 1000)) - now;
        const error = new Error("Rate limit exceeded");
        error.msBeforeNext = msBeforeNext;
        throw error;
      }
      
      validRequests.push(now);
      requests.set(key, validRequests);
      
      return {
        remainingPoints: apiConfig.LIMIT_POINTS - validRequests.length,
        msBeforeNext: 0
      };
    }
  };
}

// VPN Detection setup
function getServerInternalIps() {
  const interfaces = os.networkInterfaces();
  const internalIps = [];
  
  for (const interfaceName of Object.keys(interfaces)) {
    for (const iface of interfaces[interfaceName]) {
      if (iface.family === "IPv4" && !iface.internal) {
        internalIps.push(iface.address);
      }
    }
  }
  
  return internalIps.length > 0 ? internalIps : ["127.0.0.1"];
}

function generateInternalIpPatterns() {
  const ips = getServerInternalIps();
  return ips.map(ip => {
    const escapedIp = ip.replace(/\./g, "\\.");
    return new RegExp(`^${escapedIp}`);
  });
}

const internalIpPatterns = generateInternalIpPatterns();

const VPN_DETECTION_CONFIG = {
  enabled: apiConfig.VPN_DETECTION_ENABLED !== false,
  blockVpn: true,
  cacheTimeout: 3600000, // 1 hour
  maxCacheSize: 10000,
  blockMessage: "Access denied: VPN or proxy detected. Please disable your VPN/proxy and try again.",
  whitelist: [
    /^192\.168\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^127\.0\.0\.1$/,
    /^::1$/,
    /^76\.223\./,
    /^76\.76\./,
    ...internalIpPatterns
  ]
};

const ipDetectionCache = new Map();
let staticVpnCheck = null;

async function initVpnChecker() {
  if (!staticVpnCheck) {
    try {
      staticVpnCheck = require("static-vpn-check");
      console.log("[VPN-Detector] Static VPN checker initialized");
    } catch (error) {
      console.warn("[VPN-Detector] Failed to initialize static-vpn-check:", error.message);
      staticVpnCheck = null;
    }
  }
  return staticVpnCheck;
}

// Cache cleanup
let cacheCleanupInterval = null;

function startCacheCleanup() {
  if (!cacheCleanupInterval && typeof setInterval !== "undefined") {
    cacheCleanupInterval = setInterval(() => {
      if (ipDetectionCache.size > VPN_DETECTION_CONFIG.maxCacheSize) {
        const entries = Array.from(ipDetectionCache.entries());
        const toRemove = entries.slice(0, Math.floor(entries.length / 2));
        toRemove.forEach(([key]) => ipDetectionCache.delete(key));
        console.log(`[VPN-Detector] Cleaned cache, removed ${toRemove.length} entries`);
      }
    }, VPN_DETECTION_CONFIG.cacheTimeout);
  }
}

startCacheCleanup();

function ensureProtocol(url, defaultProtocol) {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return defaultProtocol + url;
  }
  return url;
}

async function performTracking(requestData) {
  try {
    const { pathname } = new URL(requestData.url);
    const baseURL = ensureProtocol(DOMAIN_URL, DEFAULT_PROTOCOL);
    
    const isApiRoute = pathname.startsWith("/api");
    const isVisitorApi = pathname.includes("/api/visitor");
    const isAuthApi = pathname.includes("/api/auth");
    const isGeneralApi = pathname.includes("/api/general");
    const isAuthPage = pathname === "/login" || pathname === "/register";
    
    if (isApiRoute && !isVisitorApi && !isAuthApi && !isGeneralApi) {
      console.log(`[Middleware-Tracking] Sending API request data for tracking: ${pathname}`);
      await axiosInstance.get(`${baseURL}/api/visitor/req`);
    } else if (!isApiRoute && !isAuthPage) {
      console.log(`[Middleware-Tracking] Sending page visit data for tracking: ${pathname}`);
      await axiosInstance.get(`${baseURL}/api/visitor/visit`);
      await axiosInstance.post(`${baseURL}/api/visitor/info`, {
        route: pathname,
        time: new Date().toISOString(),
        hit: 1
      });
    }
  } catch (err) {
    const errorMessage = err.response ? 
      `Status ${err.response.status}: ${err.response.data?.message || err.message}` : 
      err.message;
    console.error(`[Middleware-Tracking] Failed to log visitor for ${requestData.url}: ${errorMessage}`);
  }
}

function isWhitelistedIp(ipAddress) {
  for (const whitelistItem of VPN_DETECTION_CONFIG.whitelist) {
    if (typeof whitelistItem === "string") {
      if (ipAddress === whitelistItem) {
        console.log(`[VPN-Detector] IP ${ipAddress} is whitelisted (exact match)`);
        return true;
      }
    } else if (whitelistItem instanceof RegExp) {
      if (whitelistItem.test(ipAddress)) {
        console.log(`[VPN-Detector] IP ${ipAddress} is whitelisted (regex match)`);
        return true;
      }
    }
  }
  
  if (ipAddress === "unknown" || !ipAddress) {
    console.log(`[VPN-Detector] IP ${ipAddress} is whitelisted (unknown/internal)`);
    return true;
  }
  
  try {
    const serverDomain = DOMAIN_URL.replace(/^https?:\/\//, "");
    if (ipAddress.includes(serverDomain) || serverDomain.includes(ipAddress)) {
      console.log(`[VPN-Detector] IP ${ipAddress} is whitelisted (same domain)`);
      return true;
    }
  } catch (error) {
    console.warn(`[VPN-Detector] Error checking domain match:`, error.message);
  }
  
  return false;
}

async function checkVpnProxy(ipAddress) {
  if (!VPN_DETECTION_CONFIG.enabled) {
    return {
      allowed: true,
      blocked: false
    };
  }
  
  if (isWhitelistedIp(ipAddress)) {
    console.log(`[VPN-Detector] IP ${ipAddress} is whitelisted, skipping VPN check`);
    return {
      allowed: true,
      blocked: false,
      reason: "IP whitelisted",
      details: {
        isVpn: false,
        method: "whitelist",
        ip: ipAddress
      }
    };
  }
  
  const cacheKey = `ip_${ipAddress}`;
  const cached = ipDetectionCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < VPN_DETECTION_CONFIG.cacheTimeout) {
    console.log(`[VPN-Detector] Using cached result for IP: ${ipAddress}`);
    return cached.result;
  }
  
  try {
    console.log(`[VPN-Detector] Checking IP: ${ipAddress} using static-vpn-check`);
    const vpnChecker = await initVpnChecker();
    let isVpn = false;
    
    if (vpnChecker && typeof vpnChecker.checkIp === "function") {
      console.log(`[VPN-Detector] Using static-vpn-check for IP: ${ipAddress}`);
      isVpn = vpnChecker.checkIp(ipAddress);
      console.log(`[VPN-Detector] Static VPN check result for ${ipAddress}: ${isVpn}`);
    } else if (vpnChecker && vpnChecker.default && typeof vpnChecker.default.checkIp === "function") {
      console.log(`[VPN-Detector] Using static-vpn-check (default export) for IP: ${ipAddress}`);
      isVpn = vpnChecker.default.checkIp(ipAddress);
      console.log(`[VPN-Detector] Static VPN check result for ${ipAddress}: ${isVpn}`);
    } else {
      console.log(`[VPN-Detector] Fallback to API detection for IP: ${ipAddress}`);
      const apiResult = await checkVpnWithApi(ipAddress);
      return apiResult;
    }
    
    const shouldBlock = VPN_DETECTION_CONFIG.blockVpn && isVpn;
    
    const result = {
      allowed: !shouldBlock,
      blocked: shouldBlock,
      reason: shouldBlock ? VPN_DETECTION_CONFIG.blockMessage : null,
      statusCode: shouldBlock ? 403 : 200,
      details: {
        isVpn: isVpn,
        method: "static-vpn-check",
        ip: ipAddress
      }
    };
    
    ipDetectionCache.set(cacheKey, {
      result: result,
      timestamp: Date.now()
    });
    
    if (shouldBlock) {
      console.warn(`[VPN-Detector] Blocked IP ${ipAddress}: VPN detected via static-vpn-check`);
    } else {
      console.log(`[VPN-Detector] Allowed IP ${ipAddress} - not a VPN (static-vpn-check)`);
    }
    
    return result;
  } catch (error) {
    console.error(`[VPN-Detector] Error checking IP ${ipAddress} with static-vpn-check:`, error.message);
    
    try {
      console.log(`[VPN-Detector] Attempting API fallback for IP: ${ipAddress}`);
      return await checkVpnWithApi(ipAddress);
    } catch (fallbackError) {
      console.error(`[VPN-Detector] API fallback also failed for ${ipAddress}:`, fallbackError.message);
      
      const result = {
        allowed: true,
        blocked: false,
        error: `Both static-vpn-check and API fallback failed: ${error.message}`,
        details: {
          method: "error-fallback",
          ip: ipAddress
        }
      };
      
      ipDetectionCache.set(cacheKey, {
        result: result,
        timestamp: Date.now() - (VPN_DETECTION_CONFIG.cacheTimeout * 0.8)
      });
      
      return result;
    }
  }
}

async function checkVpnWithApi(ipAddress) {
  if (isWhitelistedIp(ipAddress)) {
    console.log(`[VPN-Detector] IP ${ipAddress} is whitelisted, skipping API VPN check`);
    return {
      allowed: true,
      blocked: false,
      reason: "IP whitelisted",
      details: {
        isVpn: false,
        method: "whitelist-api",
        ip: ipAddress
      }
    };
  }
  
  const response = await fetch(`https://ipapi.co/${ipAddress}/json/`, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; VPN-Detector/1.0)"
    },
    signal: AbortSignal.timeout(5000)
  });
  
  if (!response.ok) {
    throw new Error(`IP API request failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(`IP API error: ${data.reason}`);
  }
  
  const org = (data.org || "").toLowerCase();
  const vpnIndicators = [
    "vpn", "proxy", "tunnel", "anonymous", "privacy",
    "expressvpn", "nordvpn", "surfshark", "cyberghost", "purevpn",
    "protonvpn", "hotspot shield", "windscribe", "tunnelbear"
  ];
  
  const isVpn = vpnIndicators.some(indicator => org.includes(indicator));
  const shouldBlock = VPN_DETECTION_CONFIG.blockVpn && isVpn;
  
  console.log(`[VPN-Detector] API check for ${ipAddress}: ${data.country_name} (${data.org}) - VPN: ${isVpn}`);
  
  return {
    allowed: !shouldBlock,
    blocked: shouldBlock,
    reason: shouldBlock ? `VPN detected: ${data.org}` : null,
    statusCode: shouldBlock ? 403 : 200,
    details: {
      country: data.country_name,
      org: data.org,
      isVpn: isVpn,
      method: "api-fallback",
      ip: ipAddress
    }
  };
}

export default async function handler(req, res) {
  // Apply CORS using nextjs-cors for all methods
  await NextCors(req, res, corsOptions);

  // Handle preflight OPTIONS requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST method for validation
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed",
      statusCode: 405
    });
  }

  try {
    const { url, pathname, method, ip, headers } = req.body;
    
    console.log(`[Validation-API] Processing request: ${pathname} from IP: ${ip}`);

    const isApiRoute = pathname.startsWith("/api");
    const isLoginRoute = pathname === "/login";
    const isRegisterRoute = pathname === "/register";
    const isAuthPage = isLoginRoute || isRegisterRoute;
    const isAnalyticsRoute = pathname === "/analytics";
    const isRootRoute = pathname === "/";
    const isVisitorApi = pathname.includes("/api/visitor");
    const isAuthApi = pathname.includes("/api/auth");
    const isGeneralApi = pathname.includes("/api/general");

    // VPN/Proxy check
    console.log(`[Validation-API] Checking IP ${ip} for VPN/Proxy/Tor`);
    const vpnCheck = await checkVpnProxy(ip);
    
    if (!vpnCheck.allowed && vpnCheck.blocked) {
      console.warn(`[Validation-API] Blocked request from IP ${ip}: ${vpnCheck.reason}`);
      return res.json({
        success: false,
        message: vpnCheck.reason || "Access denied: VPN, proxy, or Tor detected",
        statusCode: vpnCheck.statusCode || 403,
        details: "Please disable your VPN/proxy service and try again."
      });
    }

    console.log(`[Validation-API] IP ${ip} passed VPN/Proxy check`);

    // Rate limiting for API routes (excluding specific APIs)
    let rateLimitHeaders = {};
    if (isApiRoute && !isVisitorApi && !isAuthApi && !isGeneralApi) {
      console.log(`[Validation-API] Applying Rate Limiting for API: ${pathname}`);
      
      try {
        const rateLimiterInstance = await initRateLimiter();
        const rateLimiterRes = await rateLimiterInstance.consume(ip, 1);
        
        rateLimitHeaders = {
          "X-RateLimit-Limit": apiConfig.LIMIT_POINTS,
          "X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
          "X-RateLimit-Reset": Math.ceil((Date.now() + rateLimiterRes.msBeforeNext) / 1000)
        };
        
        console.log(`[Validation-API] Rate limit successful. Remaining requests: ${rateLimiterRes.remainingPoints}`);
      } catch (rateLimiterError) {
        const retryAfterSeconds = Math.ceil(rateLimiterError.msBeforeNext / 1000);
        const totalLimit = apiConfig.LIMIT_POINTS;
        
        console.warn(`[Validation-API] Rate limit exceeded for IP: ${ip}. Retry in ${retryAfterSeconds} seconds.`);
        
        return res.json({
          success: false,
          message: `Too many requests. You have exceeded the limit of ${totalLimit} requests per ${apiConfig.LIMIT_DURATION} seconds. Please try again in ${retryAfterSeconds} seconds.`,
          statusCode: 429,
          details: {
            limit: totalLimit,
            remaining: 0,
            retryAfter: retryAfterSeconds
          }
        });
      }
    }

    // Authentication check
    const mockReq = {
      headers: new Map(Object.entries(headers)),
      cookies: {}
    };

    // Parse cookies from headers
    if (headers.cookie) {
      headers.cookie.split(';').forEach(cookie => {
        const [name, value] = cookie.trim().split('=');
        if (name && value) {
          mockReq.cookies[name] = decodeURIComponent(value);
        }
      });
    }

    const nextAuthToken = await getToken({
      req: mockReq,
      secret: NEXTAUTH_SECRET
    });

    const isAuthenticated = !!nextAuthToken;
    console.log(`[Validation-API] Pathname: ${pathname}, Authentication: ${isAuthenticated ? "Yes" : "No"}`);

    const redirectUrlWithProtocol = ensureProtocol(DOMAIN_URL, DEFAULT_PROTOCOL);

    // Perform tracking
    await performTracking({ url, pathname });

    // Handle API routes
    if (isApiRoute) {
      console.log(`[Validation-API] API route ${pathname} accessed, continuing without authentication check.`);
      return res.json({
        success: true,
        rateLimitHeaders: Object.keys(rateLimitHeaders).length > 0 ? rateLimitHeaders : undefined
      });
    }

    // Handle authenticated users
    if (isAuthenticated) {
      if (isAuthPage) {
        console.log(`[Validation-API] Authenticated user trying to access auth page (${pathname}). Redirecting to /analytics.`);
        return res.json({
          success: true,
          redirect: `${redirectUrlWithProtocol}/analytics`
        });
      } else if (isRootRoute) {
        console.log(`[Validation-API] Authenticated user accessing home page (/). Redirecting to /analytics.`);
        return res.json({
          success: true,
          redirect: `${redirectUrlWithProtocol}/analytics`
        });
      }

      console.log(`[Validation-API] Authenticated user continuing to ${pathname}.`);
      return res.json({
        success: true
      });
    } else {
      // Handle unauthenticated users
      const isPublicPath = isAuthPage;
      
      if (!isPublicPath) {
        console.log(`[Validation-API] Unauthenticated user trying to access ${pathname}. Redirecting to /login.`);
        return res.json({
          success: true,
          redirect: `${redirectUrlWithProtocol}/login`
        });
      }

      console.log(`[Validation-API] Unauthenticated user continuing to ${pathname}.`);
      return res.json({
        success: true
      });
    }

  } catch (error) {
    console.error("[Validation-API] Unhandled error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      statusCode: 500,
      details: error.message
    });
  }
}