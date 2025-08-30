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
import NextCors from "nextjs-cors";
import requestIp from "request-ip";

function getClientIp(req) {
  try {
    // Convert NextRequest headers to a plain object for request-ip
    const headers = {};
    req.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    
    // Create a request-like object that request-ip can understand
    const requestLike = {
      headers: headers,
      connection: {
        remoteAddress: req.ip || headers['x-forwarded-for'] || headers['x-real-ip']
      },
      socket: {
        remoteAddress: req.ip || headers['x-forwarded-for'] || headers['x-real-ip']
      },
      info: {
        remoteAddress: req.ip || headers['x-forwarded-for'] || headers['x-real-ip']
      }
    };
    
    // Use request-ip to get the client IP
    const clientIp = requestIp.getClientIp(requestLike);
    
    if (clientIp && clientIp !== '::1' && clientIp !== '127.0.0.1') {
      return clientIp;
    }
    
    // Fallback to manual detection with priority order
    const fallbackIp = 
      req.ip || 
      headers['cf-connecting-ip'] || 
      headers['x-real-ip'] || 
      headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      headers['x-client-ip'] ||
      headers['x-forwarded'] ||
      headers['forwarded-for'] ||
      headers['forwarded'] ||
      'unknown';
    
    console.log(`[IP-Detection] request-ip result: ${clientIp}, fallback: ${fallbackIp}`);
    return fallbackIp;
    
  } catch (error) {
    console.error('[IP-Detection] Error in getClientIp:', error);
    // Ultimate fallback
    return req.ip || req.headers.get("x-forwarded-for") || "unknown";
  }
}

const DOMAIN_URL = apiConfig.DOMAIN_URL || "wudysoft.xyz";
const NEXTAUTH_SECRET = apiConfig.JWT_SECRET;
const DEFAULT_PROTOCOL = "https://";

const axiosInstance = axios.create({
  timeout: 1e4,
  headers: {
    "Content-Type": "application/json",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "User-Agent": "NextJS-Middleware/1.0"
  },
});

const rateLimiter = new RateLimiterMemory({
  points: apiConfig.LIMIT_POINTS,
  duration: apiConfig.LIMIT_DURATION
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*).*)"]
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
      console.log(`[Middleware-Tracking] Mengirim data permintaan API untuk tracking: ${currentPathname}`);
      await axiosInstance.get(`${baseURL}/api/visitor/req`);
    } else if (!isApiRoute && !isAuthPage) {
      console.log(`[Middleware-Tracking] Mengirim data kunjungan halaman untuk tracking: ${currentPathname}`);
      await axiosInstance.get(`${baseURL}/api/visitor/visit`);
      await axiosInstance.post(`${baseURL}/api/visitor/info`, {
        route: currentPathname,
        time: new Date().toISOString(),
        hit: 1
      });
    }
  } catch (err) {
    const errorMessage = err.response ? `Status ${err.response.status}: ${err.response.data?.message || err.message}` : err.message;
    console.error(`[Middleware-Tracking] Gagal mencatat pengunjung untuk ${req.url}: ${errorMessage}`);
  }
}

