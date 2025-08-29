import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { RateLimiterMemory } from "rate-limiter-flexible";

// Centralized configuration (must match next.config.js)
const APP_CONFIG = {
  DOMAIN_URL: process.env.DOMAIN_URL || "wudysoft.xyz",
  JWT_SECRET: process.env.NEXTAUTH_SECRET,
  PROTOCOL: process.env.PROTOCOL || "https://",
  API_TIMEOUT: parseInt(process.env.API_TIMEOUT) || 10000,
  RATE_LIMIT_POINTS: parseInt(process.env.RATE_LIMIT_POINTS) || 100,
  RATE_LIMIT_DURATION: parseInt(process.env.RATE_LIMIT_DURATION) || 60,
  NODE_ENV: process.env.NODE_ENV || "development"
};

// Route patterns
const ROUTE_PATTERNS = {
  API: /^\/api/,
  AUTH_API: /^\/api\/auth/,
  VISITOR_API: /^\/api\/visitor/,
  GENERAL_API: /^\/api\/general/,
  HEALTH_API: /^\/api\/health/,
  STATIC: /^\/(_next\/static|_next\/image|favicon\.ico|manifest\.json|sw\.js|workbox-.*)/,
  AUTH_PAGES: /^\/(?:login|register)$/,
  PROTECTED_PAGES: /^\/(?:analytics|dashboard|admin)/,
  PUBLIC_PAGES: /^\/(?:$|about|contact|privacy|terms)/
};

// Security headers (consistent with next.config.js)
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ].join("; ")
};

// CORS headers (consistent with next.config.js)
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": APP_CONFIG.NODE_ENV === "production" 
    ? `${APP_CONFIG.PROTOCOL}${APP_CONFIG.DOMAIN_URL}` 
    : "*",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD",
  "Access-Control-Allow-Headers": [
    "X-CSRF-Token", "X-Requested-With", "Accept", "Accept-Version", 
    "Accept-Encoding", "Content-Length", "Content-MD5", "Content-Type", 
    "Date", "X-Api-Version", "Authorization", "Origin", "X-Custom-Header",
    "X-Real-IP", "X-Forwarded-For"
  ].join(", "),
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin, Accept-Encoding"
};

// Initialize rate limiter
const rateLimiter = new RateLimiterMemory({
  points: APP_CONFIG.RATE_LIMIT_POINTS,
  duration: APP_CONFIG.RATE_LIMIT_DURATION,
  blockDuration: APP_CONFIG.RATE_LIMIT_DURATION
});

// Utility functions
function getClientIp(req) {
  const xForwardedFor = req.headers.get("x-forwarded-for");
  const xRealIp = req.headers.get("x-real-ip");
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  
  return cfConnectingIp || xRealIp || xForwardedFor?.split(',')[0]?.trim() || req.ip || "unknown";
}

function ensureProtocol(url, defaultProtocol = "https://") {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return defaultProtocol + url;
  }
  return url;
}

