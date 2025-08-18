import crypto from "crypto";
const SpoofHead = () => {
  const ip = [10, crypto.randomInt(256), crypto.randomInt(256), crypto.randomInt(256)].join(".");
  return {
    "x-forwarded-for": ip,
    "x-real-ip": ip,
    "x-client-ip": ip,
    "client-ip": ip,
    forwarded: `for=${ip}`,
    "x-forwarded-proto": "https",
    via: `1.1 ${crypto.randomBytes(4).toString("hex")}`,
    "x-request-id": crypto.randomBytes(8).toString("hex")
  };
};
export default SpoofHead;