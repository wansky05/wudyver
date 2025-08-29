import {
  NextResponse,
  NextRequest
} from "next/server";
import {
  getToken
} from "next-auth/jwt";
import apiConfig from "@/configs/apiConfig";
import axios from "axios";
import {
  RateLimiterMemory
} from "rate-limiter-flexible";

function getClientIp(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  return cfConnectingIp || realIp || forwarded?.split(",")[0].trim() || req.ip || "unknown";
}
const DOMAIN_URL = apiConfig.DOMAIN_URL || "wudysoft.xyz";
const NEXTAUTH_SECRET = apiConfig.JWT_SECRET;
const DEFAULT_PROTOCOL = "https://";
const allowedOrigins = [`https://${DOMAIN_URL}`, `https://www.${DOMAIN_URL}`, "http://localhost:3000", "http://localhost:3001", process.env.NODE_ENV === "development" ? "http://localhost:3002" : null].filter(Boolean);

function isValidOrigin(origin) {
  if (!origin) return false;
  return allowedOrigins.some(allowed => {
    if (allowed === origin) return true;
    if (origin.endsWith(`.${DOMAIN_URL}`)) return true;
    return false;
  });
}
const axiosInstance = axios.create({
  timeout: 1e4,
  headers: {
    "Content-Type": "application/json",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "User-Agent": "NextJS-Middleware/1.0"
  },
  maxRedirects: 3,
  validateStatus: status => status < 500
});
const rateLimiter = new RateLimiterMemory({
  points: apiConfig.LIMIT_POINTS || 100,
  duration: apiConfig.LIMIT_DURATION || 60,
  blockDuration: 60,
  execEvenly: true
});
const apiRateLimiter = new RateLimiterMemory({
  points: Math.floor((apiConfig.LIMIT_POINTS || 100) * .7),
  duration: apiConfig.LIMIT_DURATION || 60,
  blockDuration: 120
});
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.json|sw.js|workbox-.*|.*\\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|otf|mp4|webm|ogg|mp3|wav|flac|aac)).*)"]
};

function ensureProtocol(url, defaultProtocol) {
  if (!url || typeof url !== "string") return defaultProtocol + (DOMAIN_URL || "localhost");
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
    const skipTracking = ["/api/health", "/api/ping", "/favicon.ico"].includes(currentPathname);
    if (skipTracking) return;
    if (isApiRoute && !isVisitorApi && !isAuthApi && !isGeneralApi) {
      console.log(`[Middleware-Tracking] Mengirim data permintaan API untuk tracking: ${currentPathname}`);
      await axiosInstance.get(`${baseURL}/api/visitor/req`, {
        timeout: 5e3,
        headers: {
          "X-Tracking-Source": "middleware",
          "X-Route-Type": "api"
        }
      });
    } else if (!isApiRoute && !isAuthPage) {
      console.log(`[Middleware-Tracking] Mengirim data kunjungan halaman untuk tracking: ${currentPathname}`);
      await Promise.allSettled([axiosInstance.get(`${baseURL}/api/visitor/visit`, {
        timeout: 5e3,
        headers: {
          "X-Tracking-Source": "middleware",
          "X-Route-Type": "page"
        }
      }), axiosInstance.post(`${baseURL}/api/visitor/info`, {
        route: currentPathname,
        time: new Date().toISOString(),
        hit: 1,
        userAgent: req.headers.get("user-agent") || "Unknown",
        referer: req.headers.get("referer") || null
      }, {
        timeout: 5e3,
        headers: {
          "X-Tracking-Source": "middleware"
        }
      })]);
    }
  } catch (err) {
    const errorMessage = err.response ? `Status ${err.response.status}: ${err.response.data?.message || err.message}` : err.message;
    console.error(`[Middleware-Tracking] Gagal mencatat pengunjung untuk ${req.url}: ${errorMessage}`);
  }
}
const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.weatherapi.com;
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https: http:;
    font-src 'self' data:;
    connect-src 'self' https://cdn.weatherapi.com https://api.weatherapi.com wss: ws:;
    media-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    block-all-mixed-content;
    upgrade-insecure-requests;
