import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { RateLimiterMemory } from "rate-limiter-flexible";
import axios from "axios";
import apiConfig from "@/configs/apiConfig";

// Constants
const DOMAIN_URL = apiConfig.DOMAIN_URL || "wudysoft.xyz";
const NEXTAUTH_SECRET = apiConfig.JWT_SECRET;
const DEFAULT_PROTOCOL = "https://";

const allowedOrigins = [
  `https://${DOMAIN_URL}`,
  `https://www.${DOMAIN_URL}`,
  "http://localhost:3000",
  "http://localhost:3001",
  ...(process.env.NODE_ENV === "development" ? ["http://localhost:3002"] : [])
];

// Rate limiters
const rateLimiter = new RateLimiterMemory({
  points: apiConfig.LIMIT_POINTS || 100,
  duration: apiConfig.LIMIT_DURATION || 60,
  blockDuration: 60,
  execEvenly: true,
});

const apiRateLimiter = new RateLimiterMemory({
  points: Math.floor((apiConfig.LIMIT_POINTS || 100) * 0.7),
  duration: apiConfig.LIMIT_DURATION || 60,
  blockDuration: 120,
});

// Axios instance
const axiosInstance = axios.create({
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "User-Agent": "NextJS-Middleware/1.0",
  },
  maxRedirects: 3,
  validateStatus: (status) => status < 500,
});

// CSP Header
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.weatherapi.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' data: https://cdn.weatherapi.com http://*;
  font-src 'self' data: https://fonts.gstatic.com;
  connect-src 'self' https://api.weatherapi.com wss: ws:;
  media-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  block-all-mixed-content;
  upgrade-insecure-requests;
