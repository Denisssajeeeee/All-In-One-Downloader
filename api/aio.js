require('dotenv').config();
// api/aio.js — chain: TermAI → custom scrapers → btch → yt-dlp
const lib = require('btch-downloader');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

// ============================================================
const TERMAI_BASE = 'https://api.termai.cc/api';
const TERMAI_KEY = process.env.TERMAI_API_KEY || '';
// ============================================================

const TERMAI_ENDPOINTS = {
  tiktok: '/downloader/tiktok',
  youtube: '/downloader/youtube',
  youtube_proxy: '/downloader/youtube1',
  facebook: '/downloader/facebook',
  spotify: '/downloader/spotify',
  instagram: '/downloader/instagram',
  twitter: '/downloader/twitter',
  pinterest: '/downloader/pinterest',
  capcut: '/downloader/capcut',
  douyin: '/downloader/douyin',
  xiaohongshu: '/downloader/rednote',
};

const TIMEOUTS = {
  spotify: 150000,
  soundcloud: 120000,
  youtube: 120000,
  threads: 120000,
  instagram: 120000,
  twitter: 120000,
  capcut: 90000,
  douyin: 90000,
  kuaishou: 90000,
  default: 90000,
};

// ---------- DETECT ----------
function detectPlatform(input) {
  if (!input || typeof input !== 'string') return null;
  let parsed;
  try { parsed = new URL(input.trim()); } catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const is = (...d) => d.some(x => host === x || host.endsWith('.' + x));
  if (is('tiktok.com')) return 'tiktok';
  if (is('instagram.com', 'instagr.am')) return 'instagram';
  if (is('youtube.com', 'youtu.be', 'youtube-nocookie.com')) return 'youtube';
  if (is('twitter.com', 'x.com')) return 'twitter';
  if (is('facebook.com', 'fb.watch')) return 'facebook';
  if (is('pinterest.com', 'pin.it')) return 'pinterest';
  if (is('spotify.com', 'spotify.link')) return 'spotify';
  if (is('soundcloud.com', 'on.soundcloud.com')) return 'soundcloud';
  if (is('threads.com', 'threads.net')) return 'threads';
  if (is('capcut.com')) return 'capcut';
  if (is('drive.google.com', 'docs.google.com')) return 'gdrive';
  if (is('douyin.com')) return 'douyin';
  if (is('xiaohongshu.com', 'xhslink.com', 'rednote.com')) return 'xiaohongshu';
  if (is('snackvideo.com', 'sck.io')) return 'snackvideo';
  if (is('icocofun.com', 'cocofun.com')) return 'cocofun';
  if (is('kuaishou.com', 'chenzhongtech.com')) return 'kuaishou';
  return null;
}