`.replace(/\s+/g, " ").trim();

function setCorsHeaders(response, origin) {
  if (isValidOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  } else {
    if (process.env.NODE_ENV === "development") {
      response.headers.set("Access-Control-Allow-Origin", "*");
    }
  }
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version, Origin, X-CSRF-Token");
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Max-Age", "86400");
  response.headers.set("Vary", "Origin");
}

function setSecurityHeaders(response) {
  const securityHeaders = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()",
    "Content-Security-Policy": cspHeader,
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "X-DNS-Prefetch-Control": "on"
  };
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
}
export async function middleware(req) {
  const url = new URL(req.url);
  const {
    pathname
  } = url;
  const ipAddress = getClientIp(req);
  const origin = req.headers.get("origin");
  const method = req.method;
  console.log(`[Middleware-Main] ${method} ${pathname} dari IP: ${ipAddress}, Origin: ${origin || "none"}`);
  console.log("[Middleware-Main] NEXTAUTH_SECRET:", NEXTAUTH_SECRET ? "✅ Set" : "❌ Not set");
  if (method === "OPTIONS") {
    const response = new NextResponse(null, {
      status: 200
    });
    setCorsHeaders(response, origin);
    setSecurityHeaders(response);
    return response;
  }
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
    const isHealthCheck = pathname === "/api/health" || pathname === "/api/ping";
    setCorsHeaders(response, origin);
    setSecurityHeaders(response);
    console.log("[Middleware-Main] Header keamanan dan CORS telah diatur.");
    if (isHealthCheck) {
      return response;
    }
    if (isApiRoute && !isVisitorApi && !isAuthApi && !isGeneralApi) {
      console.log(`[Middleware-RateLimit] Menerapkan Rate Limiting untuk API: ${pathname}`);
      try {
        const rateLimiterRes = await apiRateLimiter.consume(ipAddress, 1);
        response.headers.set("X-RateLimit-Limit", (apiConfig.LIMIT_POINTS || 100).toString());
        response.headers.set("X-RateLimit-Remaining", rateLimiterRes.remainingPoints.toString());
        response.headers.set("X-RateLimit-Reset", Math.ceil((Date.now() + rateLimiterRes.msBeforeNext) / 1e3).toString());
        console.log(`[Middleware-RateLimit] Rate limit berhasil. Sisa permintaan: ${rateLimiterRes.remainingPoints}`);
      } catch (rateLimiterError) {
        const retryAfterSeconds = Math.ceil(rateLimiterError.msBeforeNext / 1e3);
        const totalLimit = apiConfig.LIMIT_POINTS || 100;
        console.warn(`[Middleware-RateLimit] Rate limit terlampaui untuk IP: ${ipAddress}. Coba lagi dalam ${retryAfterSeconds} detik.`);
        const errorResponse = new NextResponse(JSON.stringify({
          status: "error",
          code: 429,
          message: `Terlalu banyak permintaan API. Anda telah melampaui batas ${totalLimit} permintaan per ${apiConfig.LIMIT_DURATION || 60} detik. Silakan coba lagi dalam ${retryAfterSeconds} detik.`,
          limit: totalLimit,
          remaining: 0,
          retryAfter: retryAfterSeconds,
          type: "api_rate_limit"
        }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": retryAfterSeconds.toString(),
            "X-RateLimit-Limit": totalLimit.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": Math.ceil((Date.now() + rateLimiterError.msBeforeNext) / 1e3).toString()
          }
        });
        setCorsHeaders(errorResponse, origin);
        setSecurityHeaders(errorResponse);
        try {
          await performTracking(req);
        } catch (trackingError) {
          console.error("[Middleware-Tracking] Error during rate limit tracking:", trackingError);
        }
        return errorResponse;
      }
    }
    try {
      await rateLimiter.consume(ipAddress, 1);
    } catch (rateLimiterError) {
      if (!isApiRoute) {
        const retryAfterSeconds = Math.ceil(rateLimiterError.msBeforeNext / 1e3);
        console.warn(`[Middleware-RateLimit] General rate limit terlampaui untuk IP: ${ipAddress}`);
        const errorResponse = new NextResponse(JSON.stringify({
          status: "error",
          code: 429,
          message: "Terlalu banyak permintaan. Silakan tunggu sebentar sebelum mencoba lagi.",
          retryAfter: retryAfterSeconds,
          type: "general_rate_limit"
        }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": retryAfterSeconds.toString()
          }
        });
        setCorsHeaders(errorResponse, origin);
        setSecurityHeaders(errorResponse);
        return errorResponse;
      }
    }
    const redirectUrlWithProtocol = ensureProtocol(DOMAIN_URL, DEFAULT_PROTOCOL);
    if (isApiRoute) {
      console.log(`[Middleware-Auth] API route ${pathname} diakses, melanjutkan tanpa pengecekan autentikasi.`);
      setImmediate(async () => {
        try {
          await performTracking(req);
        } catch (error) {
          console.error("[Middleware-Tracking] Async tracking error:", error);
        }
      });
      return response;
    }
    let nextAuthToken;
    try {
      nextAuthToken = await getToken({
        req: req,
        secret: NEXTAUTH_SECRET
      });
    } catch (tokenError) {
      console.error("[Middleware-Auth] Error getting token:", tokenError);
      nextAuthToken = null;
    }
    const isAuthenticated = !!nextAuthToken;
    console.log(`[Middleware-Auth] Pathname: ${pathname}, Autentikasi: ${isAuthenticated ? "Ya" : "Tidak"}`);
    if (isAuthenticated) {
      if (isAuthPage) {
        console.log(`[Middleware-Auth] Pengguna terautentikasi mencoba mengakses halaman otentikasi (${pathname}). Mengarahkan ke /analytics.`);
        try {
          await performTracking(req);
        } catch (trackingError) {
          console.error("[Middleware-Tracking] Error during authenticated redirect tracking:", trackingError);
        }
        return NextResponse.redirect(`${redirectUrlWithProtocol}/analytics`);
      } else if (isRootRoute) {
        console.log(`[Middleware-Auth] Pengguna terautentikasi mengakses halaman home (/). Mengarahkan ke /analytics.`);
        try {
          await performTracking(req);
        } catch (trackingError) {
          console.error("[Middleware-Tracking] Error during root redirect tracking:", trackingError);
        }
        return NextResponse.redirect(`${redirectUrlWithProtocol}/analytics`);
      }
      console.log(`[Middleware-Auth] Pengguna terautentikasi melanjutkan ke ${pathname}.`);
    } else {
      const isPublicPath = isAuthPage || isRootRoute;
      if (!isPublicPath) {
        console.log(`[Middleware-Auth] Pengguna belum terautentikasi mencoba mengakses ${pathname}. Mengarahkan ke /login.`);
        try {
          await performTracking(req);
        } catch (trackingError) {
          console.error("[Middleware-Tracking] Error during unauthenticated redirect tracking:", trackingError);
        }
        return NextResponse.redirect(`${redirectUrlWithProtocol}/login`);
      }
      console.log(`[Middleware-Auth] Pengguna belum terautentikasi melanjutkan ke ${pathname}.`);
    }
    setImmediate(async () => {
      try {
        await performTracking(req);
      } catch (error) {
        console.error("[Middleware-Tracking] Async tracking error:", error);
      }
    });
    return response;
  } catch (error) {
    console.error("[Middleware-Error] Kesalahan tidak tertangani:", error);
    const errorResponse = new NextResponse(JSON.stringify({
      status: "error",
      code: 500,
      message: "Kesalahan Server Internal",
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
    setCorsHeaders(errorResponse, origin);
    setSecurityHeaders(errorResponse);
    return errorResponse;
  }
}