`.replace(/\s{2,}/g, " ").trim();

// Utility functions
function getClientIp(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  
  return cfConnectingIp || 
         realIp || 
         forwarded?.split(",")[0].trim() || 
         req.ip || 
         "unknown";
}

function isValidOrigin(origin) {
  if (!origin) return false;
  
  return allowedOrigins.some((allowed) => {
    if (allowed === origin) return true;
    if (origin.endsWith(`.${DOMAIN_URL}`)) return true;
    return false;
  });
}

function ensureProtocol(url, defaultProtocol = DEFAULT_PROTOCOL) {
  if (!url || typeof url !== "string") {
    return defaultProtocol + (DOMAIN_URL || "localhost");
  }
  
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return defaultProtocol + url;
  }
  
  return url;
}

function setCorsHeaders(response, origin) {
  if (isValidOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  } else if (process.env.NODE_ENV === "development") {
    response.headers.set("Access-Control-Allow-Origin", "*");
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
    "X-DNS-Prefetch-Control": "on",
  };
  
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
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
      console.log(`[Middleware-Tracking] Tracking API request: ${currentPathname}`);
      
      await axiosInstance.get(`${baseURL}/api/visitor/req`, {
        timeout: 5000,
        headers: {
          "X-Tracking-Source": "middleware",
          "X-Route-Type": "api",
        },
      });
    } else if (!isApiRoute && !isAuthPage) {
      console.log(`[Middleware-Tracking] Tracking page visit: ${currentPathname}`);
      
      await Promise.allSettled([
        axiosInstance.get(`${baseURL}/api/visitor/visit`, {
          timeout: 5000,
          headers: {
            "X-Tracking-Source": "middleware",
            "X-Route-Type": "page",
          },
        }),
        axiosInstance.post(`${baseURL}/api/visitor/info`, {
          route: currentPathname,
          time: new Date().toISOString(),
          hit: 1,
          userAgent: req.headers.get("user-agent") || "Unknown",
          referer: req.headers.get("referer") || null,
        }, {
          timeout: 5000,
          headers: {
            "X-Tracking-Source": "middleware",
          },
        }),
      ]);
    }
  } catch (error) {
    const errorMessage = error.response 
      ? `Status ${error.response.status}: ${error.response.data?.message || error.message}`
      : error.message;
    
    console.error(`[Middleware-Tracking] Failed to track visitor for ${req.url}: ${errorMessage}`);
  }
}

async function handleRateLimit(ipAddress, rateLimiter, config) {
  try {
    const result = await rateLimiter.consume(ipAddress, 1);
    return { success: true, result };
  } catch (error) {
    return { success: false, error };
  }
}

export async function middleware(req) {
  const url = new URL(req.url);
  const { pathname } = url;
  const ipAddress = getClientIp(req);
  const origin = req.headers.get("origin");
  const method = req.method;
  
  console.log(`[Middleware-Main] ${method} ${pathname} from IP: ${ipAddress}, Origin: ${origin || "none"}`);
  console.log("[Middleware-Main] NEXTAUTH_SECRET:", NEXTAUTH_SECRET ? "✅ Set" : "❌ Not set");
  
  // Handle preflight OPTIONS requests
  if (method === "OPTIONS") {
    const response = new NextResponse(null, { status: 200 });
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
    
    // Set CORS and security headers
    setCorsHeaders(response, origin);
    setSecurityHeaders(response);
    console.log("[Middleware-Main] Security and CORS headers set.");
    
    // Skip processing for health checks
    if (isHealthCheck) {
      return response;
    }
    
    // API rate limiting
    if (isApiRoute && !isVisitorApi && !isAuthApi && !isGeneralApi) {
      console.log(`[Middleware-RateLimit] Applying API rate limiting: ${pathname}`);
      
      const { success, result, error } = await handleRateLimit(ipAddress, apiRateLimiter, apiConfig);
      
      if (success) {
        response.headers.set("X-RateLimit-Limit", (apiConfig.LIMIT_POINTS || 100).toString());
        response.headers.set("X-RateLimit-Remaining", result.remainingPoints.toString());
        response.headers.set("X-RateLimit-Reset", Math.ceil((Date.now() + result.msBeforeNext) / 1000).toString());
        
        console.log(`[Middleware-RateLimit] Rate limit passed. Remaining: ${result.remainingPoints}`);
      } else {
        const retryAfterSeconds = Math.ceil(error.msBeforeNext / 1000);
        const totalLimit = apiConfig.LIMIT_POINTS || 100;
        
        console.warn(`[Middleware-RateLimit] API rate limit exceeded for IP: ${ipAddress}. Retry after ${retryAfterSeconds} seconds.`);
        
        const errorResponse = new NextResponse(JSON.stringify({
          status: "error",
          code: 429,
          message: `Too many API requests. You have exceeded the limit of ${totalLimit} requests per ${apiConfig.LIMIT_DURATION || 60} seconds. Please try again in ${retryAfterSeconds} seconds.`,
          limit: totalLimit,
          remaining: 0,
          retryAfter: retryAfterSeconds,
          type: "api_rate_limit",
        }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": retryAfterSeconds.toString(),
            "X-RateLimit-Limit": totalLimit.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": Math.ceil((Date.now() + error.msBeforeNext) / 1000).toString(),
          },
        });
        
        setCorsHeaders(errorResponse, origin);
        setSecurityHeaders(errorResponse);
        
        // Track rate limit error
        setImmediate(async () => {
          try {
            await performTracking(req);
          } catch (trackingError) {
            console.error("[Middleware-Tracking] Error during rate limit tracking:", trackingError);
          }
        });
        
        return errorResponse;
      }
    }
    
    // General rate limiting
    const generalRateLimit = await handleRateLimit(ipAddress, rateLimiter, apiConfig);
    if (!generalRateLimit.success && !isApiRoute) {
      const retryAfterSeconds = Math.ceil(generalRateLimit.error.msBeforeNext / 1000);
      
      console.warn(`[Middleware-RateLimit] General rate limit exceeded for IP: ${ipAddress}`);
      
      const errorResponse = new NextResponse(JSON.stringify({
        status: "error",
        code: 429,
        message: "Too many requests. Please wait before trying again.",
        retryAfter: retryAfterSeconds,
        type: "general_rate_limit",
      }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": retryAfterSeconds.toString(),
        },
      });
      
      setCorsHeaders(errorResponse, origin);
      setSecurityHeaders(errorResponse);
      return errorResponse;
    }
    
    const redirectUrlWithProtocol = ensureProtocol(DOMAIN_URL, DEFAULT_PROTOCOL);
    
    // Handle API routes
    if (isApiRoute) {
      console.log(`[Middleware-Auth] API route ${pathname} accessed, continuing without auth check.`);
      
      // Async tracking for API routes
      setImmediate(async () => {
        try {
          await performTracking(req);
        } catch (error) {
          console.error("[Middleware-Tracking] Async tracking error:", error);
        }
      });
      
      return response;
    }
    
    // Authentication check for non-API routes
    let nextAuthToken;
    try {
      nextAuthToken = await getToken({
        req: req,
        secret: NEXTAUTH_SECRET,
      });
    } catch (tokenError) {
      console.error("[Middleware-Auth] Error getting token:", tokenError);
      nextAuthToken = null;
    }
    
    const isAuthenticated = !!nextAuthToken;
    console.log(`[Middleware-Auth] Path: ${pathname}, Authenticated: ${isAuthenticated ? "Yes" : "No"}`);
    
    if (isAuthenticated) {
      // Redirect authenticated users from auth pages or root to analytics
      if (isAuthPage) {
        console.log(`[Middleware-Auth] Authenticated user accessing auth page (${pathname}). Redirecting to /analytics.`);
        
        setImmediate(async () => {
          try {
            await performTracking(req);
          } catch (trackingError) {
            console.error("[Middleware-Tracking] Error during authenticated redirect tracking:", trackingError);
          }
        });
        
        return NextResponse.redirect(`${redirectUrlWithProtocol}/analytics`);
      } else if (isRootRoute) {
        console.log(`[Middleware-Auth] Authenticated user accessing root (/). Redirecting to /analytics.`);
        
        setImmediate(async () => {
          try {
            await performTracking(req);
          } catch (trackingError) {
            console.error("[Middleware-Tracking] Error during root redirect tracking:", trackingError);
          }
        });
        
        return NextResponse.redirect(`${redirectUrlWithProtocol}/analytics`);
      }
      
      console.log(`[Middleware-Auth] Authenticated user continuing to ${pathname}.`);
    } else {
      // Handle unauthenticated users
      const isPublicPath = isAuthPage || isRootRoute;
      
      if (!isPublicPath) {
        console.log(`[Middleware-Auth] Unauthenticated user trying to access ${pathname}. Redirecting to /login.`);
        
        setImmediate(async () => {
          try {
            await performTracking(req);
          } catch (trackingError) {
            console.error("[Middleware-Tracking] Error during unauthenticated redirect tracking:", trackingError);
          }
        });
        
        return NextResponse.redirect(`${redirectUrlWithProtocol}/login`);
      }
      
      console.log(`[Middleware-Auth] Unauthenticated user continuing to ${pathname}.`);
    }
    
    // Async tracking for successful requests
    setImmediate(async () => {
      try {
        await performTracking(req);
      } catch (error) {
        console.error("[Middleware-Tracking] Async tracking error:", error);
      }
    });
    
    return response;
    
  } catch (error) {
    console.error("[Middleware-Error] Unhandled error:", error);
    
    const errorResponse = new NextResponse(JSON.stringify({
      status: "error",
      code: 500,
      message: "Internal Server Error",
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
    
    setCorsHeaders(errorResponse, origin);
    setSecurityHeaders(errorResponse);
    return errorResponse;
  }
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*).*)"
  ],
};