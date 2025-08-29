import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { RateLimiterMemory } from "rate-limiter-flexible";

// Configuration
const setting = {
  DOMAIN_URL: process.env.DOMAIN_URL || "wudysoft.xyz",
  JWT_SECRET: process.env.NEXTAUTH_SECRET,
  RATE_LIMIT_POINTS: parseInt(process.env.RATE_LIMIT_POINTS) || 100,
  RATE_LIMIT_DURATION: parseInt(process.env.RATE_LIMIT_DURATION) || 60,
  NODE_ENV: process.env.NODE_ENV || "development"
};

// Rate limiter
const rateLimiter = new RateLimiterMemory({
  points: setting.RATE_LIMIT_POINTS,
  duration: setting.RATE_LIMIT_DURATION
});

// Utility functions
function getClientIp(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  return realIp || forwarded?.split(",")[0] || req.ip || "unknown";
}

function ensureProtocol(url) {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return "https://" + url;
  }
  return url;
}

// Security headers
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY", 
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:; upgrade-insecure-requests;"
};

// CORS headers  
const corsHeaders = {
  "Access-Control-Allow-Origin": setting.NODE_ENV === "production" ? `https://${setting.DOMAIN_URL}` : "*",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRF-Token",
  "Access-Control-Max-Age": "86400"
};

// Tracking function
async function performTracking(req) {
  if (setting.NODE_ENV === "development") return;
  
  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const baseURL = ensureProtocol(setting.DOMAIN_URL);
    
    const isApiRoute = pathname.startsWith("/api");
    const isVisitorApi = pathname.includes("/api/visitor");
    const isAuthApi = pathname.includes("/api/auth");
    const isGeneralApi = pathname.includes("/api/general");
    const isAuthPage = pathname === "/login" || pathname === "/register";

    if (isVisitorApi || isAuthApi || isGeneralApi || isAuthPage) {
      return;
    }

    if (isApiRoute) {
      fetch(`${baseURL}/api/visitor/req`, {
        method: "GET",
        headers: { "User-Agent": "NextJS-Middleware/1.0" }
      }).catch(() => {});
    } else {
      fetch(`${baseURL}/api/visitor/visit`, {
        method: "GET", 
        headers: { "User-Agent": "NextJS-Middleware/1.0" }
      }).catch(() => {});
      
      fetch(`${baseURL}/api/visitor/info`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "NextJS-Middleware/1.0"
        },
        body: JSON.stringify({
          route: pathname,
          time: new Date().toISOString(),
          hit: 1
        })
      }).catch(() => {});
    }
  } catch (error) {
    console.error("[Middleware] Tracking error:", error.message);
  }
}

// Rate limiting
async function handleRateLimit(ipAddress) {
  try {
    const result = await rateLimiter.consume(ipAddress);
    return {
      success: true,
      remaining: result.remainingPoints,
      reset: Math.ceil((Date.now() + result.msBeforeNext) / 1000)
    };
  } catch (error) {
    const retryAfter = Math.ceil(error.msBeforeNext / 1000);
    return {
      success: false,
      retryAfter,
      response: new NextResponse(JSON.stringify({
        error: "Too Many Requests",
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        retryAfter
      }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": retryAfter.toString(),
          "X-RateLimit-Limit": setting.RATE_LIMIT_POINTS.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": Math.ceil((Date.now() + error.msBeforeNext) / 1000).toString(),
          ...securityHeaders
        }
      })
    };
  }
}

// Middleware configuration
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*|robots.txt|sitemap.xml).*)"
  ]
};

export async function middleware(req) {
  const url = new URL(req.url);
  const { pathname } = url;
  const ipAddress = getClientIp(req);

  console.log(`[Middleware] ${req.method} ${pathname} from ${ipAddress}`);

  try {
    // Skip static files
    if (pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js|woff|woff2|ttf|eot)$/)) {
      return NextResponse.next();
    }

    // Route classification
    const isApiRoute = pathname.startsWith("/api");
    const isAuthPage = pathname === "/login" || pathname === "/register";
    const isRootRoute = pathname === "/";
    const isProtectedRoute = pathname.startsWith("/analytics") || pathname.startsWith("/dashboard");
    
    // API specific routes
    const isVisitorApi = pathname.includes("/api/visitor");
    const isAuthApi = pathname.includes("/api/auth"); 
    const isGeneralApi = pathname.includes("/api/general");

    let response = NextResponse.next();

    // Apply security headers
    Object.entries(securityHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Handle API routes
    if (isApiRoute) {
      // Apply CORS headers
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      // Handle preflight requests
      if (req.method === "OPTIONS") {
        return new NextResponse(null, {
          status: 200,
          headers: { ...securityHeaders, ...corsHeaders }
        });
      }

      // Rate limiting for API (excluding certain endpoints)
      if (!isVisitorApi && !isAuthApi && !isGeneralApi) {
        const rateLimitResult = await handleRateLimit(ipAddress);
        
        if (!rateLimitResult.success) {
          await performTracking(req);
          return rateLimitResult.response;
        }

        response.headers.set("X-RateLimit-Limit", setting.RATE_LIMIT_POINTS.toString());
        response.headers.set("X-RateLimit-Remaining", rateLimitResult.remaining.toString());
        response.headers.set("X-RateLimit-Reset", rateLimitResult.reset.toString());
      }

      await performTracking(req);
      return response;
    }

    // Authentication check for non-API routes
    const token = await getToken({
      req,
      secret: setting.JWT_SECRET
    });

    const isAuthenticated = !!token;
    const redirectBase = ensureProtocol(setting.DOMAIN_URL);

    console.log(`[Middleware] Authentication: ${isAuthenticated ? "Yes" : "No"}`);

    if (isAuthenticated) {
      // Redirect authenticated users from auth pages
      if (isAuthPage) {
        await performTracking(req);
        return NextResponse.redirect(`${redirectBase}/analytics`);
      }
      
      // Redirect authenticated users from root to dashboard
      if (isRootRoute) {
        await performTracking(req);
        return NextResponse.redirect(`${redirectBase}/analytics`);
      }
    } else {
      // Redirect unauthenticated users from protected routes
      if (isProtectedRoute) {
        await performTracking(req);
        return NextResponse.redirect(`${redirectBase}/login`);
      }
    }

    await performTracking(req);
    return response;

  } catch (error) {
    console.error("[Middleware] Error:", error);
    
    return new NextResponse(JSON.stringify({
      error: "Internal Server Error",
      message: "Something went wrong"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...securityHeaders
      }
    });
  }
}