function createSecureResponse(data, status = 200, additionalHeaders = {}) {
  const response = new NextResponse(
    typeof data === 'string' ? data : JSON.stringify(data),
    { status }
  );

  // Apply security headers
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  // Apply additional headers
  Object.entries(additionalHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

function logMiddleware(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logData = { timestamp, level, message, ...data };
  
  if (APP_CONFIG.NODE_ENV === "development" || level === "error") {
    console[level === "error" ? "error" : "log"](`[Middleware-${level.toUpperCase()}]`, logData);
  }
}

async function handleRateLimit(req, ipAddress) {
  try {
    const rateLimitResult = await rateLimiter.consume(ipAddress, 1);
    
    return {
      success: true,
      headers: {
        "X-RateLimit-Limit": APP_CONFIG.RATE_LIMIT_POINTS.toString(),
        "X-RateLimit-Remaining": rateLimitResult.remainingPoints.toString(),
        "X-RateLimit-Reset": Math.ceil((Date.now() + rateLimitResult.msBeforeNext) / 1000).toString()
      }
    };
  } catch (rateLimiterError) {
    const retryAfterSeconds = Math.ceil(rateLimiterError.msBeforeNext / 1000);
    
    logMiddleware("warn", "Rate limit exceeded", {
      ip: ipAddress,
      retryAfter: retryAfterSeconds,
      url: req.url
    });

    return {
      success: false,
      retryAfter: retryAfterSeconds,
      response: createSecureResponse({
        status: "error",
        code: 429,
        message: `Rate limit exceeded. Too many requests from your IP address. Please try again in ${retryAfterSeconds} seconds.`,
        limit: APP_CONFIG.RATE_LIMIT_POINTS,
        remaining: 0,
        retryAfter: retryAfterSeconds
      }, 429, {
        "Content-Type": "application/json",
        "Retry-After": retryAfterSeconds.toString(),
        "X-RateLimit-Limit": APP_CONFIG.RATE_LIMIT_POINTS.toString(),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": Math.ceil((Date.now() + rateLimiterError.msBeforeNext) / 1000).toString()
      })
    };
  }
}

async function performTracking(req) {
  // Skip tracking in development or if tracking is disabled
  if (APP_CONFIG.NODE_ENV === "development" || process.env.DISABLE_TRACKING === "true") {
    return;
  }

  try {
    const currentUrl = new URL(req.url);
    const currentPathname = currentUrl.pathname;
    const baseURL = ensureProtocol(APP_CONFIG.DOMAIN_URL, APP_CONFIG.PROTOCOL);
    
    const isApiRoute = ROUTE_PATTERNS.API.test(currentPathname);
    const isVisitorApi = ROUTE_PATTERNS.VISITOR_API.test(currentPathname);
    const isAuthApi = ROUTE_PATTERNS.AUTH_API.test(currentPathname);
    const isGeneralApi = ROUTE_PATTERNS.GENERAL_API.test(currentPathname);
    const isHealthApi = ROUTE_PATTERNS.HEALTH_API.test(currentPathname);
    const isAuthPage = ROUTE_PATTERNS.AUTH_PAGES.test(currentPathname);

    // Skip tracking for certain routes
    if (isVisitorApi || isAuthApi || isGeneralApi || isHealthApi || isAuthPage) {
      return;
    }

    const trackingPromises = [];
    
    if (isApiRoute) {
      logMiddleware("info", "Tracking API request", { pathname: currentPathname });
      trackingPromises.push(
        fetch(`${baseURL}/api/visitor/req`, {
          method: 'GET',
          headers: {
            'User-Agent': 'NextJS-Middleware/1.0',
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(5000) // 5 second timeout
        }).catch(err => 
          logMiddleware("error", "Failed to track API request", { error: err.message })
        )
      );
    } else {
      logMiddleware("info", "Tracking page visit", { pathname: currentPathname });
      
      trackingPromises.push(
        fetch(`${baseURL}/api/visitor/visit`, {
          method: 'GET',
          headers: {
            'User-Agent': 'NextJS-Middleware/1.0',
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(5000)
        }).catch(err => 
          logMiddleware("error", "Failed to track visit", { error: err.message })
        )
      );

      trackingPromises.push(
        fetch(`${baseURL}/api/visitor/info`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'NextJS-Middleware/1.0',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            route: currentPathname,
            time: new Date().toISOString(),
            hit: 1,
            userAgent: req.headers.get('user-agent'),
            referer: req.headers.get('referer')
          }),
          signal: AbortSignal.timeout(5000)
        }).catch(err => 
          logMiddleware("error", "Failed to track info", { error: err.message })
        )
      );
    }

    // Execute tracking calls without awaiting (fire and forget)
    Promise.allSettled(trackingPromises);
    
  } catch (error) {
    logMiddleware("error", "Tracking error", { 
      error: error.message,
      url: req.url 
    });
  }
}

// Middleware configuration
export const config = {
  matcher: [
    // Include all routes except static files
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*|robots.txt|sitemap.xml).*)"
  ]
};

