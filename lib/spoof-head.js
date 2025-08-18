import crypto from "crypto";
const SpoofHead = (extra = {}) => {
  const ip = [10, crypto.randomInt(256), crypto.randomInt(256), crypto.randomInt(256)].join(".");
  const ipv6 = `::ffff:${ip}`;
  const cfConnectingIp = ip;
  const trueClientIp = ip;
  const genericHeaders = {
    "x-client-ip": ip,
    "x-forwarded-for": ip,
    "x-real-ip": ip,
    "x-original-forwarded-for": ip,
    "x-forwarded": ip,
    "forwarded-for": ip,
    forwarded: `for=${ip}`,
    "x-cluster-client-ip": ip,
    "cf-connecting-ip": cfConnectingIp,
    "true-client-ip": trueClientIp,
    "fastly-client-ip": ip,
    "x-forwarded-host": ip,
    "x-forwarded-server": ip,
    "x-remote-ip": ip,
    "x-remote-addr": ip,
    "x-http-forwarded": ip,
    "x-originating-ip": ip,
    "x-host": ip,
    "x-custom-ip-authorization": ip,
    "x-proxy-id": crypto.randomInt(1e4).toString(),
    via: `1.1 ${crypto.randomBytes(8).toString("hex")}`,
    "x-request-id": crypto.randomBytes(16).toString("hex"),
    "x-request-start": `t=${Date.now()}`,
    "x-nginx-proxy": "true",
    "x-sucuri-clientip": ip,
    "x-ip-address": ip,
    "x-ip-trail": ip,
    "x-arr-log-id": crypto.randomBytes(16).toString("hex"),
    "x-waws-ip": ip,
    "x-azure-clientip": ip,
    "x-azure-socketip": ip,
    "x-azure-ref": `0z${crypto.randomBytes(8).toString("hex").toUpperCase()}`,
    "client-ip": ip,
    "http-client-ip": ip,
    "http-x-forwarded-for": ip,
    "http-x-forwarded": ip,
    "http-x-cluster-client-ip": ip,
    "http-forwarded-for": ip,
    "http-forwarded": ip,
    "http-via": ip,
    "http-x-real-ip": ip
  };
  return {
    ...genericHeaders,
    ...extra
  };
};
export default SpoofHead;