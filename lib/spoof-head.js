import crypto from "crypto";
class IPSpoofer {
  #generateIP() {
    return `10.${crypto.randomInt(1, 255)}.${crypto.randomInt(1, 255)}.${crypto.randomInt(1, 255)}`;
  }
  getHeaders() {
    const ip = this.#generateIP();
    return {
      "x-forwarded-for": ip,
      "x-real-ip": ip,
      "x-client-ip": ip,
      forwarded: `for=${ip}`,
      "x-forwarded-proto": "https",
      "x-forwarded-port": "443",
      via: `1.1 fake-proxy-${crypto.randomInt(1e3)}`,
      "x-request-id": crypto.randomBytes(8).toString("hex")
    };
  }
}
const spoofer = new IPSpoofer();
const SpoofHead = () => {
  return spoofer.getHeaders();
};
export default SpoofHead;