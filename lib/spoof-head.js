import crypto from "crypto";
class SpoofHead {
  getUAFull(ua) {
    if (ua.includes("Chrome")) return '"Chromium";v="108", "Google Chrome";v="108", "Not:A-Brand";v="99"';
    if (ua.includes("Firefox")) return '"Firefox";v="107"';
    return '"Not:A-Brand";v="99"';
  }
  isMobile(ua) {
    return ua.includes("Mobile") ? "?1" : "?0";
  }
  getPlatform(ua) {
    if (ua.includes("Windows")) return '"Windows"';
    if (ua.includes("Macintosh")) return '"macOS"';
    if (ua.includes("Linux")) return '"Linux"';
    if (ua.includes("Android")) return '"Android"';
    if (ua.includes("iPhone")) return '"iOS"';
    return '"Unknown"';
  }
  randomIP() {
    return Array.from({
      length: 4
    }, () => crypto.randomInt(256)).join(".");
  }
  randomUUID() {
    return crypto.randomUUID();
  }
  randomUA() {
    const oses = ["Windows NT 10.0; Win64; x64", "Macintosh; Intel Mac OS X 10_15_7", "X11; Linux x86_64", "Linux; Android 10; K"];
    const browsers = ["AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36", "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Mobile Safari/537.36", "rv:107.0) Gecko/20100101 Firefox/107.0"];
    const os = oses[crypto.randomInt(oses.length)];
    const browser = browsers[crypto.randomInt(browsers.length)];
    return `Mozilla/5.0 (${os}) ${browser}`;
  }
  randomReferer() {
    const protocols = ["http", "https"];
    const domains = ["google.com", "yahoo.com", "bing.com", "duckduckgo.com", "example.com"];
    const protocol = protocols[crypto.randomInt(protocols.length)];
    const domain = domains[crypto.randomInt(domains.length)];
    return `${protocol}://${domain}/`;
  }
  buildHeaders(extra = {}) {
    const ip = this.randomIP();
    const ua = this.randomUA();
    const referer = this.randomReferer();
    const baseHeaders = {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/json",
      "cache-control": "no-cache",
      referer: referer,
      "referrer-policy": "strict-origin-when-cross-origin",
      "oai-device-id": this.randomUUID(),
      "user-agent": ua,
      pragma: "no-cache",
      priority: "u=1, i",
      "sec-ch-ua": this.getUAFull(ua),
      "sec-ch-ua-mobile": this.isMobile(ua),
      "sec-ch-ua-platform": this.getPlatform(ua),
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      origin: referer.replace(/\/[^/]*$/, ""),
      "x-forwarded-for": ip,
      "x-originating-ip": ip,
      "x-remote-ip": ip,
      "x-remote-addr": ip,
      "x-host": ip,
      "x-forwarded-host": ip,
      "x-real-ip": ip,
      "x-client-ip": ip
    };
    return {
      ...baseHeaders,
      ...extra
    };
  }
}
export default SpoofHead;