// pages/api/validate.js
import apiConfig from "@/configs/apiConfig";

const DOMAIN_URL = apiConfig.DOMAIN_URL || "wudysoft.xyz";

// VPN Detection Configuration
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
    /^76\.76\./
  ]
};

// Cache for IP detection results
const ipDetectionCache = new Map();

// Simple in-memory storage for rate limiting and tracking
const trackingStore = new Map();

// Clean up old cache entries periodically
function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of ipDetectionCache.entries()) {
    if (now - value.timestamp > VPN_DETECTION_CONFIG.cacheTimeout) {
      ipDetectionCache.delete(key);
    }
  }
  
  if (ipDetectionCache.size > VPN_DETECTION_CONFIG.maxCacheSize) {
    const entries = Array.from(ipDetectionCache.entries());
    const toRemove = entries.slice(0, Math.floor(entries.length / 2));
    toRemove.forEach(([key]) => ipDetectionCache.delete(key));
    console.log(`[Cache-Cleanup] Removed ${toRemove.length} entries`);
  }
}

// Run cleanup every hour
setInterval(cleanupCache, VPN_DETECTION_CONFIG.cacheTimeout);

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

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`https://ipapi.co/${ipAddress}/json/`, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VPN-Detector/1.0)"
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
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
      "expressvpn", "nordvpn", "surfshark", "cyberghost", 
      "purevpn", "protonvpn", "hotspot shield", "windscribe", "tunnelbear"
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
        method: "api-check",
        ip: ipAddress
      }
    };
  } catch (error) {
    console.error(`[VPN-Detector] Error checking IP ${ipAddress}:`, error.message);
    // Allow access if API check fails
    return {
      allowed: true,
      blocked: false,
      error: `VPN check failed: ${error.message}`,
      details: {
        method: "error-fallback",
        ip: ipAddress
      }
    };
  }
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
    console.log(`[VPN-Detector] Checking IP: ${ipAddress} using API`);
    const result = await checkVpnWithApi(ipAddress);
    
    // Cache the result
    ipDetectionCache.set(cacheKey, {
      result: result,
      timestamp: Date.now()
    });

    if (result.blocked) {
      console.warn(`[VPN-Detector] Blocked IP ${ipAddress}: VPN detected`);
    } else {
      console.log(`[VPN-Detector] Allowed IP ${ipAddress} - not a VPN`);
    }

    return result;
  } catch (error) {
    console.error(`[VPN-Detector] Error checking IP ${ipAddress}:`, error.message);
    
    // Cache error result with shorter timeout
    const result = {
      allowed: true,
      blocked: false,
      error: `VPN check failed: ${error.message}`,
      details: {
        method: "error-fallback",
        ip: ipAddress
      }
    };
    
    ipDetectionCache.set(cacheKey, {
      result: result,
      timestamp: Date.now() - VPN_DETECTION_CONFIG.cacheTimeout * 0.8
    });
    
    return result;
  }
}

async function performTracking(requestData) {
  try {
    const { ip, pathname, method, userAgent, timestamp } = requestData;
    
    const isApiRoute = pathname.startsWith("/api");
    const isVisitorApi = pathname.includes("/api/visitor");
    const isAuthApi = pathname.includes("/api/auth");
    const isGeneralApi = pathname.includes("/api/general");
    const isAuthPage = pathname === "/login" || pathname === "/register";

    // Store tracking data in memory (in production, you might want to use a database)
    const trackingKey = `${ip}_${Date.now()}`;
    const trackingData = {
      ip,
      pathname,
      method,
      userAgent,
      timestamp,
      type: isApiRoute ? 'api' : 'page'
    };
    
    trackingStore.set(trackingKey, trackingData);
    
    // Keep only last 1000 entries to prevent memory bloat
    if (trackingStore.size > 1000) {
      const entries = Array.from(trackingStore.entries());
      const toRemove = entries.slice(0, entries.length - 1000);
      toRemove.forEach(([key]) => trackingStore.delete(key));
    }
    
    if (isApiRoute && !isVisitorApi && !isAuthApi && !isGeneralApi) {
      console.log(`[Tracking] API request logged: ${pathname} from ${ip}`);
    } else if (!isApiRoute && !isAuthPage) {
      console.log(`[Tracking] Page visit logged: ${pathname} from ${ip}`);
    }
    
  } catch (error) {
    console.error(`[Tracking] Error logging request:`, error.message);
  }
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      status: 'error', 
      message: 'Method not allowed' 
    });
  }

  try {
    const { ip, pathname, method, userAgent, timestamp } = req.body;
    
    if (!ip || !pathname) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: ip, pathname'
      });
    }

    // Perform VPN check
    console.log(`[Validate-API] Checking IP ${ip} for VPN/Proxy`);
    const vpnCheck = await checkVpnProxy(ip);
    
    if (!vpnCheck.allowed && vpnCheck.blocked) {
      console.warn(`[Validate-API] Blocked request from IP ${ip}: ${vpnCheck.reason}`);
      return res.status(vpnCheck.statusCode || 403).json({
        status: "error",
        code: vpnCheck.statusCode || 403,
        message: vpnCheck.reason || "Access denied: VPN, proxy, or Tor detected",
        details: "Please disable your VPN/proxy service and try again.",
        vpnDetails: vpnCheck.details
      });
    }

    console.log(`[Validate-API] IP ${ip} passed VPN/Proxy check`);

    // Perform tracking
    await performTracking({ ip, pathname, method, userAgent, timestamp });

    // Return success response
    return res.status(200).json({
      status: 'success',
      message: 'Validation completed',
      vpnCheck: {
        allowed: vpnCheck.allowed,
        details: vpnCheck.details
      }
    });

  } catch (error) {
    console.error('[Validate-API] Error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Export function to get tracking data (for analytics)
export function getTrackingData() {
  return Array.from(trackingStore.values());
}