// ---------- EXTRACTOR ----------
function extractMedia(obj) {
  const videos = new Set(), audios = new Set(), images = new Set();
  const audioKey = /audio|mp3|music|sound|song|track/i;
  const videoKey = /video|mp4|hdplay|wmplay|playurl|video_url|download_url|play|hd|sd|nohd|nowm|wm|vid|dl/i;
  const imageKey = /image|photo|picture|thumbnail|thumb|cover|poster|avatar|display/i;

  function walk(v, key = '', depth = 0, parentKey = '') {
    if (depth > 14 || v == null) return;
    if (typeof v === 'string') {
      if (!/^https?:\/\//i.test(v)) return;
      let p; try { p = new URL(v); } catch { return; }
      const pq = `${p.pathname}${p.search}`.toLowerCase();
      const kl = String(key).toLowerCase();
      const pkl = String(parentKey).toLowerCase();
      const effectiveKey = /^(url|src|href|file|link|source)$/i.test(kl) && pkl ? pkl : kl;
      if (/\.(mp3|m4a|ogg|wav|aac)(?:$|[?#])/i.test(pq) || /[?&](mime|type)=audio/i.test(pq) || /[?&]itag=(139|140|141|249|250|251)(?:&|$)/i.test(pq)) { audios.add(v); return; }
      if (/\.(mp4|m4v|webm|mov|m3u8)(?:$|[?#])/i.test(pq) || /[?&](mime|type)=video/i.test(pq)) { videos.add(v); return; }
      if (/\.(jpg|jpeg|png|webp|gif|avif)(?:$|[?#])/i.test(pq)) { images.add(v); return; }
      if (audioKey.test(effectiveKey) && !imageKey.test(effectiveKey)) { audios.add(v); return; }
      if (imageKey.test(effectiveKey)) { images.add(v); return; }
      if (videoKey.test(effectiveKey)) { videos.add(v); return; }
      return;
    }
    if (Array.isArray(v)) { for (const x of v) walk(x, key, depth + 1, parentKey); return; }
    if (typeof v === 'object') { for (const [k, x] of Object.entries(v)) walk(x, k, depth + 1, key || parentKey); }
  }
  walk(obj);
  return { videos: [...videos], audios: [...audios], images: [...images] };
}

// ---------- NORMALIZE GENERIC ----------
function normalizeGeneric(raw) {
  const videos = new Set(), audios = new Set(), images = new Set();
  const add = (set, value) => {
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) set.add(value);
  };
  const addList = (set, value) => {
    if (Array.isArray(value)) value.forEach(v => add(set, typeof v === 'string' ? v : (v?.url || v?.src)));
  };
  if (!raw || typeof raw !== 'object') return { videos: [], audios: [], images: [] };
  add(videos, raw.video); add(videos, raw.video_url); add(videos, raw.hdplay);
  add(videos, raw.wmplay); add(videos, raw.play); add(videos, raw.nowm);
  add(videos, raw.nohd); add(videos, raw.download_url);
  add(audios, raw.audio); add(audios, raw.mp3); add(audios, raw.audio_url);
  addList(videos, raw.videos); addList(audios, raw.audios);
  addList(images, raw.images);
  add(images, raw.thumbnail); add(images, raw.thumb); add(images, raw.cover);
  add(images, raw.thumbnail_url); add(images, raw.image);
  const rec = extractMedia(raw);
  rec.videos.forEach(u => videos.add(u));
  rec.audios.forEach(u => audios.add(u));
  rec.images.forEach(u => images.add(u));
  return { videos: [...videos], audios: [...audios], images: [...images] };
}

// ---------- NORMALIZER TERMAI ----------
function normalizeTermAI(platform, raw) {
  const videos = new Set();
  const audios = new Set();
  const images = new Set();
  let needsYtdlpResolve = null;

  const addUrl = (set, value) => {
    if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return;
    try { new URL(value); set.add(value); } catch {}
  };

  const payload = raw?.data ?? raw?.result ?? raw?.results ?? raw;

  // Universal: data.media[] array
  if (Array.isArray(payload?.media)) {
    for (const item of payload.media) {
      if (!item?.url) continue;
      const mediaType = String(item.type || payload.type || '').toLowerCase();
      if (mediaType === 'audio' || /\.(mp3|m4a|ogg|wav|aac)(\?|$)/i.test(item.url)) {
        addUrl(audios, item.url);
      } else if (mediaType === 'image' || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(item.url)) {
        addUrl(images, item.url);
      } else {
        addUrl(videos, item.url);
      }
    }
  }

  // Universal: thumbnail
  if (Array.isArray(payload?.thumbnail)) {
    payload.thumbnail.forEach(t => addUrl(images, t));
  } else {
    addUrl(images, payload?.thumbnail);
  }

  // Platform-specific
  if (platform === 'tiktok') {
    ['video', 'play', 'hdplay', 'wmplay', 'nowm', 'nohd', 'video_url', 'videoUrl', 'download_url', 'downloadUrl']
      .forEach(k => addUrl(videos, payload?.[k]));
    addUrl(audios, payload?.audio?.url || payload?.audio);
    addUrl(audios, payload?.music?.url || payload?.music);
    addUrl(images, payload?.cover);
    addUrl(images, payload?.origin_cover);
  }

  if (platform === 'youtube') {
    const formats = [
      ...(Array.isArray(payload?.downloads) ? payload.downloads : []),
      ...(Array.isArray(payload?.formats) ? payload.formats : []),
    ];
    for (const f of formats) {
      const type = String(f.mimeType || f.mime_type || f.type || f.format || '').toLowerCase();
      const hasVideo = f.hasVideo === true || (f.vcodec && f.vcodec !== 'none') || type.includes('video');
      const hasAudio = f.hasAudio === true || (f.acodec && f.acodec !== 'none') || type.includes('audio');
      if (hasVideo) addUrl(videos, f.url);
      if (hasAudio && !hasVideo) addUrl(audios, f.url);
    }
    addUrl(images, payload?.thumbnail);
    addUrl(images, payload?.thumb);
  }

  if (platform === 'facebook') {
    addUrl(videos, payload?.urls?.hd);
    addUrl(videos, payload?.urls?.sd);
    ['hd', 'sd', 'video', 'video_url', 'videoUrl', 'download_url', 'downloadUrl']
      .forEach(k => addUrl(videos, payload?.[k]));
    addUrl(images, payload?.thumbnail);
  }

  if (platform === 'spotify') {
    addUrl(images, payload?.albumImageUrl);
    addUrl(images, payload?.cover);
    const candidate = payload?.downloadUrl || payload?.download_url || payload?.url;
    if (typeof candidate === 'string') {
      if (/youtube\.com|youtu\.be/i.test(candidate)) needsYtdlpResolve = candidate;
      else addUrl(audios, candidate);
    }
  }

  if (platform === 'instagram') {
    addUrl(videos, payload?.video_url);
    addUrl(images, payload?.display_url);
  }

  if (platform === 'twitter') {
    if (Array.isArray(payload?.variants)) {
      payload.variants.forEach(v => {
        if (v.content_type === 'video/mp4' || v.type === 'video/mp4') addUrl(videos, v.url || v.src);
      });
    }
    addUrl(images, payload?.thumbnail);
  }

  if (platform === 'pinterest') {
    addUrl(videos, payload?.video_url || payload?.video);
    addUrl(images, payload?.image || payload?.image_url);
  }

  if (platform === 'douyin') {
    addUrl(videos, payload?.video_url || payload?.url || payload?.play);
    addUrl(audios, payload?.music_url);
  }

  // Generic fallback
  if (!videos.size && !audios.size && !images.size) {
    const rec = extractMedia(payload);
    rec.videos.forEach(u => addUrl(videos, u));
    rec.audios.forEach(u => addUrl(audios, u));
    rec.images.forEach(u => addUrl(images, u));
  }

  return { videos: [...videos], audios: [...audios], images: [...images], needsYtdlpResolve };
}

// ---------- CUSTOM: INSTAGRAM ----------
async function instagramCustom(url) {
  const m = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('IG shortcode gak ketemu');
  const shortcode = m[1];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'X-IG-App-ID': '936619743392459',
  };

  let res = await fetch(`https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`, { headers });
  if (res.ok) {
    const data = await res.json();
    const media = data?.graphql?.shortcode_media || data?.items?.[0];
    if (media) {
      const videos = [], images = [];
      if (media.video_url) videos.push(media.video_url);
      if (media.display_url) images.push(media.display_url);
      if (media.edge_sidecar_to_children?.edges) {
        for (const e of media.edge_sidecar_to_children.edges) {
          const n = e.node;
          if (n.video_url) videos.push(n.video_url);
          if (n.display_url) images.push(n.display_url);
        }
      }
      if (media.video_versions) media.video_versions.forEach(v => videos.push(v.url));
      if (media.image_versions2?.candidates) images.push(media.image_versions2.candidates[0].url);
      if (videos.length || images.length) {
        return { status: true, title: media.edge_media_to_caption?.edges?.[0]?.node?.text || '', author: media.owner?.username || '', videos, images };
      }
    }
  }

  const gqlRes = await fetch('https://www.instagram.com/graphql/query', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `query_hash=b3055c01b4b222b8a47dc12b090e4e64&variables=${encodeURIComponent(JSON.stringify({ shortcode }))}`,
  });
  if (gqlRes.ok) {
    const gqlData = await gqlRes.json();
    const media = gqlData?.data?.shortcode_media;
    if (media) {
      const videos = [], images = [];
      if (media.video_url) videos.push(media.video_url);
      if (media.display_url) images.push(media.display_url);
      if (media.edge_sidecar_to_children?.edges) {
        for (const e of media.edge_sidecar_to_children.edges) {
          const n = e.node;
          if (n.video_url) videos.push(n.video_url);
          if (n.display_url) images.push(n.display_url);
        }
      }
      if (videos.length || images.length) {
        return { status: true, title: media.edge_media_to_caption?.edges?.[0]?.node?.text || '', author: media.owner?.username || '', videos, images };
      }
    }
  }

  throw new Error('Instagram gagal parse');
}

// ---------- CUSTOM: TWITTER/X ----------
async function twitterCustom(url) {
  const m = url.match(/(?:twitter|x)\.com\/[^/]+\/status\/(\d+)/);
  if (!m) throw new Error('Tweet ID gak ketemu');
  const tweetId = m[1];

  const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=a`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`Syndication HTTP ${res.status}`);
  const data = await res.json();

  const videos = [], images = [];
  const variants = data?.video?.variants || [];
  for (const v of variants) {
    if (v.type === 'video/mp4' && v.src) videos.push(v.src);
  }
  if (Array.isArray(data?.mediaDetails)) {
    for (const md of data.mediaDetails) {
      if (md.type === 'video' && md.video_info?.variants) {
        for (const v of md.video_info.variants) {
          if (v.content_type === 'video/mp4' && v.url) videos.push(v.url);
        }
      }
      if (md.type === 'photo' && md.media_url_https) images.push(md.media_url_https);
    }
  }
  if (data?.photos) data.photos.forEach(p => { if (p.url) images.push(p.url); });

  if (!videos.length && !images.length) throw new Error('Twitter gak ada media');
  return { status: true, title: data.text || '', author: data.user?.screen_name || '', videos, images };
}

// ---------- CUSTOM: PINTEREST ----------
async function pinterestCustom(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Pinterest HTTP ${res.status}`);
  const html = await res.text();

  const videos = [], images = [];
  const pwsMatch = html.match(/<script id="__PWS_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (pwsMatch) {
    try {
      const data = JSON.parse(pwsMatch[1]);
      const rec = extractMedia(data);
      rec.videos.forEach(u => videos.push(u));
      rec.images.forEach(u => images.push(u));
    } catch {}
  }
  const ogVideo = html.match(/<meta[^>]+property="og:video"[^>]+content="([^"]+)"/i);
  const ogVideoSec = html.match(/<meta[^>]+property="og:video:secure_url"[^>]+content="([^"]+)"/i);
  const ogImage = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
  if (ogVideo) videos.push(ogVideo[1].replace(/&amp;/g, '&'));
  if (ogVideoSec) videos.push(ogVideoSec[1].replace(/&amp;/g, '&'));
  if (ogImage) images.push(ogImage[1].replace(/&amp;/g, '&'));

  if (!videos.length && !images.length) throw new Error('Pinterest gak ada media');
  return { status: true, videos, images };
}

// ---------- CUSTOM: SPOTIFY ----------
async function spotifyCustom(url) {
  let title = '', thumb = '';
  try {
    const oembed = await (await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`)).json();
    title = oembed.title || '';
    thumb = oembed.thumbnail_url || '';
  } catch {}

  const cleanTitle = title.replace(/\s*[-–]\s*(song|single|album|EP|playlist).*$/i, '').trim();
  const ytdl = await ytdlpSearch((cleanTitle || url) + ' audio', TIMEOUTS.spotify);

  return {
    status: true,
    title: ytdl.title || title,
    author: ytdl.author,
    thumbnail: ytdl.thumbnail || thumb,
    audio: ytdl.audio, mp3: ytdl.audio, video: ytdl.audio,
  };
}

// ---------- CUSTOM: SOUNDCLOUD ----------
async function soundcloudCustom(url) {
  try {
    return await ytdlpDirect(url, TIMEOUTS.soundcloud);
  } catch (e) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw new Error(`SoundCloud HTTP ${res.status}`);
      const html = await res.text();
      const scripts = [...html.matchAll(/<script[^>]*src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+)"/g)].map(m => m[1]);
      let clientId = null;
      for (const s of scripts) {
        try {
          const jsRes = await fetch(s);
          if (!jsRes.ok) continue;
          const js = await jsRes.text();
          const m = js.match(/client_id\s*[:=]\s*"([a-zA-Z0-9]{20,})"/);
          if (m) { clientId = m[1]; break; }
        } catch {}
      }
      if (!clientId) { const m = html.match(/client_id=([a-zA-Z0-9]{20,})/); if (m) clientId = m[1]; }
      if (!clientId) throw new Error('SoundCloud client_id gak nemu');

      const resolveRes = await fetch(`https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}&client_id=${clientId}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!resolveRes.ok) throw new Error('SoundCloud resolve gagal');
      const track = await resolveRes.json();

      const progressive = (track.media?.transcodings || []).find(t => t.format?.protocol === 'progressive');
      if (!progressive) throw new Error('SoundCloud cuma HLS');

      const streamRes = await fetch(`${progressive.url}?client_id=${clientId}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!streamRes.ok) throw new Error('SoundCloud stream gagal');
      const stream = await streamRes.json();

      return { status: true, title: track.title, author: track.user?.username, thumbnail: track.artwork_url, audio: stream.url, mp3: stream.url };
    } catch (innerErr) {
      throw new Error(`SoundCloud gagal: ${innerErr.message}`);
    }
  }
}

// ---------- CUSTOM: THREADS ----------
async function threadsCustom(url) {
  try {
    return await ytdlpDirect(url, TIMEOUTS.threads);
  } catch (e) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw new Error(`Threads HTTP ${res.status}`);
      const html = await res.text();
      const get = (prop) => {
        const m = html.match(new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]+)"`, 'i'));
        return m ? m[1].replace(/&amp;/g, '&') : null;
      };
      const videoUrl = get('og:video') || get('og:video:secure_url') || (html.match(/"video_url":"([^"]+)"/) || [])[1];
      const image = get('og:image');
      const title = get('og:title') || get('og:description');
      if (!videoUrl && !image) throw new Error('Threads gak ada media');
      return { status: true, title, video: videoUrl, thumbnail: image };
    } catch (innerErr) {
      throw new Error(`Threads gagal: ${innerErr.message}`);
    }
  }
}

