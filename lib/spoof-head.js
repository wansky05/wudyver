import crypto from "crypto";
const SpoofHead = (extra = {}) => {
  const ip = [10, crypto.randomInt(256), crypto.randomInt(256), crypto.randomInt(256)].join(".");
  const genericHeaders = {
    "x-client-ip": ip,
    "x-forwarded-for": ip,
    "x-real-ip": ip
  };
  return {
    ...genericHeaders,
    ...extra
  };
};
export default SpoofHead;