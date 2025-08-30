import {
  NextResponse,
  NextRequest
} from "next/server";
import {
  getToken
} from "next-auth/jwt";
import apiConfig from "@/configs/apiConfig";
import NextCors from "nextjs-cors";

// Simple IP extraction without external dependencies
async function getClientIp(req) {
  try {
    // Get IP from various headers
    const forwardedFor = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    const cfConnectingIp = req.headers.get("cf-connecting-ip");
    
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }
    if (realIp) {
      return realIp;
    }
    if (cfConnectingIp) {
      return cfConnectingIp;
    }
    return req.ip || "unknown";
  } catch (error) {
    console.warn("[IP-Detection] Failed to get client IP:", error.message);
    return "unknown";
  }
}

const DOMAIN_URL = apiConfig.DOMAIN_URL || "wudysoft.xyz";
const NEXTAUTH_SECRET = apiConfig.JWT_SECRET;
const DEFAULT_PROTOCOL = "https://";

// Simple rate limiter using Map
const rateLimitStore = new Map();

function createSimpleRateLimiter() {
  return {
    async consume(key, points = 1) {
      const now = Date.now();
      const windowStart = now - apiConfig.LIMIT_DURATION * 1000;
      
      if (!rateLimitStore.has(key)) {
        rateLimitStore.set(key, []);
      }
      
      const userRequests = rateLimitStore.get(key);
      const validRequests = userRequests.filter(timestamp => timestamp > windowStart);
      
      if (validRequests.length >= apiConfig.LIMIT_POINTS) {
        const oldestRequest = Math.min(...validRequests);
        const msBeforeNext = oldestRequest + apiConfig.LIMIT_DURATION * 1000 - now;
        const error = new Error("Rate limit exceeded");
        error.msBeforeNext = msBeforeNext;
        throw error;
      }
      
      validRequests.push(now);
      rateLimitStore.set(key, validRequests);
      
      return {
        remainingPoints: apiConfig.LIMIT_POINTS - validRequests.length,
        msBeforeNext: 0
      };
    }
  };
}

const rateLimiter = createSimpleRateLimiter();

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-*.js|.*\\.(?:json$|ico$|js$|css$|png$|jpg$|jpeg$|gif$|svg$|woff$|woff2$|ttf$|eot$)).*)"]
};

function ensureProtocol(url, defaultProtocol) {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return defaultProtocol + url;
  }
  return url;
}

// Call validation API instead of doing tracking directly
async function callValidationApi(req, ipAddress, pathname) {
  try {
    const baseURL = ensureProtocol(DOMAIN_URL, DEFAULT_PROTOCOL);
    const response = await fetch(`${baseURL}/api/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ip: ipAddress,
        pathname: pathname,
        method: req.method,
        userAgent: req.headers.get('user-agent'),
        timestamp: new Date().toISOString()
      })
    });
    
    if (!response.ok) {
      console.warn(`[Validation-API] Failed to call validation API: ${response.status}`);
    }
  } catch (err) {
    console.error(`[Validation-API] Error calling validation API:`, err.message);
  }
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
  const { pathname } = url;
  const ipAddress = await getClientIp(req);
  
  console.log(`[Middleware-Main] Receiving request for: ${pathname} from IP: ${ipAddress}`);
  console.log("[Middleware-Main] NEXTAUTH_SECRET (first 5 chars):", NEXTAUTH_SECRET ? NEXTAUTH_SECRET.substring(0, 5) + "..." : "Not set");

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
    const isValidateApi = pathname === "/api/validate";

    // Set security headers
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.headers.set("Content-Security-Policy", cspHeader.replace(/\s{2,}/g, " ").trim());

    // Handle CORS for API routes
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

    // Apply rate limiting for API routes (except whitelisted ones)
    if (isApiRoute && !isVisitorApi && !isAuthApi && !isGeneralApi && !isValidateApi) {
      console.log(`[Middleware-RateLimit] Applying Rate Limiting for API: ${pathname}`);
      try {
        const rateLimiterRes = await rateLimiter.consume(ipAddress, 1);
        response.headers.set("X-RateLimit-Limit", apiConfig.LIMIT_POINTS.toString());
        response.headers.set("X-RateLimit-Remaining", rateLimiterRes.remainingPoints.toString());
        response.headers.set("X-RateLimit-Reset", Math.ceil((Date.now() + rateLimiterRes.msBeforeNext) / 1000).toString());
        console.log(`[Middleware-RateLimit] Rate limit successful. Remaining requests: ${rateLimiterRes.remainingPoints}`);
      } catch (rateLimiterError) {
        const retryAfterSeconds = Math.ceil(rateLimiterError.msBeforeNext / 1000);
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
            "X-RateLimit-Reset": Math.ceil((Date.now() + rateLimiterError.msBeforeNext) / 1000).toString(),
            "Content-Security-Policy": cspHeader.replace(/\s{2,}/g, " ").trim(),
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
            "Access-Control-Allow-Origin": "*"
          }
        });
        
        // Call validation API before returning error
        await callValidationApi(req, ipAddress, pathname);
        return errorResponse;
      }
    }

    // Authentication check
    const nextAuthToken = await getToken({
      req: req,
      secret: NEXTAUTH_SECRET
    });
    
    console.log("[Middleware-Main] nextAuthToken:", nextAuthToken);
    const isAuthenticated = !!nextAuthToken;
    console.log(`[Middleware-Main] Pathname: ${pathname}, Authentication: ${isAuthenticated ? "Yes" : "No"}`);

    const redirectUrlWithProtocol = ensureProtocol(DOMAIN_URL, DEFAULT_PROTOCOL);

    // Handle API routes
    if (isApiRoute) {
      console.log(`[Middleware-Auth] API route ${pathname} accessed, continuing without authentication check.`);
      await callValidationApi(req, ipAddress, pathname);
      return response;
    }

    // Handle authenticated users
    if (isAuthenticated) {
      if (isAuthPage) {
        console.log(`[Middleware-Auth] Authenticated user trying to access auth page (${pathname}). Redirecting to /analytics.`);
        await callValidationApi(req, ipAddress, pathname);
        return NextResponse.redirect(`${redirectUrlWithProtocol}/analytics`);
      } else if (isRootRoute) {
        console.log(`[Middleware-Auth] Authenticated user accessing home page (/). Redirecting to /analytics.`);
        await callValidationApi(req, ipAddress, pathname);
        return NextResponse.redirect(`${redirectUrlWithProtocol}/analytics`);
      }
      
      console.log(`[Middleware-Auth] Authenticated user continuing to ${pathname}.`);
      await callValidationApi(req, ipAddress, pathname);
      return response;
    } else {
      // Handle unauthenticated users
      const isPublicPath = isAuthPage;
      if (!isPublicPath) {
        console.log(`[Middleware-Auth] Unauthenticated user trying to access ${pathname}. Redirecting to /login.`);
        await callValidationApi(req, ipAddress, pathname);
        return NextResponse.redirect(`${redirectUrlWithProtocol}/login`);
      }
      
      console.log(`[Middleware-Auth] Unauthenticated user continuing to ${pathname}.`);
      await callValidationApi(req, ipAddress, pathname);
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