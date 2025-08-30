/**
 * Next.js Middleware with CORS and VPN/Proxy Detection
 * 
 * Required packages:
 * npm install nextjs-cors@latest @lock-sdk/main
 * 
 * Features:
 * - CORS handling using nextjs-cors
 * - VPN/Proxy/Tor detection and blocking
 * - Rate limiting
 * - Authentication checks
 * - Security headers
 * - Visitor tracking
 */

import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import apiConfig from "@/configs/apiConfig";
import axios from "axios";
import { RateLimiterMemory } from "rate-limiter-flexible";
import NextCors from 'nextjs-cors';
import { secure, vpnDetector } from '@lock-sdk/vpn-detection';

function getClientIp(req) {
  return req.ip || req.headers.get("x-forwarded-for") || "unknown";
}

const DOMAIN_URL = apiConfig.DOMAIN_URL || "localhost";
const NEXTAUTH_SECRET = apiConfig.JWT_SECRET;
const DEFAULT_PROTOCOL = "https://";

const axiosInstance = axios.create({
  headers: {
    "Content-Type": "application/json",
    "Accept-Encoding": "gzip, deflate, br, zstd",
  },
});

const rateLimiter = new RateLimiterMemory({
  points: apiConfig.LIMIT_POINTS,
  duration: apiConfig.LIMIT_DURATION,
});

// Configure VPN Detector
const vpnBlocker = secure()(
  vpnDetector({
    provider: 'ipapi',
    blockVpn: true,
    blockProxy: true,
    blockTor: true,
    blockDatacenter: true,
    vpnScoreThreshold: 0.7,
    proxyScoreThreshold: 0.7,
    torScoreThreshold: 0.7,
    datacenterScoreThreshold: 0.7,
    failBehavior: 'open', // Allow on provider/cache error
    blockStatusCode: 403,
    blockMessage: 'Access denied: VPN, proxy, or Tor detected. Please disable your VPN/proxy and try again.',
    logResults: true,
    ipHeaders: ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip'],
    useRemoteAddress: true,
    storage: 'memory',
    cacheTtl: 3600000, // 1 hour cache
    cacheSize: 10000,
    logFunction: (msg, data) => {
      console.log(`[VPN-Detector] ${msg}`, data);
    }
  })
);

// Perbaikan matcher untuk PWA - memperbolehkan file penting PWA
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-*.js|.*\\.(?:json$|ico$|js$|css$|png$|jpg$|jpeg$|gif$|svg$|woff$|woff2$|ttf$|eot$)).*)",
  ],
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
        hit: 1,
      });
    }
  } catch (err) {
    const errorMessage = err.response
      ? `Status ${err.response.status}: ${err.response.data?.message || err.message}`
      : err.message;
    console.error(`[Middleware-Tracking] Gagal mencatat pengunjung untuk ${req.url}: ${errorMessage}`);
  }
}

// Helper function to check VPN/Proxy with error handling
async function checkVpnProxy(req) {
  try {
    // Create a mock response object for VPN detector
    const mockRes = {
      status: (code) => {
        return {
          json: (data) => ({ statusCode: code, data }),
          send: (data) => ({ statusCode: code, data })
        };
      },
      json: (data) => ({ data }),
      send: (data) => ({ data }),
      setHeader: () => {},
      end: () => {}
    };

    // Run VPN detection
    const result = await new Promise((resolve, reject) => {
      vpnBlocker(req, mockRes, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve(true);
        }
      });
    });

    return { allowed: true, blocked: false };
  } catch (error) {
    console.error('[VPN-Detector] Error during VPN detection:', error);
    
    // Check if it's a blocking error (VPN/Proxy detected)
    if (error.statusCode === 403 || error.message?.includes('VPN') || error.message?.includes('proxy')) {
      return {
        allowed: false,
        blocked: true,
        reason: error.message || 'VPN or proxy detected',
        statusCode: error.statusCode || 403
      };
    }
    
    // For other errors, allow access (fail-open behavior)
    console.warn('[VPN-Detector] Non-blocking error, allowing access:', error.message);
    return { allowed: true, blocked: false };
  }
}

// Helper function to apply CORS using nextjs-cors
async function applyCors(req, res) {
  await NextCors(req, res, {
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    origin: '*', // You can customize this based on your needs
    optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
    credentials: true, // if you need to support credentials
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });
}

