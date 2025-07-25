import axios from "axios";
import * as cheerio from "cheerio";
class smstome {
  async Country() {
    try {
      const {
        data
      } = await axios.get("https://smstome.com");
      const $ = cheerio.load(data);
      return $(".column.fields ul li").map((_, li) => ({
        title: $("a", li).text().trim(),
        countryCode: $("a", li).attr("href")?.split("/").pop(),
        countryFlag: "https://smstome.com" + $("img", li).attr("src"),
        link: "https://smstome.com" + $("a", li).attr("href")
      })).get().filter(x => Object.values(x).every(Boolean));
    } catch (err) {
      console.error("smstome.Country() error:", err.message);
      return [];
    }
  }
  async getNumber(country) {
    try {
      const {
        data
      } = await axios.get(`https://smstome.com/country/${country}`);
      const $ = cheerio.load(data);
      return $(".numview").map((_, el) => ({
        phoneNumber: $("a", el).text().trim(),
        location: $("div.row:nth-child(1) > div > small", el).text().trim(),
        addedDate: $("div.row:nth-child(2) > small", el).text().trim(),
        link: $("a", el).attr("href")
      })).get().filter(x => Object.values(x).every(Boolean));
    } catch (err) {
      console.error(`smstome.getNumber(${country}) error:`, err.message);
      return [];
    }
  }
  async getMessage(url, page = 1) {
    try {
      const {
        data
      } = await axios.get(page ? `${url}?page=${page}` : url);
      const $ = cheerio.load(data);
      return $("table.messagesTable tbody tr").map((_, row) => ({
        from: $("td:nth-child(1)", row).text().trim(),
        received: $("td:nth-child(2)", row).text().trim(),
        content: $("td:nth-child(3)", row).text().trim()
      })).get().filter(x => Object.values(x).every(Boolean));
    } catch (err) {
      console.error(`smstome.getMessage(${url}) error:`, err.message);
      return [];
    }
  }
}
class sms24 {
  async Country() {
    try {
      const {
        data
      } = await axios.get("https://sms24.me/en/countries");
      const $ = cheerio.load(data);
      return $(".callout").map((_, div) => ({
        title: $("span.placeholder.h5", div).text().trim(),
        link: "https://sms24.me/en/countries/" + $("span.fi", div).attr("data-flag"),
        countryFlag: $("span.fi", div).attr("data-flag")
      })).get();
    } catch (err) {
      console.error("sms24.Country() error:", err.message);
      return [];
    }
  }
  async getNumber(country) {
    try {
      const {
        data
      } = await axios.get(`https://sms24.me/en/countries/${country}`);
      const $ = cheerio.load(data);
      return $(".callout").map((_, el) => ({
        phoneNumber: $(".fw-bold.text-primary", el).text().trim(),
        country: $("h5", el).text().trim()
      })).get();
    } catch (err) {
      console.error(`sms24.getNumber(${country}) error:`, err.message);
      return [];
    }
  }
  async getMessage(number) {
    try {
      const {
        data
      } = await axios.get(`https://sms24.me/en/numbers/${number}`);
      const $ = cheerio.load(data);
      return $(".shadow-sm.bg-light.rounded.border-start.border-info.border-5").map((_, el) => ({
        from: $("a", el).text().replace("From:", "").trim(),
        content: $("span", el).text().trim()
      })).get();
    } catch (err) {
      console.error(`sms24.getMessage(${number}) error:`, err.message);
      return [];
    }
  }
}
export default async function handler(req, res) {
  const {
    method,
    query,
    body
  } = req;
  const input = method === "GET" ? query : body;
  const {
    service,
    action,
    country,
    number,
    page
  } = input;
  const help = {
    services: {
      smstome: {
        description: "Receive SMS from smstome.com",
        actions: {
          country: "List available countries",
          number: "List phone numbers from a country (requires `country`)",
          message: "List messages from a number URL (requires `number`, optional `page`)"
        }
      },
      sms24: {
        description: "Receive SMS from sms24.me",
        actions: {
          country: "List available countries",
          number: "List phone numbers from a country (requires `country`)",
          message: "List messages from number ID (requires `number`)"
        }
      }
    },
    exampleUsage: [{
      method: "GET",
      url: "/api/tools/virtualnum?service=smstome&action=country"
    }, {
      method: "POST",
      body: {
        service: "sms24",
        action: "number",
        country: "indonesia"
      }
    }]
  };
  if (!service || !help.services[service]) {
    return res.status(400).json({
      error: "Invalid or missing `service`.",
      availableServices: Object.keys(help.services),
      exampleUsage: help.exampleUsage
    });
  }
  if (!action || !help.services[service].actions[action]) {
    return res.status(400).json({
      error: "Invalid or missing `action`.",
      availableActions: help.services[service].actions,
      exampleUsage: help.exampleUsage
    });
  }
  const instance = service === "smstome" ? new smstome() : new sms24();
  try {
    switch (action) {
      case "country": {
        const data = await instance.Country();
        return res.status(200).json(data);
      }
      case "number": {
        if (!country) {
          return res.status(400).json({
            error: "Missing `country` parameter."
          });
        }
        const data = await instance.getNumber(country.toLowerCase());
        return res.status(200).json(data);
      }
      case "message": {
        if (!number) {
          return res.status(400).json({
            error: "Missing `number` parameter."
          });
        }
        const data = await instance.getMessage(number, page);
        return res.status(200).json(data);
      }
      default:
        return res.status(400).json({
          error: "Unknown action.",
          availableActions: help.services[service].actions
        });
    }
  } catch (err) {
    console.error("API error:", err.message);
    return res.status(500).json({
      error: "Internal Server Error"
    });
  }
}