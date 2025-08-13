import axios from "axios";
import * as cheerio from "cheerio";
class JadwalNonton {
  constructor() {
    this.baseUrl = "https://jadwalnonton.com";
    this.index = {
      location: {
        description: "Mendapatkan daftar lokasi/kota yang tersedia (indeks dimulai dari 1)",
        example: 'await jn.search({ type: "location" })'
      },
      theater: {
        description: "Mendapatkan daftar bioskop di kota tertentu (indeks dimulai dari 1)",
        params: {
          kota: "number (indeks) atau string (nama kota), default: 1 (semua kota)"
        },
        example: 'await jn.search({ type: "theater", kota: 1 }) // Semua kota'
      },
      detail: {
        description: "Mendapatkan detail bioskop termasuk jadwal film (indeks dimulai dari 1)",
        params: {
          lokasi: "number (indeks) atau string (url), default: 1 (bioskop pertama)"
        },
        example: 'await jn.search({ type: "detail", lokasi: 1 })'
      }
    };
  }
  async search({
    type = "location",
    kota = 1,
    lokasi = 1
  } = {}) {
    console.log(`Memulai pencarian type: ${type}, kota: ${kota}, lokasi: ${lokasi}`);
    try {
      switch (type.toLowerCase()) {
        case "location":
          return await this._getLocations();
        case "theater":
          return await this._getTheaters(kota);
        case "detail":
          return await this._getTheaterDetail(lokasi);
        default:
          throw new Error(`Type '${type}' tidak valid. Gunakan 'location', 'theater', atau 'detail'`);
      }
    } catch (error) {
      console.error(`[ERROR] Gagal melakukan pencarian (type: ${type}):`, error.message);
      throw error;
    } finally {
      console.log(`Pencarian type: ${type} selesai`);
    }
  }
  async _getLocations() {
    console.log("Memulai proses mendapatkan lokasi...");
    try {
      const response = await axios.get(`${this.baseUrl}/bioskop`);
      console.log("Berhasil mendapatkan response lokasi");
      const $ = cheerio.load(response.data);
      console.log("Memproses data lokasi...");
      const locations = $(".ctlist.dfinder.wmal li").map((i, el) => {
        const link = $(el).find("a");
        return {
          id: i + 1,
          name: link.text().trim(),
          url: link.attr("href"),
          key: link.data("k") || null
        };
      }).get();
      const result = {
        allCities: {
          id: 0,
          name: "Semua kota",
          url: `${this.baseUrl}/bioskop/`,
          active: $(".ctlist.hons li").first().hasClass("active")
        },
        nearest: {
          id: -1,
          name: "Terdekat",
          url: $(".ctlist.hons li.mekan a").data("next"),
          recommended: true
        },
        cities: locations
      };
      console.log(`Berhasil mendapatkan ${locations.length} lokasi`);
      return result;
    } catch (error) {
      console.error("[ERROR] Gagal mendapatkan lokasi:", error.message);
      throw new Error("Gagal memuat daftar lokasi");
    }
  }
  async _getTheaters(kota = 1) {
    console.log(`Memulai proses mendapatkan bioskop untuk kota: ${kota}`);
    try {
      console.log("Mendapatkan daftar lokasi...");
      const locations = await this._getLocations();
      let url;
      let kotaName = "";
      if (typeof kota === "number") {
        const adjustedIndex = kota - 1;
        if (adjustedIndex === -1) {
          url = locations.nearest.url;
          kotaName = locations.nearest.name;
        } else if (adjustedIndex >= 0 && adjustedIndex < locations.cities.length) {
          url = locations.cities[adjustedIndex].url;
          kotaName = locations.cities[adjustedIndex].name;
        } else {
          url = locations.allCities.url;
          kotaName = locations.allCities.name;
        }
      } else if (typeof kota === "string") {
        const found = locations.cities.find(c => c.name.toLowerCase().includes(kota.toLowerCase()));
        url = found?.url || locations.allCities.url;
        kotaName = found?.name || locations.allCities.name;
      } else {
        url = locations.allCities.url;
        kotaName = locations.allCities.name;
      }
      console.log(`Mengambil data bioskop dari URL: ${url} (${kotaName})`);
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);
      const theaters = $(".item.theater").map((i, el) => {
        const theater = $(el);
        return {
          id: i + 1,
          name: theater.find(".judul").text().trim(),
          url: theater.find("a").first().attr("href"),
          image: theater.find("img.poster").attr("src"),
          scheduleUrl: theater.find("a.mojadwal").attr("href"),
          type: theater.find(".icon").attr("class")?.split(" ").pop() || "unknown"
        };
      }).get();
      const result = {
        city: kotaName,
        theaters: theaters
      };
      console.log(`Berhasil mendapatkan ${theaters.length} bioskop di ${kotaName}`);
      return result;
    } catch (error) {
      console.error("[ERROR] Gagal mendapatkan daftar bioskop:", error.message);
      throw new Error(`Gagal memuat bioskop untuk kota: ${kota}`);
    }
  }
  async _getTheaterDetail(lokasi = 1) {
    console.log(`Memulai proses mendapatkan detail bioskop untuk lokasi: ${lokasi}`);
    try {
      let url;
      let lokasiName = "";
      if (typeof lokasi === "number") {
        console.log("Mendapatkan daftar bioskop...");
        const theaters = await this._getTheaters(1);
        const adjustedIndex = lokasi - 1;
        if (adjustedIndex >= 0 && adjustedIndex < theaters.theaters.length) {
          url = theaters.theaters[adjustedIndex].url;
          lokasiName = theaters.theaters[adjustedIndex].name;
        } else {
          throw new Error(`Bioskop dengan indeks ${lokasi} tidak ditemukan`);
        }
      } else if (typeof lokasi === "string") {
        url = lokasi.startsWith("http") ? lokasi : `${this.baseUrl}${lokasi.startsWith("/") ? "" : "/"}${lokasi}`;
        lokasiName = "Custom URL";
      } else {
        throw new Error("Parameter lokasi tidak valid");
      }
      console.log(`Mengambil detail bioskop dari URL: ${url} (${lokasiName})`);
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);
      const addressText = $(".topdesc").contents().filter((_, el) => el.nodeType === 3).map((_, el) => $(el).text().trim()).get().join(" ").replace(/\s+/g, " ").trim();
      const movies = $(".thealist.mvx .item").map((i, el) => {
        const movie = $(el);
        return {
          id: i + 1,
          title: movie.find("h2 a").text().trim(),
          url: movie.find("h2 a").attr("href"),
          poster: movie.find(".poster").attr("src"),
          rating: {
            age: movie.find(".rating").text().trim(),
            color: movie.find(".rating").attr("class")?.split(" ").pop(),
            title: movie.find(".rating").attr("title")
          },
          genre: movie.find("p").eq(0).text().trim(),
          actors: movie.find("p").eq(1).text().replace("Actors : ", "").trim(),
          description: movie.find("p").eq(2).text().trim(),
          price: movie.find(".htm").text().trim(),
          type: movie.find(".showgroup").text().trim(),
          schedules: movie.find(".usch li").map((i, schEl) => ({
            id: i + 1,
            time: $(schEl).text().trim(),
            available: $(schEl).hasClass("active")
          })).get()
        };
      }).get();
      const comments = $(".comment-body").map((i, el) => {
        const comment = $(el);
        return {
          id: i + 1,
          user: comment.find("header a").text().trim(),
          date: comment.find("header .text-muted").text().trim(),
          memberSince: comment.find(".text-about").text().replace("Member since ", "").trim(),
          rating: comment.find(".starlist i").length,
          content: comment.find(".panel-body p").text().trim(),
          likes: comment.find(".btn_like").text().replace(/[^0-9]/g, "") || "0",
          dislikes: comment.find(".btn_dislike").text().replace(/[^0-9]/g, "") || "0"
        };
      }).get().filter(comment => comment.user && comment.content && comment.rating > 0);
      const result = {
        title: $("h1").text().trim(),
        address: addressText,
        image: $(".imgt").attr("src"),
        mapUrl: $("#tmap").attr("src"),
        dates: $(".filterlist#tgl_ftab li").map((i, el) => ({
          id: i + 1,
          date: $(el).text().trim(),
          url: $(el).find("a").data("ref")
        })).get(),
        movies: movies,
        comments: comments
      };
      console.log(`Berhasil mendapatkan detail bioskop: ${result.title}`);
      console.log(`- ${movies.length} film`);
      console.log(`- ${comments.length} komentar`);
      return result;
    } catch (error) {
      console.error("[ERROR] Gagal mendapatkan detail bioskop:", error.message);
      throw new Error(`Gagal memuat detail bioskop untuk lokasi: ${lokasi}`);
    }
  }
}
export default async function handler(req, res) {
  const {
    action,
    ...params
  } = req.method === "GET" ? req.query : req.body;
  if (!action) {
    return res.status(400).json({
      error: "Action parameter is required",
      available_actions: ["location", "theater", "detail"]
    });
  }
  const jn = new JadwalNonton();
  try {
    switch (action.toLowerCase()) {
      case "location":
        const locations = await jn.search({
          type: "location"
        });
        return res.status(200).json(locations);
      case "theater":
        const {
          kota = 1
        } = params;
        const theaters = await jn.search({
          type: "theater",
          kota: isNaN(kota) ? kota : parseInt(kota)
        });
        return res.status(200).json(theaters);
      case "detail":
        const {
          lokasi = 1,
            url
        } = params;
        if (url) {
          const detail = await jn.search({
            type: "detail",
            lokasi: url
          });
          return res.status(200).json(detail);
        } else {
          const detail = await jn.search({
            type: "detail",
            lokasi: isNaN(lokasi) ? lokasi : parseInt(lokasi)
          });
          return res.status(200).json(detail);
        }
      default:
        return res.status(400).json({
          error: `Invalid action: ${action}`,
          available_actions: ["location", "theater", "detail"]
        });
    }
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({
      error: error.message
    });
  }
}