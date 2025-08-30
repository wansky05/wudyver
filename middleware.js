import {
  NextResponse,
  NextRequest
} from "next/server";
import {
  getToken
} from "next-auth/jwt";
import apiConfig from "@/configs/apiConfig";
import axios from "axios";
import NextCors from "nextjs-cors";
const createRequire = modulePath => {
  return id => {
    if (typeof globalThis.process === "undefined") {
      globalThis.process = {
        env: {}
      };
    }
    switch (id) {
      case "rate-limiter-flexible":
        return import("rate-limiter-flexible").then(mod => mod.default || mod);
      case "static-vpn-check":
        return import("static-vpn-check").then(mod => mod.default || mod);
      case "request-ip":
        return import("request-ip").then(mod => mod.default || mod);
      default:
        throw new Error(`Module ${id} not found`);
    }
  };
};
const require = createRequire(import.meta.url);
async function getClientIp(req) {
  try {
    const requestIp = await require("request-ip");
    const mockReq = {
      headers: Object.fromEntries(req.headers.entries()),
      connection: {
        remoteAddress: req.ip
      },
      socket: {
        remoteAddress: req.ip
      },
      ip: req.ip,
      ips: req.ips || []
    };
    const clientIp = requestIp.getClientIp(mockReq);
    return clientIp || req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  } catch (error) {
    console.warn("[IP-Detection] Failed to use request-ip, falling back to header detection:", error.message);
    return req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || req.ip || "unknown";
  }
}
const DOMAIN_URL = apiConfig.DOMAIN_URL || "wudysoft.xyz";
const NEXTAUTH_SECRET = apiConfig.JWT_SECRET;
const DEFAULT_PROTOCOL = "https://";
const axiosInstance = axios.create({
  timeout: 5000,
  headers: {
    "Content-Type": "application/json",
    "Accept-Encoding": "gzip"
  }
});
let rateLimiter = null;
async function initRateLimiter() {
  if (!rateLimiter) {
    try {
      const {
        RateLimiterMemory
      } = await require("rate-limiter-flexible");
      rateLimiter = new RateLimiterMemory({
        points: apiConfig.LIMIT_POINTS,
        duration: apiConfig.LIMIT_DURATION
      });
      console.log("[Rate-Limiter] Initialized successfully for Edge Runtime");
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
      const windowStart = now - apiConfig.LIMIT_DURATION * 1e3;
      if (!requests.has(key)) {
        requests.set(key, []);
      }
      const userRequests = requests.get(key);
      const validRequests = userRequests.filter(timestamp => timestamp > windowStart);
      if (validRequests.length >= apiConfig.LIMIT_POINTS) {
        const oldestRequest = Math.min(...validRequests);
        const msBeforeNext = oldestRequest + apiConfig.LIMIT_DURATION * 1e3 - now;
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
const VPN_DETECTION_CONFIG = {
  enabled: apiConfig.VPN_DETECTION_ENABLED !== false,
  blockVpn: true,
  cacheTimeout: 36e5,
  maxCacheSize: 1e4,
  blockMessage: "Access denied: VPN or proxy detected. Please disable your VPN/proxy and try again.",
  whitelist: [apiConfig.VERCEL_IP, /^192\.168\./, /^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^76\.223\./, /^76\.76\./, /^54\.151\./]
};
const ipDetectionCache = new Map();
let staticVpnCheck = null;
async function initVpnChecker() {
  if (!staticVpnCheck) {
    try {
      staticVpnCheck = await require("static-vpn-check");
      console.log("[VPN-Detector] Static VPN checker initialized for Edge Runtime");
    } catch (error) {
      console.warn("[VPN-Detector] Failed to initialize static-vpn-check:", error.message);
      staticVpnCheck = null;
    }
  }
  return staticVpnCheck;
}
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
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-*.js|.*\\.(?:json$|ico$|js$|css$|png$|jpg$|jpeg$|gif$|svg$|woff$|woff2$|ttf$|eot$)).*)"]
};

function ensureProtocol(url, defaultProtocol) {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return defaultProtocol + url;
  }
  return url;
}
async function performTracking(req) {
  try {
    const currentUrl = new URL(req.url);
    const currentPathname = currentUrl.pathname;
    const baseURL = ensureProtocol(DOMAIN_URL, DEFAULT_PROTOCOL);
    const isApiRoute = currentPathname.startsWith("/api");
    const isVisitorApi = currentPathname.includes("/api/visitor");
    const isAuthApi = currentPathname.includes("/api/auth");
    const isGeneralApi = currentPathname.includes("/api/general");
    const isAuthPage = currentPathname === "/login" || currentPathname === "/register";
    if (isApiRoute && !isVisitorApi && !isAuthApi && !isGeneralApi) {
      console.log(`[Middleware-Tracking] Sending API request data for tracking: ${currentPathname}`);
      await axiosInstance.get(`${baseURL}/api/visitor/req`);
    } else if (!isApiRoute && !isAuthPage) {
      console.log(`[Middleware-Tracking] Sending page visit data for tracking: ${currentPathname}`);
      await axiosInstance.get(`${baseURL}/api/visitor/visit`);
      await axiosInstance.post(`${baseURL}/api/visitor/info`, {
        route: currentPathname,
        time: new Date().toISOString(),
        hit: 1
      });
    }
  } catch (err) {
    const errorMessage = err.response ? `Status ${err.response.status}: ${err.response.data?.message || err.message}` : err.message;
    console.error(`[Middleware-Tracking] Failed to log visitor for ${req.url}: ${errorMessage}`);
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
  if (cached && Date.now() - cached.timestamp < VPN_DETECTION_CONFIG.cacheTimeout) {
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
        timestamp: Date.now() - VPN_DETECTION_CONFIG.cacheTimeout * .8
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
    signal: AbortSignal.timeout(5e3)
  });
  if (!response.ok) {
    throw new Error(`IP API request failed: ${response.status}`);
  }
  const data = await response.json();
  if (data.error) {
    throw new Error(`IP API error: ${data.reason}`);
  }
  const org = (data.org || "").toLowerCase();
  const vpnIndicators = ["vpn", "proxy", "tunnel", "anonymous", "privacy", "expressvpn", "nordvpn", "surfshark", "cyberghost", "purevpn", "protonvpn", "hotspot shield", "windscribe", "tunnelbear"];
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
async function applyCors(req, res) {
  try {
    await NextCors(req, res, {
      methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
      origin: "*",
      optionsSuccessStatus: 200,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
    });
  } catch (error) {
    console.warn("[CORS] NextCors failed, using manual CORS headers:", error.message);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}
const cspHeader = `
  frame-ancestors 'none';
  block-all-mixed-content;
  upgrade-insecure-requests;
`;
export async function middleware(req) {
  const url = new URL(req.url);
  const {
    pathname
  } = url;
  const ipAddress = await getClientIp(req);
  console.log(`[Middleware-Main] Receiving request for: ${pathname} from IP: ${ipAddress}`);
  console.log("[Middleware-Main] NEXTAUTH_SECRET (first 5 chars):", NEXTAUTH_SECRET ? NEXTAUTH_SECRET.substring(0, 5) + "..." : "Not set");
  console.log(`[VPN-Detector] Checking IP ${ipAddress} for VPN/Proxy/Tor`);
  const vpnCheck = await checkVpnProxy(ipAddress);
  if (!vpnCheck.allowed && vpnCheck.blocked) {
    console.warn(`[VPN-Detector] Blocked request from IP ${ipAddress}: ${vpnCheck.reason}`);
    return new NextResponse(JSON.stringify({
      status: "error",
      code: vpnCheck.statusCode || 403,
      message: vpnCheck.reason || "Access denied: VPN, proxy, or Tor detected",
      details: "Please disable your VPN/proxy service and try again."
    }), {
      status: vpnCheck.statusCode || 403,
      headers: {
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
  console.log(`[VPN-Detector] IP ${ipAddress} passed VPN/Proxy check`);
  let response = NextResponse.next();
  try {
    const isApiRoute = pathname.startsWith("/api");
    const isLoginRoute = pathname === "/login";
    const isRegisterRoute = pathname === "/register";
    const isAuthPage = isLoginRoute || isRegisterRoute;
    const isAnalyticsRoute = pathname === "/analytics";
    const isRootRoute = pathname === "/";
    const isVisitorApi = pathname.includes("/api/visitor");
    const isAuthApi = pathname.includes("/api/auth");
    const isGeneralApi = pathname.includes("/api/general");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.headers.set("Content-Security-Policy", cspHeader.replace(/\s{2,}/g, " ").trim());
    if (isApiRoute) {
      const mockRes = {
        setHeader: (name, value) => {
          response.headers.set(name, value);
        },
        getHeader: name => {
          return response.headers.get(name);
        },
        status: code => {
          response = NextResponse.json({}, {
            status: code,
            headers: Object.fromEntries(response.headers)
          });
          return mockRes;
        },
        end: () => {}
      };
      try {
        await applyCors(req, mockRes);
        console.log("[Middleware-CORS] CORS headers applied");
      } catch (corsError) {
        console.error("[Middleware-CORS] Error applying CORS:", corsError);
        response.headers.set("Access-Control-Allow-Origin", "*");
        response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      }
      if (req.method === "OPTIONS") {
        return new NextResponse(null, {
          status: 200,
          headers: Object.fromEntries(response.headers)
        });
      }
    }
    console.log("[Middleware-Main] Security headers have been set.");
    if (isApiRoute && !isVisitorApi && !isAuthApi && !isGeneralApi) {
      console.log(`[Middleware-RateLimit] Applying Rate Limiting for API: ${pathname}`);
      try {
        const rateLimiterInstance = await initRateLimiter();
        const rateLimiterRes = await rateLimiterInstance.consume(ipAddress, 1);
        response.headers.set("X-RateLimit-Limit", apiConfig.LIMIT_POINTS.toString());
        response.headers.set("X-RateLimit-Remaining", rateLimiterRes.remainingPoints.toString());
        response.headers.set("X-RateLimit-Reset", Math.ceil((Date.now() + rateLimiterRes.msBeforeNext) / 1e3).toString());
        console.log(`[Middleware-RateLimit] Rate limit successful. Remaining requests: ${rateLimiterRes.remainingPoints}`);
      } catch (rateLimiterError) {
        const retryAfterSeconds = Math.ceil(rateLimiterError.msBeforeNext / 1e3);
        const totalLimit = apiConfig.LIMIT_POINTS;
        console.warn(`[Middleware-RateLimit] Rate limit exceeded for IP: ${ipAddress}. Retry in ${retryAfterSeconds} seconds.`);
        const errorResponse = new NextResponse(JSON.stringify({
          status: "error",
          code: 429,
          message: `Too many requests. You have exceeded the limit of ${totalLimit} requests per ${apiConfig.LIMIT_DURATION} seconds. Please try again in ${retryAfterSeconds} seconds.`,
          limit: totalLimit,
          remaining: 0,
          retryAfter: retryAfterSeconds
        }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": retryAfterSeconds.toString(),
            "X-RateLimit-Limit": totalLimit.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": Math.ceil((Date.now() + rateLimiterError.msBeforeNext) / 1e3).toString(),
            "Content-Security-Policy": cspHeader.replace(/\s{2,}/g, " ").trim(),
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
            "Access-Control-Allow-Origin": "*"
          }
        });
        await performTracking(req);
        return errorResponse;
      }
    }
    const nextAuthToken = await getToken({
      req: req,
      secret: NEXTAUTH_SECRET
    });
    console.log("[Middleware-Main] nextAuthToken:", nextAuthToken);
    const isAuthenticated = !!nextAuthToken;
    console.log(`[Middleware-Main] Pathname: ${pathname}, Authentication: ${isAuthenticated ? "Yes" : "No"}`);
    const redirectUrlWithProtocol = ensureProtocol(DOMAIN_URL, DEFAULT_PROTOCOL);
    if (isApiRoute) {
      console.log(`[Middleware-Auth] API route ${pathname} accessed, continuing without authentication check.`);
      await performTracking(req);
      return response;
    }
    if (isAuthenticated) {
      if (isAuthPage) {
        console.log(`[Middleware-Auth] Authenticated user trying to access auth page (${pathname}). Redirecting to /analytics.`);
        await performTracking(req);
        return NextResponse.redirect(`${redirectUrlWithProtocol}/analytics`);
      } else if (isRootRoute) {
        console.log(`[Middleware-Auth] Authenticated user accessing home page (/). Redirecting to /analytics.`);
        await performTracking(req);
        return NextResponse.redirect(`${redirectUrlWithProtocol}/analytics`);
      }
      console.log(`[Middleware-Auth] Authenticated user continuing to ${pathname}.`);
      await performTracking(req);
      return response;
    } else {
      const isPublicPath = isAuthPage;
      if (!isPublicPath) {
        console.log(`[Middleware-Auth] Unauthenticated user trying to access ${pathname}. Redirecting to /login.`);
        await performTracking(req);
        return NextResponse.redirect(`${redirectUrlWithProtocol}/login`);
      }
      console.log(`[Middleware-Auth] Unauthenticated user continuing to ${pathname}.`);
      await performTracking(req);
      return response;
    }
  } catch (error) {
    console.error("[Middleware-Error] Unhandled error:", error);
    const errorResponse = new NextResponse(JSON.stringify({
      status: "error",
      code: 500,
      message: "Internal Server Error"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Content-Security-Policy": cspHeader.replace(/\s{2,}/g, " ").trim(),
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Access-Control-Allow-Origin": "*"
      }
    });
    return errorResponse;
  }
}