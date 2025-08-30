// middleware.js - Simplified middleware with nextjs-cors for all API routes
import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import apiConfig from "@/configs/apiConfig";
import NextCors from "nextjs-cors";

const DOMAIN_URL = apiConfig.DOMAIN_URL || "wudysoft.xyz";
const NEXTAUTH_SECRET = apiConfig.JWT_SECRET;
const DEFAULT_PROTOCOL = "https://";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-*.js|.*\\.(?:json$|ico$|js$|css$|png$|jpg$|jpeg$|gif$|svg$|woff$|woff2$|ttf$|eot$)).*)"]
};

function ensureProtocol(url, defaultProtocol) {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return defaultProtocol + url;
  }
  return url;
}

async function getClientIp(req) {
  return req.headers.get("x-forwarded-for") || 
         req.headers.get("x-real-ip") || 
         req.ip || 
         "unknown";
}

// CORS configuration for all API routes
const corsOptions = {
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  origin: "*",
  optionsSuccessStatus: 200,
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Cookie", "User-Agent", "X-Forwarded-For", "X-Real-IP"]
};

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

    // Handle CORS for all API routes using nextjs-cors
    if (isApiRoute) {
      // Create a mock response object for nextjs-cors
      const mockRes = {
        headers: new Map(),
        setHeader: function(name, value) {
          this.headers.set(name, value);
        },
        getHeader: function(name) {
          return this.headers.get(name);
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        end: function() {
          return this;
        }
      };

      // Apply CORS using nextjs-cors
      await NextCors(req, mockRes, corsOptions);

      // Handle preflight OPTIONS requests
      if (req.method === "OPTIONS") {
        const response = new NextResponse(null, { status: 200 });
        
        // Copy CORS headers from mock response to actual response
        mockRes.headers.forEach((value, key) => {
          response.headers.set(key, value);
        });
        
        return response;
      }

      // For non-OPTIONS API requests, continue with CORS headers
      let response = NextResponse.next();
      
      // Copy CORS headers from mock response to actual response
      mockRes.headers.forEach((value, key) => {
        response.headers.set(key, value);
      });

      // Set additional security headers
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("X-Frame-Options", "DENY");
      response.headers.set("X-XSS-Protection", "1; mode=block");
      response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      response.headers.set("Content-Security-Policy", cspHeader.replace(/\s{2,}/g, " ").trim());

      // Skip validation for specific routes
      if (isValidateApi || isVisitorApi || isAuthApi || isGeneralApi) {
        return response;
      }

      // Call backend validation API for other API routes
      const baseURL = ensureProtocol(DOMAIN_URL, DEFAULT_PROTOCOL);
      const validationResponse = await fetch(`${baseURL}/api/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": req.headers.get("authorization") || "",
          "Cookie": req.headers.get("cookie") || "",
          "User-Agent": req.headers.get("user-agent") || "",
          "X-Forwarded-For": req.headers.get("x-forwarded-for") || "",
          "X-Real-IP": req.headers.get("x-real-ip") || ""
        },
        body: JSON.stringify({
          url: req.url,
          pathname: pathname,
          method: req.method,
          ip: ipAddress,
          headers: Object.fromEntries(req.headers.entries())
        })
      });

      const validationResult = await validationResponse.json();

      // Handle validation result
      if (!validationResult.success) {
        const errorResponse = new NextResponse(JSON.stringify({
          status: "error",
          code: validationResult.statusCode || 403,
          message: validationResult.message || "Access denied",
          details: validationResult.details || "Request blocked by validation"
        }), {
          status: validationResult.statusCode || 403,
          headers: {
            "Content-Type": "application/json"
          }
        });

        // Apply CORS headers to error response
        mockRes.headers.forEach((value, key) => {
          errorResponse.headers.set(key, value);
        });
        
        // Add security headers
        errorResponse.headers.set("X-Content-Type-Options", "nosniff");
        errorResponse.headers.set("X-Frame-Options", "DENY");
        errorResponse.headers.set("X-XSS-Protection", "1; mode=block");
        errorResponse.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
        errorResponse.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

        return errorResponse;
      }

      // Set rate limit headers if provided
      if (validationResult.rateLimitHeaders) {
        Object.entries(validationResult.rateLimitHeaders).forEach(([key, value]) => {
          response.headers.set(key, value.toString());
        });
      }

      return response;
    }

    // Handle non-API routes (pages)
    let response = NextResponse.next();

    // Set security headers for all responses
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.headers.set("Content-Security-Policy", cspHeader.replace(/\s{2,}/g, " ").trim());

    // Call backend validation API for page routes
    const baseURL = ensureProtocol(DOMAIN_URL, DEFAULT_PROTOCOL);
    const validationResponse = await fetch(`${baseURL}/api/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": req.headers.get("authorization") || "",
        "Cookie": req.headers.get("cookie") || "",
        "User-Agent": req.headers.get("user-agent") || "",
        "X-Forwarded-For": req.headers.get("x-forwarded-for") || "",
        "X-Real-IP": req.headers.get("x-real-ip") || ""
      },
      body: JSON.stringify({
        url: req.url,
        pathname: pathname,
        method: req.method,
        ip: ipAddress,
        headers: Object.fromEntries(req.headers.entries())
      })
    });

    const validationResult = await validationResponse.json();

    // Handle validation result
    if (!validationResult.success) {
      return new NextResponse(JSON.stringify({
        status: "error",
        code: validationResult.statusCode || 403,
        message: validationResult.message || "Access denied",
        details: validationResult.details || "Request blocked by validation"
      }), {
        status: validationResult.statusCode || 403,
        headers: {
          "Content-Type": "application/json",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
          "X-XSS-Protection": "1; mode=block",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
        }
      });
    }

    // Handle redirects from validation
    if (validationResult.redirect) {
      return NextResponse.redirect(validationResult.redirect);
    }

    return response;

  } catch (error) {
    console.error("[Middleware-Error] Error calling validation API:", error);
    
    // Fallback to basic security check
    const nextAuthToken = await getToken({
      req: req,
      secret: NEXTAUTH_SECRET
    });
    
    const isAuthenticated = !!nextAuthToken;
    const redirectUrlWithProtocol = ensureProtocol(DOMAIN_URL, DEFAULT_PROTOCOL);
    const isApiRoute = pathname.startsWith("/api");
    const isAuthPage = isLoginRoute || isRegisterRoute;
    
    if (!isApiRoute && !isAuthPage && !isAuthenticated) {
      return NextResponse.redirect(`${redirectUrlWithProtocol}/login`);
    }
    
    let response = NextResponse.next();
    
    // Set security headers even in fallback
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    
    return response;
  }
}