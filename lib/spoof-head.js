import crypto from "crypto";
const SpoofHead = (extra = {}) => {
  const randomIP = () => {
    return Array.from({
      length: 4
    }, () => crypto.randomInt(256)).join(".");
  };
  const ip = randomIP();
  const genericHeaders = {
    "client-ip": ip,
    "true-client-ip": ip,
    "x-client-ip": ip,
    "x-custom-ip-authorization": ip,
    "x-forward-for": ip,
    "x-forwarded-for": ip,
    "x-originating-ip": ip,
    "x-real-ip": ip,
    "x-remote-addr": ip,
    "x-remote-ip": ip
  };
  return {
    ...genericHeaders,
    ...extra
  };
};
export default SpoofHead;