// ---------- TERMAI API CALL ----------
async function tryTermAI(platform, url) {
  const endpoint = TERMAI_ENDPOINTS[platform];

  if (!endpoint) {
    throw new Error(`Termai tidak mendukung platform: ${platform}`);
  }

  if (!TERMAI_KEY) {
    throw new Error('TERMAI_API_KEY belum diatur di environment');
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    TIMEOUTS[platform] || TIMEOUTS.default
  );

  try {
    const params = new URLSearchParams({ url, key: TERMAI_KEY });
    const response = await fetch(
      `${TERMAI_BASE}${endpoint}?${params}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'AIO-Downloader/1.0',
        },
        signal: controller.signal,
      }
    );

    const body = await response.text();
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      throw new Error(`Respons Termai bukan JSON (HTTP ${response.status}): ${body.slice(0, 200)}`);
    }

    if (!response.ok) {
      const message = data?.message || data?.msg || data?.error?.message || data?.error || `HTTP ${response.status}`;
      throw new Error(`Termai API error: ${typeof message === 'string' ? message : JSON.stringify(message)}`);
    }

    if (data?.status === false || data?.success === false || data?.ok === false) {
      throw new Error(data?.message || data?.msg || data?.error?.message || 'Request Termai gagal');
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request Termai timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- BTCH ----------
async function tryBtch(platform, url) {
  const map = {
    tiktok: lib.ttdl, instagram: lib.igdl, youtube: lib.youtube,
    twitter: lib.twitter, facebook: lib.fbdown, pinterest: lib.pinterest,
    spotify: lib.spotify, soundcloud: lib.soundcloud, threads: lib.threads,
    capcut: lib.capcut, gdrive: lib.gdrive, douyin: lib.douyin,
    xiaohongshu: lib.xiaohongshu, snackvideo: lib.snackvideo,
    cocofun: lib.cocofun, kuaishou: lib.kuaishou,
  };
  const fn = map[platform];
  if (typeof fn !== 'function') throw new Error('btch handler gak ada');
  const ms = TIMEOUTS[platform] || TIMEOUTS.default;
  const raw = await Promise.race([
    Promise.resolve().then(() => fn(url)),
    new Promise((_, r) => setTimeout(() => r(new Error(`btch timeout ${ms / 1000}s`)), ms)),
  ]);
  if (!raw || raw.status === false) throw new Error(raw?.message || 'btch status false');
  return raw;
}

// ---------- YT-DLP ----------
async function ytdlpDirect(url, timeoutMs = 90000) {
  const { stdout } = await execFileAsync('yt-dlp', [
    '--dump-json', '--no-warnings', '--no-playlist', '--no-check-certificates', url,
  ], { maxBuffer: 50 * 1024 * 1024, timeout: timeoutMs });

  const info = JSON.parse(stdout);
  const formats = (info.formats || []).filter(f => f.url);
  const videoFormats = formats.filter(f => f.vcodec && f.vcodec !== 'none').sort((a, b) => (b.height || 0) - (a.height || 0));
  const audioFormats = formats.filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')).sort((a, b) => (b.abr || 0) - (a.abr || 0));

  return {
    status: true,
    title: info.title || '',
    author: info.uploader || info.channel || '',
    thumbnail: info.thumbnail || '',
    video: videoFormats[0]?.url || null,
    audio: audioFormats[0]?.url || null,
  };
}

async function ytdlpSearch(query, timeoutMs = 120000) {
  const { stdout } = await execFileAsync('yt-dlp', [
    '--dump-json', '--no-warnings', '--no-playlist', '--no-check-certificates',
    `ytsearch1:${query}`,
  ], { maxBuffer: 50 * 1024 * 1024, timeout: timeoutMs });

  const info = JSON.parse(stdout);
  const formats = (info.formats || []).filter(f => f.url);
  const videoFormats = formats.filter(f => f.vcodec && f.vcodec !== 'none').sort((a, b) => (b.height || 0) - (a.height || 0));
  const audioFormats = formats.filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')).sort((a, b) => (b.abr || 0) - (a.abr || 0));

  return {
    status: true,
    title: info.title,
    author: info.uploader || info.channel || '',
    thumbnail: info.thumbnail,
    video: videoFormats[0]?.url || null,
    audio: audioFormats[0]?.url || null,
  };
}

// ---------- RUN CHAIN ----------
async function runChain(platform, url) {
  const errors = [];
  const needsAV = ['spotify', 'soundcloud', 'youtube', 'tiktok', 'instagram', 'facebook', 'twitter', 'threads', 'douyin', 'kuaishou', 'capcut'];

  const isSuccess = (p, media) => {
    if (needsAV.includes(p)) return media.videos.length > 0 || media.audios.length > 0;
    return media.videos.length > 0 || media.audios.length > 0 || media.images.length > 0;
  };

  // CHAIN 0: TermAI
  if (TERMAI_ENDPOINTS[platform]) {
    try {
      const raw = await tryTermAI(platform, url);
      const m = normalizeTermAI(platform, raw);

      if (platform === 'spotify' && m.needsYtdlpResolve) {
        // Prioritas 1: youtube1 endpoint (proxy, tanpa yt-dlp — cocok untuk Vercel)
        try {
          const ytRaw = await tryTermAI('youtube_proxy', m.needsYtdlpResolve);
          const ytm = normalizeTermAI('youtube', ytRaw);
          if (ytm.videos.length || ytm.audios.length) {
            console.log(`[aio] ${platform} → termai+youtube1 OK`);
            return { source: 'termai+youtube1', raw: ytRaw, media: { videos: ytm.videos, audios: ytm.audios, images: [...new Set([...m.images, ...ytm.images])] } };
          }
        } catch (e) { errors.push('termai-youtube1: ' + e.message); }

        // Prioritas 2: youtube endpoint biasa
        try {
          const ytRaw = await tryTermAI('youtube', m.needsYtdlpResolve);
          const ytm = normalizeTermAI('youtube', ytRaw);
          if (ytm.videos.length || ytm.audios.length) {
            console.log(`[aio] ${platform} → termai+youtube OK`);
            return { source: 'termai+youtube', raw: ytRaw, media: { videos: ytm.videos, audios: ytm.audios, images: [...new Set([...m.images, ...ytm.images])] } };
          }
        } catch (e) { errors.push('termai-youtube: ' + e.message); }

        // Fallback: yt-dlp (hanya jalan di server lokal)
        try {
          const resolved = await ytdlpDirect(m.needsYtdlpResolve, TIMEOUTS.spotify);
          const rm = normalizeGeneric(resolved);
          if (rm.videos.length || rm.audios.length) {
            console.log(`[aio] ${platform} → termai + yt-dlp resolve OK`);
            return { source: 'termai+ytdlp', raw, media: { videos: rm.videos, audios: rm.audios, images: [...new Set([...m.images, ...rm.images])] } };
          }
        } catch (e) { errors.push('termai-spotify-resolve: ' + e.message); }
      }

      if (isSuccess(platform, m)) {
        console.log(`[aio] ${platform} → termai OK`);
        return { source: 'termai', raw, media: m };
      }
      errors.push('termai: no AV');
    } catch (e) { errors.push('termai: ' + e.message); }
  }

  // CHAIN 1: Custom scrapers
  if (platform === 'instagram') {
    try {
      const raw = await instagramCustom(url);
      const m = { videos: raw.videos, audios: [], images: raw.images };
      if (m.videos.length || m.images.length) {
        console.log(`[aio] ${platform} → custom-guest OK`);
        return { source: 'instagram-guest', raw, media: m };
      }
      errors.push('instagram-guest: no media');
    } catch (e) { errors.push('instagram-guest: ' + e.message); }
  }

  if (platform === 'twitter') {
    try {
      const raw = await twitterCustom(url);
      const m = { videos: raw.videos, audios: [], images: raw.images };
      if (m.videos.length || m.images.length) {
        console.log(`[aio] ${platform} → custom-syndication OK`);
        return { source: 'twitter-syndication', raw, media: m };
      }
      errors.push('twitter-syndication: no media');
    } catch (e) { errors.push('twitter-syndication: ' + e.message); }
  }

  if (platform === 'pinterest') {
    try {
      const raw = await pinterestCustom(url);
      const m = { videos: raw.videos, audios: [], images: raw.images };
      if (m.videos.length || m.images.length) {
        console.log(`[aio] ${platform} → custom-scrape OK`);
        return { source: 'pinterest-scrape', raw, media: m };
      }
      errors.push('pinterest-scrape: no media');
    } catch (e) { errors.push('pinterest-scrape: ' + e.message); }
  }

  // CHAIN 2: btch
  try {
    const raw = await tryBtch(platform, url);
    let m = extractMedia(raw);
    if (platform === 'instagram') {
      const igVideos = [], igImages = [];
      const items = Array.isArray(raw?.result) ? raw.result : [];
      for (const item of items) {
        if (item?.url) igVideos.push(item.url);
        if (item?.thumbnail) igImages.push(item.thumbnail);
        if (item?.thumbnail_link) igImages.push(item.thumbnail_link);
      }
      m = { videos: [...new Set([...m.videos, ...igVideos])], audios: m.audios, images: [...new Set([...m.images, ...igImages])] };
    }
    if (platform === 'pinterest') {
      const items = Array.isArray(raw?.results) ? raw.results : [];
      for (const item of items) {
        if (item?.image) m.images.push(item.image);
        if (item?.link) m.videos.push(item.link);
      }
    }
    if (isSuccess(platform, m)) {
      console.log(`[aio] ${platform} → btch OK`);
      return { source: 'btch', raw, media: m };
    }
    errors.push('btch: no AV');
  } catch (e) { errors.push('btch: ' + e.message); }

  // CHAIN 3: yt-dlp direct
  const ytdlpDirectPlatforms = ['tiktok', 'instagram', 'youtube', 'twitter', 'facebook', 'soundcloud', 'threads', 'douyin', 'kuaishou'];
  if (ytdlpDirectPlatforms.includes(platform)) {
    try {
      const raw = await ytdlpDirect(url, TIMEOUTS[platform] || 90000);
      const m = normalizeGeneric(raw);
      if (m.videos.length || m.audios.length) {
        console.log(`[aio] ${platform} → ytdlp-direct OK`);
        return { source: 'ytdlp-direct', raw, media: m };
      }
      errors.push('ytdlp-direct: no AV');
    } catch (e) { errors.push('ytdlp-direct: ' + e.message); }
  }

  // CHAIN 4: custom per platform
  if (platform === 'spotify') {
    try {
      const raw = await spotifyCustom(url);
      const m = normalizeGeneric(raw);
      if (m.audios.length || m.videos.length) {
        console.log(`[aio] ${platform} → spotify-ytdl OK`);
        return { source: 'spotify-ytdl', raw, media: m };
      }
      errors.push('spotify-ytdl: no audio');
    } catch (e) { errors.push('spotify-ytdl: ' + e.message); }
  }

  if (platform === 'soundcloud') {
    try {
      const raw = await soundcloudCustom(url);
      const m = normalizeGeneric(raw);
      if (m.audios.length || m.videos.length) {
        console.log(`[aio] ${platform} → soundcloud-custom OK`);
        return { source: 'soundcloud-custom', raw, media: m };
      }
      errors.push('soundcloud-custom: no audio');
    } catch (e) { errors.push('soundcloud-custom: ' + e.message); }
  }

  if (platform === 'threads') {
    try {
      const raw = await threadsCustom(url);
      const m = normalizeGeneric(raw);
      if (m.videos.length || m.images.length) {
        console.log(`[aio] ${platform} → threads-custom OK`);
        return { source: 'threads-custom', raw, media: m };
      }
      errors.push('threads-custom: no media');
    } catch (e) { errors.push('threads-custom: ' + e.message); }
  }

  throw new Error('Semua provider gagal:\n' + errors.join('\n'));
}

// ---------- HANDLER ----------
async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { url, format, debug, probe } = req.query || {};
  if (probe === '1') return res.status(200).json({ ok: true, service: 'aio-downloader-api' });
  if (!url) return res.status(400).json({ error: 'Parameter url wajib diisi' });

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
  } catch {
    return res.status(400).json({ error: 'URL tidak valid' });
  }

  const platform = detectPlatform(url);
  if (!platform) return res.status(400).json({ error: 'Platform belum didukung' });

  try {
    const { source, raw, media } = await runChain(platform, url);

    if (debug === '1') return res.status(200).json({ ok: true, platform, source, raw, media });

    const requestedFormat = ['video', 'audio', 'image'].includes(format) ? format : 'video';
    let primary = requestedFormat === 'audio'
      ? (media.audios[0] || null)
      : requestedFormat === 'image'
        ? (media.images[0] || null)
        : (media.videos[0] || null);

    if (!primary) {
      const err = new Error(`Format ${requestedFormat} tidak tersedia. V:${media.videos.length} A:${media.audios.length} I:${media.images.length}`);
      err.statusCode = 422;
      throw err;
    }

    const title = findMeta(raw, 'title') || findMeta(raw, 'caption') || findMeta(raw, 'trackName') || findMeta(raw, 'desc') || '';
    const author = findMeta(raw, 'author') || findMeta(raw, 'username') || findMeta(raw, 'nickname') || findMeta(raw, 'uploader') || findMeta(raw, 'unique_id') || '';

    return res.status(200).json({
      ok: true, platform, source,
      requested_format: requestedFormat,
      primary_url: primary,
      title, author,
      thumbnail: media.images[0] || '',
      media,
      counts: { videos: media.videos.length, audios: media.audios.length, images: media.images.length },
    });
  } catch (e) {
    console.error(`[aio] ${platform} error:`, e.message);
    return res.status(e.statusCode || 502).json({ error: e.message, platform });
  }
}

function findMeta(obj, key) {
  if (!obj || typeof obj !== 'object') return '';
  if (typeof obj[key] === 'string') return obj[key];
  for (const v of Object.values(obj)) { const r = findMeta(v, key); if (r) return r; }
  return '';
}

module.exports = handler;
module.exports.detectPlatform = detectPlatform;