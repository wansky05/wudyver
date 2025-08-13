import axios from "axios";
import * as cheerio from "cheerio";
import apiConfig from "@/configs/apiConfig";
class Kodepos {
  constructor() {
    this.proxy_url = `https://${apiConfig.DOMAIN_URL}/api/tools/web/html/v1?url=`;
    this.base_url = "https://m.nomor.net/_kodepos.php";
    this.request_delay = 1e3;
  }
  async _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  async _fetch_with_proxy(url) {
    const max_retries = 3;
    let attempt = 0;
    while (attempt < max_retries) {
      try {
        const encoded_url = encodeURIComponent(url);
        const proxy_url = `${this.proxy_url}${encoded_url}`;
        const response = await axios.get(proxy_url, {
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          },
          timeout: 3e4
        });
        if (!response.data) {
          throw new Error("Empty response received");
        }
        return response.data;
      } catch (error) {
        attempt++;
        console.error(`Attempt ${attempt} failed:`, error.message);
        if (attempt === max_retries) {
          throw new Error(`Failed to fetch data after ${max_retries} attempts: ${error.message}`);
        }
        await this._delay(2e3 * attempt);
      }
    }
  }
  async search({
    kode,
    limit = 1,
    detail = true
  }) {
    try {
      if (!kode) {
        throw new Error("Kode POS parameter is required");
      }
      console.log(`Searching for postal code: ${kode}`);
      const search_url = `${this.base_url}?_i=cari-kodepos&jobs=${encodeURIComponent(kode)}`;
      const html = await this._fetch_with_proxy(search_url);
      const $ = cheerio.load(html);
      const result_rows = $('tbody tr[bgcolor="#ccffff"]');
      if (result_rows.length === 0) {
        throw new Error(`No results found for postal code: ${kode}`);
      }
      console.log(`Found ${result_rows.length} results, processing ${Math.min(limit, result_rows.length)} entries`);
      const results = [];
      const processed_limit = Math.min(limit, result_rows.length);
      for (let i = 0; i < processed_limit; i++) {
        const row = $(result_rows[i]);
        const result = this._parse_result_row(row, $);
        if (result.kodepos) {
          results.push(result);
        }
      }
      if (results.length === 0) {
        throw new Error("No valid results could be parsed");
      }
      const detailed_results = [];
      for (const [index, result] of results.entries()) {
        console.log(`Processing result ${index + 1}/${results.length}`);
        try {
          const detailed_result = {
            info: {
              ...result
            },
            detail: {
              desa: null,
              kecamatan: null,
              kabupaten: null,
              provinsi: null
            }
          };
          if (detail) {
            if (result.desa) {
              try {
                detailed_result.detail.desa = await this._get_detail(result.desa, result.kecamatan, result.kabupaten, "desa");
                await this._delay(this.request_delay);
              } catch (error) {
                console.warn(`Failed to get desa detail: ${error.message}`);
              }
            }
            if (result.kecamatan && result.kabupaten) {
              try {
                detailed_result.detail.kecamatan = await this._get_detail(result.kecamatan, result.kabupaten, null, "kecamatan");
                await this._delay(this.request_delay);
              } catch (error) {
                console.warn(`Failed to get kecamatan detail: ${error.message}`);
              }
            }
            if (result.kabupaten) {
              try {
                detailed_result.detail.kabupaten = await this._get_detail(result.kabupaten, null, null, "kabupaten");
                await this._delay(this.request_delay);
              } catch (error) {
                console.warn(`Failed to get kabupaten detail: ${error.message}`);
              }
            }
            if (result.provinsi) {
              try {
                detailed_result.detail.provinsi = await this._get_detail(result.provinsi, null, null, "provinsi");
                await this._delay(this.request_delay);
              } catch (error) {
                console.warn(`Failed to get provinsi detail: ${error.message}`);
              }
            }
          }
          detailed_results.push(detailed_result);
        } catch (error) {
          console.error(`Error processing result ${index}:`, error.message);
          detailed_results.push({
            info: {
              ...result
            },
            error: error.message
          });
        }
      }
      return {
        kode: kode,
        count: detailed_results.length,
        list: detailed_results
      };
    } catch (error) {
      console.error("Error in Kodepos search:", error.message);
      throw error;
    }
  }
  _parse_result_row(row, $) {
    const cells = row.find("td");
    const no = $(cells[0]).text().trim();
    const kodepos_link = $(cells[1]).find("a.ktv b");
    const kodepos = kodepos_link.text().trim();
    const detail_cell = $(cells[2]);
    const detail_text = detail_cell.text();
    const desa_match = detail_text.match(/Ds\.\s*([^•]+)/);
    const kec_match = detail_text.match(/Kec\.\s*([^•]+)/);
    const kab_match = detail_text.match(/Kab\.\s*([^•]+)/);
    const prov_match = detail_text.match(/Prov\.\s*([^•]+)/);
    const kode_wilayah_match = detail_text.match(/Kode Wilayah:\s*([0-9.]+)/);
    return {
      no: no,
      kodepos: kodepos,
      desa: desa_match ? desa_match[1].trim() : null,
      kecamatan: kec_match ? kec_match[1].trim() : null,
      kabupaten: kab_match ? kab_match[1].trim() : null,
      provinsi: prov_match ? prov_match[1].trim().replace(/\s+/g, " ") : null,
      kode_wilayah: kode_wilayah_match ? kode_wilayah_match[1].trim() : null
    };
  }
  async _get_detail(name, parent_name = null, grandparent_name = null, type) {
    const endpoints = {
      desa: "desa-kodepos",
      kecamatan: "desa-kodepos",
      kabupaten: "kecamatan-kodepos",
      provinsi: "kota-kodepos"
    };
    let url;
    switch (type) {
      case "desa":
        url = `${this.base_url}?_i=${endpoints[type]}&sby=010000&daerah=Desa-${encodeURIComponent(parent_name)}-${encodeURIComponent(grandparent_name)}&jobs=${encodeURIComponent(name)}`;
        break;
      case "kecamatan":
        url = `${this.base_url}?_i=${endpoints[type]}&sby=010000&daerah=Kecamatan-${encodeURIComponent(parent_name)}&jobs=${encodeURIComponent(name)}`;
        break;
      case "kabupaten":
        url = `${this.base_url}?_i=${endpoints[type]}&sby=010000&daerah=Kabupaten&jobs=${encodeURIComponent(name)}`;
        break;
      case "provinsi":
        url = `${this.base_url}?_i=${endpoints[type]}&sby=010000&daerah=Provinsi&jobs=${encodeURIComponent(name)}`;
        break;
      default:
        throw new Error(`Invalid detail type: ${type}`);
    }
    const html = await this._fetch_with_proxy(url);
    const $ = cheerio.load(html);
    let info_table = null;
    const color_tables = $('table[bgcolor="#CFDBC5"], table[bgcolor="#ffcccc"], table[bgcolor="#ccffff"]');
    if (color_tables.length > 0) {
      info_table = $(color_tables[0]);
    }
    if (!info_table) {
      const styled_tables = $('table[style*="border:2px solid #36c"]');
      if (styled_tables.length > 0) {
        info_table = $(styled_tables[0]);
      }
    }
    if (!info_table) {
      const tables = $("table");
      for (let i = 0; i < tables.length; i++) {
        const table = $(tables[i]);
        const text = table.text();
        if (text.includes("Kode POS") && text.includes("Kode Wilayah")) {
          info_table = table;
          break;
        }
      }
    }
    if (!info_table) {
      const tables = $("table");
      let largest = null;
      let largestSize = 0;
      for (let i = 0; i < tables.length; i++) {
        const table = $(tables[i]);
        const text = table.text();
        if (text.length > largestSize && (text.includes(name) || text.includes("Kode POS"))) {
          largest = table;
          largestSize = text.length;
        }
      }
      info_table = largest;
    }
    if (!info_table) {
      throw new Error(`Detail information not found for ${type}: ${name}`);
    }
    return this._parse_detail_table(info_table, $, type);
  }
  _parse_detail_table(table, $, type) {
    const text = table.text();
    const extract_text_after = pattern => {
      const match = text.match(new RegExp(pattern + "\\s*:?\\s*([^•\\n]+)", "i"));
      return match ? match[1].trim().replace(/\s+/g, " ") : null;
    };
    const extract_number = pattern => {
      const match = text.match(new RegExp(pattern + "\\s*:?\\s*([0-9.,]+)", "i"));
      return match ? match[1].replace(/[^0-9]/g, "") : null;
    };
    let nama = table.find("a.ktv font, a.ktv").first().text().trim();
    if (!nama) {
      const title_patterns = [new RegExp(`(?:Kelurahan|Desa)\\s*:\\s*([^\\n•]+)`, "i"), new RegExp(`Kecamatan\\s+([^\\n•]+)`, "i"), new RegExp(`Kabupaten\\s+([^\\n•]+)`, "i"), new RegExp(`Provinsi\\s+([^\\n•]+)`, "i")];
      for (const pattern of title_patterns) {
        const match = text.match(pattern);
        if (match) {
          nama = match[1].trim();
          break;
        }
      }
    }
    const result = {
      jenis: type,
      nama: nama,
      kodepos: table.find("a.ktv").filter((i, el) => /^\d+$/.test($(el).text().trim())).first().text().trim(),
      kode_wilayah: extract_text_after("Kode Wilayah(?:\\s+Administrasi)?")
    };
    switch (type) {
      case "desa":
        result.kecamatan = extract_text_after("Kecamatan");
        result.kabupaten = extract_text_after("Kab\\.");
        result.provinsi = extract_text_after("Provinsi");
        break;
      case "kecamatan":
        result.kabupaten = extract_text_after("Kabupaten");
        result.provinsi = extract_text_after("Provinsi");
        result.jumlah_desa = extract_number("Jumlah\\s+(?:Desa|Kelurahan)");
        break;
      case "kabupaten":
        result.provinsi = extract_text_after("di Provinsi");
        result.jumlah_kecamatan = extract_number("Jumlah\\s+Kecamatan");
        result.jumlah_desa = extract_number("Jumlah\\s+(?:Desa|Kelurahan)");
        result.luas_wilayah = extract_text_after("Luas\\s+Wilayah");
        result.jumlah_penduduk = extract_text_after("Jumlah\\s+Penduduk");
        const range_patterns = [/Range\\s+Realita.*?Kode\\s+POS.*?:\\s*([0-9]+)\\s*[―\-–]\\s*([0-9]+)/i, /Range.*?Kode\\s+POS.*?:\\s*([0-9]+)\\s*[―\-–]\\s*([0-9]+)/i, /Kode\\s+POS.*?:\\s*([0-9]+)\\s*[―\-–]\\s*([0-9]+)/i];
        for (const pattern of range_patterns) {
          const match = text.match(pattern);
          if (match) {
            result.range_kodepos = `${match[1]} - ${match[2]}`;
            break;
          }
        }
        break;
      case "provinsi":
        result.ibukota = extract_text_after("Ibukota");
        result.jumlah_kab_kota = extract_number("Jumlah\\s+(?:Kota|Kabupaten)");
        result.jumlah_kecamatan = extract_number("Jumlah\\s+Kecamatan");
        result.jumlah_desa = extract_number("Jumlah\\s+(?:Desa|Kelurahan)");
        result.jumlah_pulau = extract_number("Pulau.*?punya nama");
        result.luas_wilayah = extract_text_after("Luas\\s+Wilayah");
        result.jumlah_penduduk = extract_text_after("Jumlah\\s+Penduduk");
        const prov_range_patterns = [/Range\\s+Realita.*?Kode\\s+POS.*?:\\s*([0-9]+)\\s*[‒―\-–]\\s*([0-9]+)\\s+dan\\s+([0-9]+)\\s*[‒―\-–]\\s*([0-9]+)/i, /Kode\\s+POS.*?:\\s*([0-9]+)\\s*[‒―\-–]\\s*([0-9]+)\\s+dan\\s+([0-9]+)\\s*[‒―\-–]\\s*([0-9]+)/i, /([0-9]+)\\s*[‒―\-–]\\s*([0-9]+)\\s+dan\\s+([0-9]+)\\s*[‒―\-–]\\s*([0-9]+)/];
        for (const pattern of prov_range_patterns) {
          const match = text.match(pattern);
          if (match) {
            result.range_kodepos = `${match[1]} - ${match[2]} dan ${match[3]} - ${match[4]}`;
            break;
          }
        }
        break;
    }
    Object.keys(result).forEach(key => {
      if (result[key] === null || result[key] === "" || result[key] === "null" || result[key] === undefined) {
        delete result[key];
      }
    });
    return result;
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.kode) {
    return res.status(400).json({
      error: "kode are required"
    });
  }
  try {
    const kodepos = new Kodepos();
    const response = await kodepos.search(params);
    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}