// CORS configuration for API routes
const corsOptions = {
  origin: ['*'], // You can specify specific origins here
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Accept-Version',
    'Content-Length',
    'Content-MD5',
    'Date',
    'X-Api-Version',
    'Origin',
    'X-CSRF-Token'
  ],
  credentials: true,
  maxAge: 86400,
};

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
  const ipAddress = getClientIp(req);
  
  console.log(`[Middleware-Main] Menerima permintaan untuk: ${pathname} dari IP: ${ipAddress}`);
  console.log(`[Middleware-IP] Headers untuk deteksi IP: x-forwarded-for=${req.headers.get("x-forwarded-for")}, x-real-ip=${req.headers.get("x-real-ip")}, cf-connecting-ip=${req.headers.get("cf-connecting-ip")}`);
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
    
    const nextAuthToken = await getToken({
      req: req,
      secret: NEXTAUTH_SECRET
    });
    
    console.log("[Middleware-Main] nextAuthToken:", nextAuthToken);
    const isAuthenticated = !!nextAuthToken;
    console.log(`[Middleware-Main] Pathname: ${pathname}, Autentikasi: ${isAuthenticated ? "Ya" : "Tidak"}`);
    
    // Apply CORS to all API routes using nextjs-cors
    if (isApiRoute) {
      console.log(`[Middleware-CORS] Menerapkan CORS untuk API route: ${pathname}`);
      
      // Handle CORS for API routes
      await NextCors(req, response, corsOptions);
      
      // Handle preflight OPTIONS requests
      if (req.method === 'OPTIONS') {
        console.log(`[Middleware-CORS] Handling OPTIONS preflight request for: ${pathname}`);
        return new NextResponse(null, { 
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': corsOptions.methods.join(', '),
            'Access-Control-Allow-Headers': corsOptions.allowedHeaders.join(', '),
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Max-Age': corsOptions.maxAge.toString(),
          }
        });
      }
    }
    
    // Set security headers for all routes
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.headers.set("Content-Security-Policy", cspHeader.replace(/\s{2,}/g, " ").trim());
    
    console.log("[Middleware-Main] Header keamanan telah diatur.");
    
    // Apply rate limiting for API routes (excluding specific APIs)
    if (isApiRoute && !isVisitorApi && !isAuthApi && !isGeneralApi) {
      console.log(`[Middleware-RateLimit] Menerapkan Rate Limiting untuk API: ${pathname}`);
      try {
        const rateLimiterRes = await rateLimiter.consume(ipAddress, 1);
        response.headers.set("X-RateLimit-Limit", apiConfig.LIMIT_POINTS);
        response.headers.set("X-RateLimit-Remaining", rateLimiterRes.remainingPoints);
        response.headers.set("X-RateLimit-Reset", Math.ceil((Date.now() + rateLimiterRes.msBeforeNext) / 1e3));
        console.log(`[Middleware-RateLimit] Rate limit berhasil. Sisa permintaan: ${rateLimiterRes.remainingPoints}`);
      } catch (rateLimiterError) {
        const retryAfterSeconds = Math.ceil(rateLimiterError.msBeforeNext / 1e3);
        const totalLimit = apiConfig.LIMIT_POINTS;
        console.warn(`[Middleware-RateLimit] Rate limit terlampaui untuk IP: ${ipAddress}. Coba lagi dalam ${retryAfterSeconds} detik.`);
        
        const errorResponse = new NextResponse(JSON.stringify({
          status: "error",
          code: 429,
          message: `Terlalu banyak permintaan. Anda telah melampaui batas ${totalLimit} permintaan per ${apiConfig.LIMIT_DURATION} detik. Silakan coba lagi dalam ${retryAfterSeconds} detik.`,
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
            // Include CORS headers in error response
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": corsOptions.methods.join(', '),
            "Access-Control-Allow-Headers": corsOptions.allowedHeaders.join(', '),
            "Access-Control-Allow-Credentials": "true"
          }
        });
        await performTracking(req);
        return errorResponse;
      }
    }
    
    const redirectUrlWithProtocol = ensureProtocol(DOMAIN_URL, DEFAULT_PROTOCOL);
    
    // Handle API routes
    if (isApiRoute) {
      console.log(`[Middleware-Auth] API route ${pathname} diakses, melanjutkan tanpa pengecekan autentikasi.`);
      await performTracking(req);
      return response;
    }
    
    // Handle authenticated users
    if (isAuthenticated) {
      if (isAuthPage) {
        console.log(`[Middleware-Auth] Pengguna terautentikasi mencoba mengakses halaman otentikasi (${pathname}). Mengarahkan ke /analytics.`);
        await performTracking(req);
        return NextResponse.redirect(`${redirectUrlWithProtocol}/analytics`);
      } else if (isRootRoute) {
        console.log(`[Middleware-Auth] Pengguna terautentikasi mengakses halaman home (/). Mengarahkan ke /analytics.`);
        await performTracking(req);
        return NextResponse.redirect(`${redirectUrlWithProtocol}/analytics`);
      }
      console.log(`[Middleware-Auth] Pengguna terautentikasi melanjutkan ke ${pathname}.`);
      await performTracking(req);
      return response;
    } else {
      // Handle unauthenticated users
      const isPublicPath = isAuthPage;
      if (!isPublicPath) {
        console.log(`[Middleware-Auth] Pengguna belum terautentikasi mencoba mengakses ${pathname}. Mengarahkan ke /login.`);
        await performTracking(req);
        return NextResponse.redirect(`${redirectUrlWithProtocol}/login`);
      }
      console.log(`[Middleware-Auth] Pengguna belum terautentikasi melanjutkan ke ${pathname}.`);
      await performTracking(req);
      return response;
    }
  } catch (error) {
    console.error("[Middleware-Error] Kesalahan tidak tertangani:", error);
    const errorResponse = new NextResponse(JSON.stringify({
      status: "error",
      code: 500,
      message: "Kesalahan Server Internal"
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
        // Include CORS headers in error response for API routes
        ...(pathname.startsWith("/api") && {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": corsOptions.methods.join(', '),
          "Access-Control-Allow-Headers": corsOptions.allowedHeaders.join(', '),
          "Access-Control-Allow-Credentials": "true"
        })
      }
    });
    return errorResponse;
  }
}