const cspHeader = `
  frame-ancestors 'none';
  block-all-mixed-content;
  upgrade-insecure-requests;
`;

export async function middleware(req) {
  const url = new URL(req.url);
  const { pathname } = url;
  const ipAddress = getClientIp(req);
  
  console.log(`[Middleware-Main] Menerima permintaan untuk: ${pathname} dari IP: ${ipAddress}`);
  console.log(
    "[Middleware-Main] NEXTAUTH_SECRET (first 5 chars):",
    NEXTAUTH_SECRET ? NEXTAUTH_SECRET.substring(0, 5) + "..." : "Not set"
  );

  // Check for VPN/Proxy/Tor before processing request
  console.log(`[VPN-Detector] Checking IP ${ipAddress} for VPN/Proxy/Tor`);
  const vpnCheck = await checkVpnProxy(req);
  
  if (!vpnCheck.allowed && vpnCheck.blocked) {
    console.warn(`[VPN-Detector] Blocked request from IP ${ipAddress}: ${vpnCheck.reason}`);
    
    return new NextResponse(
      JSON.stringify({
        status: "error",
        code: vpnCheck.statusCode || 403,
        message: vpnCheck.reason || "Access denied: VPN, proxy, or Tor detected",
        details: "Please disable your VPN/proxy service and try again.",
      }),
      {
        status: vpnCheck.statusCode || 403,
        headers: {
          "Content-Type": "application/json",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
          "X-XSS-Protection": "1; mode=block",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
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

    // Atur header keamanan dasar untuk semua respons
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.headers.set("Content-Security-Policy", cspHeader.replace(/\s{2,}/g, " ").trim());

    // Apply CORS using nextjs-cors for API routes
    if (isApiRoute) {
      // Create a mock response object that nextjs-cors can work with
      const mockRes = {
        setHeader: (name, value) => {
          response.headers.set(name, value);
        },
        getHeader: (name) => {
          return response.headers.get(name);
        },
        status: (code) => {
          response = NextResponse.json({}, { status: code, headers: Object.fromEntries(response.headers) });
          return mockRes;
        },
        end: () => {
          // Mock end function
        }
      };

      try {
        await applyCors(req, mockRes);
        console.log("[Middleware-CORS] CORS headers applied using nextjs-cors");
      } catch (corsError) {
        console.error("[Middleware-CORS] Error applying CORS:", corsError);
        // Fallback to manual CORS headers if nextjs-cors fails
        response.headers.set("Access-Control-Allow-Origin", "*");
        response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      }
      
      // Untuk permintaan OPTIONS, langsung kembalikan respons 200
      if (req.method === "OPTIONS") {
        return new NextResponse(null, { 
          status: 200, 
          headers: Object.fromEntries(response.headers)
        });
      }
    }

    console.log("[Middleware-Main] Header keamanan telah diatur.");

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
        
        const errorResponse = new NextResponse(
          JSON.stringify({
            status: "error",
            code: 429,
            message: `Terlalu banyak permintaan. Anda telah melampaui batas ${totalLimit} permintaan per ${apiConfig.LIMIT_DURATION} detik. Silakan coba lagi dalam ${retryAfterSeconds} detik.`,
            limit: totalLimit,
            remaining: 0,
            retryAfter: retryAfterSeconds,
          }),
          {
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
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
        
        await performTracking(req);
        return errorResponse;
      }
    }

    const nextAuthToken = await getToken({
      req: req,
      secret: NEXTAUTH_SECRET,
    });
    
    console.log("[Middleware-Main] nextAuthToken:", nextAuthToken);
    const isAuthenticated = !!nextAuthToken;
    console.log(`[Middleware-Main] Pathname: ${pathname}, Autentikasi: ${isAuthenticated ? "Ya" : "Tidak"}`);

    const redirectUrlWithProtocol = ensureProtocol(DOMAIN_URL, DEFAULT_PROTOCOL);

    if (isApiRoute) {
      console.log(`[Middleware-Auth] API route ${pathname} diakses, melanjutkan tanpa pengecekan autentikasi.`);
      await performTracking(req);
      return response;
    }

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
    
    const errorResponse = new NextResponse(
      JSON.stringify({
        status: "error",
        code: 500,
        message: "Kesalahan Server Internal",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Content-Security-Policy": cspHeader.replace(/\s{2,}/g, " ").trim(),
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
          "X-XSS-Protection": "1; mode=block",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
    
    return errorResponse;
  }
}