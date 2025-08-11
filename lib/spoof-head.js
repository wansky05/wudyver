import crypto from "crypto";

const SpoofHead = (extra = {}) => {
  const randomIP = () => {
    return Array.from({
      length: 4
    }, () => crypto.randomInt(256)).join(".");
  };

  const ip = randomIP();

  const ipHeaders = {
    "x-forwarded-for": ip,
    "x-real-ip": ip,
    "client-ip": ip,
    "cf-connecting-ip": ip,
    "true-client-ip": ip,
    "x-original-ip": ip,
    "x-originating-ip": ip,
    "x-remote-ip": ip,
    "x-remote-addr": ip
  };

  return {
    ...ipHeaders,
    ...extra
  };
};

export default SpoofHead;