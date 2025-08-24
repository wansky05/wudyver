import fetch from "node-fetch";
const AUTHOR = "Wudysoft"
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36"
const KEEPV_ORIGIN = "https://keepv.id"

function isYouTubeUrl(u) {
  if (!u) return false
  try {
    const url = new URL(u)
    return /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(url.hostname)
  } catch {
    return false
  }
}

function getQuality(fmt, value) {
  if (fmt === 1) return ({ 320: 0, 256: 1, 192: 2, 160: 3, 128: 4, 96: 5 })[value] ?? null
  if (fmt === 0) return [144, 360, 480, 720, 1080].includes(value) ? value : null
  return null
}

function randomHex(len = 64, prefix = "t_") {
  const chars = "0123456789abcdef"
  let out = prefix
  for (let i = 0; i < len; i++) out += chars[(Math.random() * chars.length) | 0]
  return out
}

function tokenValidToSec(minutes = 20) {
  return Math.floor(Date.now() / 1000 + minutes * 60).toString()
}

function pickSetCookie(h) {
  const raw = typeof h.getSetCookie === "function" ? h.getSetCookie() : null
  if (raw && raw.length) return raw[0]?.split(";")[0] ?? null
  
  const rawObj = typeof h.raw === "function" ? h.raw() : null
  if (rawObj && rawObj["set-cookie"] && rawObj["set-cookie"][0]) return rawObj["set-cookie"][0].split(";")[0] ?? null
  
  const single = h.get("set-cookie")
  if (single) return single.split(",")[0]?.split(";")[0] ?? null
  return null
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchJson(url, init) {
  const r = await fetch(url, init)
  if (!r.ok) {
    const body = await r.text().catch(() => "")
    throw new Error(`${r.status} ${r.statusText}\n${body || "(empty)"}`)
  }
  return await r.json()
}

async function getYouTubeMeta(youtubeUrl) {
  try {
    const u = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`
    const meta = await fetchJson(u, {
      headers: { "user-agent": UA, accept: "application/json" },
    })
    return { title: meta.title, author: meta.author_name ?? "Unknown" }
  } catch {
    return { title: "YouTube Media", author: "Unknown" }
  }
}

async function keepvGetCookie() {
  const r = await fetch(KEEPV_ORIGIN, {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  })
  if (!r.ok) throw new Error(`Keepv home failed: ${r.status} ${r.statusText}`)
  const cookie = pickSetCookie(r.headers)
  if (!cookie) throw new Error("Keepv cookie missing")
  return { cookie, redirect: r.url }
}

async function keepvValidate(cookie, referer, youtubeUrl) {
  const url = `${KEEPV_ORIGIN}/button/?url=${encodeURIComponent(youtubeUrl)}`
  const r = await fetch(url, {
    headers: {
      cookie,
      referer,
      "user-agent": UA,
      accept: "*/*",
    },
  })
  if (!r.ok) throw new Error(`Keepv validate failed: ${r.status} ${r.statusText}`)
  return { cookie, referer: url }
}

async function keepvConvert(cookie, referer, youtubeUrl) {
  const body = new URLSearchParams({
    url: youtubeUrl,
    convert: "gogogo",
    token_id: randomHex(64, "t_"),
    token_validto: tokenValidToSec(20),
  })
  const r = await fetch(`${KEEPV_ORIGIN}/convert/`, {
    method: "POST",
    headers: {
      cookie,
      referer,
      origin: KEEPV_ORIGIN,
      "x-requested-with": "XMLHttpRequest",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "user-agent": UA,
      accept: "application/json, text/javascript, */*; q=0.01",
    },
    body,
  })
  if (!r.ok) throw new Error(`Keepv convert failed: ${r.status} ${r.statusText}`)
  const data = await r.json()
  if (data.error) throw new Error(`Keepv convert error: ${data.error}`)
  if (!data.jobid) throw new Error("Keepv jobid empty")
  return data.jobid
}

async function keepvCheck(cookie, referer, jobid) {
  const base = new URL(`${KEEPV_ORIGIN}/convert/`)
  let last = {}
  for (let i = 1; i <= 60; i++) {
    base.search = new URLSearchParams({ jobid, time: Date.now().toString() }).toString()
    const r = await fetch(base.toString(), {
      headers: {
        cookie,
        referer,
        "x-requested-with": "XMLHttpRequest",
        "user-agent": UA,
        accept: "application/json, text/javascript, */*; q=0.01",
      },
    })
    last = await r.json()
    if (last.dlurl) return { url: last.dlurl, polls: i }
    if (last.error) throw new Error(`Keepv check error: ${JSON.stringify(last)}`)
    await delay(2000)
  }
  throw new Error("Keepv: result polling timed out")
}

export default async function handler(req, res) {
  try {
    const { url: yt, fmt: fmtStr, quality: qualityStr } = req.method === "GET" ? req.query : req.body;
    const fmt = parseInt(fmtStr || "1", 10)
    const quality = parseInt(qualityStr || "128", 10)

    if (!isYouTubeUrl(yt)) {
      return res.status(400).json({
        status: false,
        author: AUTHOR,
        message: "URL YouTube tidak valid."
      })
    }

    const q = getQuality(fmt, quality)
    if (q === null) {
      return res.status(400).json({
        status: false,
        author: AUTHOR,
        message: fmt === 1
          ? "Bitrate audio tidak valid. Gunakan 96–320 kbps."
          : "Resolusi video tidak valid. Gunakan 144–1080."
      })
    }

    const meta = await getYouTubeMeta(yt)
    const ext = fmt === 1 ? ".mp3" : ".mp4"
    const filename = (meta.title || "YouTube Media").endsWith(ext) ? meta.title : `${meta.title}${ext}`

    const { cookie, redirect } = await keepvGetCookie()
    const { referer } = await keepvValidate(cookie, redirect, yt)
    const jobid = await keepvConvert(cookie, referer, yt)
    const { url: realDownloadUrl, polls } = await keepvCheck(cookie, referer, jobid)

    if (!realDownloadUrl) {
      return res.status(422).json({
        status: false,
        author: AUTHOR,
        message: "Link download tidak ditemukan."
      })
    }

    // Get the protocol and host from the request
    const protocol = req.headers['x-forwarded-proto'] || 'http'
    const host = req.headers.host
    const baseUrl = `${protocol}://${host}`

    const proxyRes = await fetch(`${baseUrl}/api/proxy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: realDownloadUrl,
        title: filename,
        expired: 3600,
      }),
    })

    const proxyJson = await proxyRes.json().catch(() => ({}))
    if (!proxyRes.ok || !proxyJson?.status || !proxyJson?.result?.short) {
      return res.status(500).json({
        status: false,
        author: AUTHOR,
        message: "Gagal membuat proxy link.",
        details: proxyJson
      })
    }

    return res.status(200).json({
      status: true,
      author: AUTHOR,
      result: {
        type: fmt === 1 ? "audio" : "video",
        title: meta.title,
        channel: meta.author,
        quality: q,
        polls,
        download_link: proxyJson.result.short,
      },
    })

  } catch (err) {
    return res.status(500).json({
      status: false,
      author: AUTHOR,
      message: "Terjadi kesalahan internal.",
      details: err?.message ?? String(err)
    })
  }
}