export async function middleware(req) {
  const startTime = Date.now();
  const url = new URL(req.url);
  const { pathname, search } = url;
  const ipAddress = getClientIp(req);
  const userAgent = req.headers.get("user-agent") || "Unknown";

  logMiddleware("info", "Incoming request", {
    pathname,
    search,
    method: req.method,
    ip: ipAddress,
    userAgent: userAgent.substring(0, 100) // Limit length
  });

  try {
    // Skip middleware for static files
    if (ROUTE_PATTERNS.STATIC.test(pathname)) {
      return NextResponse.next();
    }

    // Route classification
    const isApiRoute = ROUTE_PATTERNS.API.test(pathname);
    const isAuthPage = ROUTE_PATTERNS.AUTH_PAGES.test(pathname);
    const isProtectedPage = ROUTE_PATTERNS.PROTECTED_PAGES.test(pathname);
    const isPublicPage = ROUTE_PATTERNS.PUBLIC_PAGES.test(pathname);
    const isRootRoute = pathname === "/";
    
    // API-specific routes
    const isVisitorApi = ROUTE_PATTERNS.VISITOR_API.test(pathname);
    const isAuthApi = ROUTE_PATTERNS.AUTH_API.test(pathname);
    const isGeneralApi = ROUTE_PATTERNS.GENERAL_API.test(pathname);
    const isHealthApi = ROUTE_PATTERNS.HEALTH_API.test(pathname);

    // Create base response
    let response = NextResponse.next();

    // Apply security headers to all responses
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Handle CORS for API routes
    if (isApiRoute) {
      Object.entries(CORS_HEADERS).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      // Handle OPTIONS preflight requests
      if (req.method === "OPTIONS") {
        return createSecureResponse("", 200, CORS_HEADERS);
      }
    }

    // Rate limiting for API routes (excluding certain endpoints)
    if (isApiRoute && !isVisitorApi && !isAuthApi && !isGeneralApi && !isHealthApi) {
      const rateLimitResult = await handleRateLimit(req, ipAddress);
      
      if (!rateLimitResult.success) {
        // Perform tracking before returning rate limit response
        await performTracking(req);
        return rateLimitResult.response;
      }

      // Apply rate limit headers
      Object.entries(rateLimitResult.headers).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }

    // Authentication check
    let isAuthenticated = false;
    let authToken = null;

    try {
      authToken = await getToken({
        req,
        secret: APP_CONFIG.JWT_SECRET
      });
      isAuthenticated = !!authToken;
      
      logMiddleware("info", "Authentication check", {
        authenticated: isAuthenticated,
        userId: authToken?.sub || null
      });
    } catch (authError) {
      logMiddleware("error", "Authentication error", {
        error: authError.message
      });
    }

    const redirectBase = ensureProtocol(APP_CONFIG.DOMAIN_URL, APP_CONFIG.PROTOCOL);

    // Handle API routes - skip auth redirect
    if (isApiRoute) {
      await performTracking(req);
      return response;
    }

    // Handle authenticated users
    if (isAuthenticated) {
      if (isAuthPage) {
        logMiddleware("info", "Redirecting authenticated user from auth page", {
          from: pathname,
          to: "/analytics"
        });
        await performTracking(req);
        return NextResponse.redirect(`${redirectBase}/analytics`);
      }

      if (isRootRoute) {
        logMiddleware("info", "Redirecting authenticated user from root", {
          from: pathname,
          to: "/analytics"
        });
        await performTracking(req);
        return NextResponse.redirect(`${redirectBase}/analytics`);
      }

      // Allow access to protected and public pages
      await performTracking(req);
      return response;
    }

    // Handle unauthenticated users
    if (isProtectedPage || (!isPublicPage && !isRootRoute && !isAuthPage)) {
      logMiddleware("info", "Redirecting unauthenticated user", {
        from: pathname,
        to: "/login"
      });
      
      const loginUrl = new URL(`${redirectBase}/login`);
      if (pathname !== "/" && !isAuthPage) {
        loginUrl.searchParams.set("callbackUrl", pathname + search);
      }
      
      await performTracking(req);
      return NextResponse.redirect(loginUrl.toString());
    }

    // Allow access to public pages and auth pages
    await performTracking(req);
    
    // Add performance headers
    const processingTime = Date.now() - startTime;
    response.headers.set("X-Response-Time", `${processingTime}ms`);
    
    return response;

  } catch (error) {
    logMiddleware("error", "Middleware error", {
      error: error.message,
      stack: error.stack,
      pathname
    });

    return createSecureResponse({
      status: "error",
      code: 500,
      message: "Internal Server Error",
      ...(APP_CONFIG.NODE_ENV === "development" && { 
        debug: error.message 
      })
    }, 500, {
      "Content-Type": "application/json"
    });
  }
}