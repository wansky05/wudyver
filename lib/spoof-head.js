import crypto from "crypto";
const SpoofHead = (extra = {}) => {
  const randomIP = () => {
    const ip = Array.from({
      length: 4
    }, () => crypto.randomInt(256)).join(".");
    return ip;
  };
  const randomUA = () => {
    const oses = ["Windows NT 10.0; Win64; x64", "Macintosh; Intel Mac OS X 10_15_7", "X11; Linux x86_64", "Linux; Android 10; K"];
    const browsers = ["AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36", "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Mobile Safari/537.36", "rv:107.0) Gecko/20100101 Firefox/107.0"];
    const os = oses[crypto.randomInt(oses.length)];
    const browser = browsers[crypto.randomInt(browsers.length)];
    return `Mozilla/5.0 (${os}) ${browser}`;
  };
  const ip = randomIP();
  const ua = randomUA();
  const ipHeaders = {
    "x-forwarded-for": ip,
    "x-real-ip": ip,
    "client-ip": ip,
    "cf-connecting-ip": ip,
    "true-client-ip": ip,
    "x-original-ip": ip,
    "x-originating-ip": ip,
    "x-remote-ip": ip,
    "x-remote-addr": ip,
    forwarded: `for=${ip}`,
    "x-cluster-client-ip": ip,
    "x-proxy-id": `p${crypto.randomInt(1e4, 99999)}`,
    "x-forwarded-for-original": ip,
    "x-forwarded-by": ip,
    via: `1.1 ${ip}`,
    "proxy-connection": "keep-alive",
    "user-agent": ua,
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    pragma: "no-cache"
  };
  return {
    ...ipHeaders,
    ...extra
  };
};
export default SpoofHead;