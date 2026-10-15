const API = '/api/aio';
const DL = '/api/dl';
const TIKWM = 'https://www.tikwm.com/api/';

let API_MODE = null;

const urlInput = document.getElementById('urlInput');
const pasteBtn = document.getElementById('pasteBtn');
const downloadBtn = document.getElementById('downloadBtn');
const btnText = document.getElementById('btnText');
const spinner = document.getElementById('spinner');
const message = document.getElementById('message');
const result = document.getElementById('result');
const preview = document.getElementById('preview');
const meta = document.getElementById('meta');
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const formatTabs = document.querySelectorAll('.format-tab');
const platformInfo = document.getElementById('platformInfo');
const platformIcon = document.getElementById('platformIcon');
const platformName = document.getElementById('platformName');
const platformSub = document.getElementById('platformSub');

let selectedFormat = 'video';
let currentPrimaryUrl = null;
let currentFilename = 'download';

// Platform list — tandai yang TermAI-supported
const PLATFORMS = [
  { name: 'TikTok', icon: '<i class="fab fa-tiktok"></i>', color: 'linear-gradient(135deg, #25f4ee, #fe2c55)', test: /tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com/i, sub: 'Video tanpa watermark', termai: true },
  { name: 'Instagram', icon: '<i class="fab fa-instagram"></i>', color: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)', test: /instagram\.com|instagr\.am/i, sub: 'Reels, post, carousel', termai: true },
  { name: 'YouTube', icon: '<i class="fab fa-youtube"></i>', color: 'linear-gradient(135deg, #ff0000, #cc0000)', test: /youtube\.com|youtu\.be/i, sub: 'Video & audio', termai: true },
  { name: 'X (Twitter)', icon: '<i class="fab fa-x-twitter"></i>', color: 'linear-gradient(135deg, #000, #333)', test: /twitter\.com|x\.com/i, sub: 'Video dari tweet', termai: true },
  { name: 'Facebook', icon: '<i class="fab fa-facebook"></i>', color: 'linear-gradient(135deg, #1877f2, #0d5bcc)', test: /facebook\.com|fb\.watch/i, sub: 'Video publik', termai: true },
  { name: 'Pinterest', icon: '<i class="fab fa-pinterest"></i>', color: 'linear-gradient(135deg, #e60023, #ad081b)', test: /pinterest\.com|pin\.it/i, sub: 'Video & gambar', termai: true },
  { name: 'Spotify', icon: '<i class="fab fa-spotify"></i>', color: 'linear-gradient(135deg, #1db954, #158f3f)', test: /spotify\.com/i, sub: 'Track audio', termai: true },
  { name: 'SoundCloud', icon: '<i class="fab fa-soundcloud"></i>', color: 'linear-gradient(135deg, #ff5500, #cc4400)', test: /soundcloud\.com/i, sub: 'Audio (fallback)', termai: false },
  { name: 'Threads', icon: '<i class="fab fa-threads"></i>', color: 'linear-gradient(135deg, #000, #333)', test: /threads\.(com|net)/i, sub: 'Post Threads (fallback)', termai: false },
  { name: 'CapCut', icon: '<i class="fas fa-film"></i>', color: 'linear-gradient(135deg, #00d5c8, #009b91)', test: /capcut\.com/i, sub: 'Template video', termai: true },
  { name: 'Google Drive', icon: '<i class="fab fa-google-drive"></i>', color: 'linear-gradient(135deg, #4285f4, #1967d2)', test: /drive\.google\.com/i, sub: 'File Drive (fallback)', termai: false },
  { name: 'Douyin', icon: '<i class="fas fa-video"></i>', color: 'linear-gradient(135deg, #fe2c55, #000)', test: /douyin\.com/i, sub: 'Video Douyin', termai: true },
  { name: 'Xiaohongshu', icon: '<i class="fas fa-book"></i>', color: 'linear-gradient(135deg, #ff2442, #cc1a35)', test: /xiaohongshu\.com|xhslink\.com|rednote\.com/i, sub: 'Post & profile', termai: true },
  { name: 'SnackVideo', icon: '<i class="fas fa-play-circle"></i>', color: 'linear-gradient(135deg, #ff6a00, #cc5500)', test: /snackvideo\.com/i, sub: 'Video pendek (fallback)', termai: false },
  { name: 'Cocofun', icon: '<i class="fas fa-video"></i>', color: 'linear-gradient(135deg, #ff3366, #cc2952)', test: /icocofun\.com/i, sub: 'Video pendek (fallback)', termai: false },
  { name: 'Kuaishou', icon: '<i class="fas fa-bolt"></i>', color: 'linear-gradient(135deg, #ff5000, #cc4000)', test: /kuaishou\.com/i, sub: 'Video pendek (fallback)', termai: false }
];

function detectPlatform(input) {
  if (!input) return null;
  let parsed;
  try { parsed = new URL(input.trim()); } catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const domainMap = {
    'TikTok': ['tiktok.com'], 'Instagram': ['instagram.com', 'instagr.am'],
    'YouTube': ['youtube.com', 'youtu.be'], 'X (Twitter)': ['twitter.com', 'x.com'],
    'Facebook': ['facebook.com', 'fb.watch'], 'Pinterest': ['pinterest.com', 'pin.it'],
    'Spotify': ['spotify.com', 'spotify.link'], 'SoundCloud': ['soundcloud.com', 'on.soundcloud.com'],
    'Threads': ['threads.com', 'threads.net'], 'CapCut': ['capcut.com'],
    'Google Drive': ['drive.google.com', 'docs.google.com'], 'Douyin': ['douyin.com'],
    'Xiaohongshu': ['xiaohongshu.com', 'xhslink.com', 'rednote.com'], 'SnackVideo': ['snackvideo.com', 'sck.io'],
    'Cocofun': ['icocofun.com', 'cocofun.com'], 'Kuaishou': ['kuaishou.com', 'chenzhongtech.com']
  };
  return PLATFORMS.find(p => (domainMap[p.name] || []).some(d => host === d || host.endsWith('.' + d))) || null;
}

async function detectBackend() {
  try {
    const r = await fetch(`${API}?probe=1`, { method: 'GET' });
    if (r.status === 400 || r.status === 200) { API_MODE = 'server'; return; }
  } catch {}
  API_MODE = 'direct';
}

urlInput.addEventListener('input', () => {
  const p = detectPlatform(urlInput.value.trim());
  if (p) {
    platformIcon.innerHTML = p.icon;
    platformIcon.style.background = p.color;
    platformName.textContent = p.name;
    platformSub.textContent = p.sub + (p.termai ? ' ✓' : '');
    platformInfo.hidden = false;
  } else platformInfo.hidden = true;
});

pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) { urlInput.value = text.trim(); urlInput.dispatchEvent(new Event('input')); }
  } catch { showMessage('Gagal baca clipboard. Tempel manual.', 'error'); }
});

formatTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    formatTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    selectedFormat = tab.dataset.format;
    resetResult();
  });
});

downloadBtn.addEventListener('click', handleDownload);
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') downloadBtn.click(); });
resetBtn.addEventListener('click', resetAll);

saveBtn.addEventListener('click', () => {
  if (!currentPrimaryUrl) return showMessage('Belum ada file.', 'error');
  if (API_MODE === 'direct') {
    showMessage('Preview mode: buka media di tab baru.', 'info');
    try { window.open(currentPrimaryUrl, '_blank', 'noopener,noreferrer'); } catch {}
    return;
  }
  const proxyUrl = `${DL}?url=${encodeURIComponent(currentPrimaryUrl)}&name=${encodeURIComponent(currentFilename)}`;
  showMessage('Menyimpan ke folder Download...', 'info');
  const a = document.createElement('a');
  a.href = proxyUrl;
  a.download = currentFilename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showMessage('Permintaan download dikirim.', 'info');
});

async function handleDownload() {
  const url = urlInput.value.trim();
  if (!url) return showMessage('Tempel link dulu.', 'error');
  const platform = detectPlatform(url);
  if (!platform) return showMessage('Platform belum didukung.', 'error');
  if (API_MODE === null) await detectBackend();
  setLoading(true); hideMessage(); resetResult();
  try {
    if (API_MODE === 'server') await handleViaServer(url, platform);
    else await handleViaDirect(url, platform);
  } catch (e) { console.error(e); showMessage(`Gagal: ${e.message}`, 'error'); }
  finally { setLoading(false); }
}

async function handleViaServer(url, platform) {
  const res = await fetch(`${API}?url=${encodeURIComponent(url)}&format=${selectedFormat}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  const m = data.media || { videos: [], audios: [], images: [] };
  let mediaUrl = null;
  const mediaType = selectedFormat;
  if (selectedFormat === 'audio') mediaUrl = m.audios[0] || null;
  else if (selectedFormat === 'image') mediaUrl = m.images[0] || null;
  else mediaUrl = m.videos[0] || null;
  if (!mediaUrl) throw new Error(`Format "${selectedFormat}" tidak tersedia (V:${m.videos.length} A:${m.audios.length} I:${m.images.length}).`);
  currentPrimaryUrl = mediaUrl;
  renderPreview(mediaUrl, mediaType, data);
  renderMeta(data, platform);
  const extMap = { video: 'mp4', audio: 'm4a', image: 'jpg' };
  currentFilename = `${platform.name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.${extMap[mediaType] || 'bin'}`;
  result.hidden = false;
  showMessage(`Siap! (${m.videos.length}v ${m.audios.length}a ${m.images.length}i) - klik "Simpan File".`, 'success');
}

async function handleViaDirect(url, platform) {
  if (platform.name !== 'TikTok') throw new Error('Mode preview Acode cuma TikTok. Jalanin server.js buat semua platform.');
  const r = await fetch(`${TIKWM}?url=${encodeURIComponent(url)}&hd=1`);
  if (!r.ok) throw new Error(`TikWM HTTP ${r.status}`);
  const j = await r.json();
  if (j.code !== 0) throw new Error(j.msg || 'Gagal memproses TikTok');
  const d = j.data;
  const imageList = Array.isArray(d.images) ? d.images.map(x => typeof x === 'string' ? x : (x?.url || x?.src)).filter(Boolean) : [];
  const mediaUrl = selectedFormat === 'audio'
    ? (d.music || null)
    : selectedFormat === 'image'
      ? (imageList[0] || null)
      : (d.hdplay || d.play || null);
  if (!mediaUrl) throw new Error(`${selectedFormat === 'audio' ? 'Audio' : selectedFormat === 'image' ? 'Gambar' : 'Video'} tidak tersedia pada link ini.`);
  currentPrimaryUrl = mediaUrl;
  renderPreview(mediaUrl, selectedFormat, { media: { videos: selectedFormat === 'video' ? [mediaUrl] : [], audios: selectedFormat === 'audio' ? [mediaUrl] : [], images: imageList } });
  renderMeta({ title: d.title, author: d.author?.unique_id }, platform);
  currentFilename = `TikTok_${Date.now()}.${selectedFormat === 'audio' ? 'm4a' : selectedFormat === 'image' ? 'jpg' : 'mp4'}`;
  result.hidden = false;
  showMessage('Siap diunduh! Klik "Simpan File".', 'success');
}

function renderPreview(url, type, data) {
  preview.innerHTML = '';
  const tag = type === 'audio' ? 'audio' : type === 'image' ? 'img' : 'video';
  if (tag === 'video') {
    const v = document.createElement('video');
    v.src = url; v.controls = true; v.preload = 'metadata'; v.playsInline = true;
    v.style.width = '100%'; v.style.borderRadius = '14px';
    preview.appendChild(v);
  } else if (tag === 'audio') {
    const a = document.createElement('audio');
    a.src = url; a.controls = true; a.preload = 'metadata'; a.style.width = '100%';
    preview.appendChild(a);
  } else {
    const img = document.createElement('img');
    img.src = url; img.alt = 'preview'; img.loading = 'lazy';
    img.style.width = '100%'; img.style.borderRadius = '14px';
    preview.appendChild(img);
  }
  const all = [
    ...(data.media?.videos || []).map(u => ({ type: 'video', label: 'Video', url: u })),
    ...(data.media?.audios || []).map(u => ({ type: 'audio', label: 'Audio', url: u })),
    ...(data.media?.images || []).map(u => ({ type: 'image', label: 'Gambar', url: u })),
  ];
  if (all.length > 1) {
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px;padding:8px;background:#000;border-top:1px solid #222';
    all.forEach((item, i) => {
      const btn = document.createElement('button');
      btn.textContent = `${item.label} ${i + 1}`;
      btn.style.cssText = 'padding:8px;border:0;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;font-size:.72rem;font-weight:600';
      btn.onclick = () => {
        currentPrimaryUrl = item.url;
        const extMap = { video: 'mp4', audio: 'm4a', image: 'jpg' };
        currentFilename = currentFilename.replace(/\.[^.]+$/, `.${extMap[item.type]}`);
        renderPreview(item.url, item.type, { ...data, media: { videos: [], audios: [], images: [] } });
      };
      grid.appendChild(btn);
    });
    preview.appendChild(grid);
  }
}

function renderMeta(data, platform) {
  const parts = [];
  if (data.title) parts.push(escapeHtml(String(data.title).slice(0, 200)));
  if (data.author) parts.push(`<b>@${escapeHtml(data.author)}</b>`);
  parts.push(`Platform: <b>${platform.name}</b>${platform.termai ? ' <span style="color:#5dffc0">✓ TermAI</span>' : ' <span style="color:#ff8fa8">fallback</span>'}`);
  if (data.source) parts.push(`Sumber: <b>${data.source}</b>`);
  if (data.media?.videos?.length || data.media?.audios?.length || data.media?.images?.length) {
    parts.push(`${data.media.videos.length}v ${data.media.audios.length}a ${data.media.images.length}i`);
  }
  parts.push(`Mode: <b>${API_MODE}</b>`);
  meta.innerHTML = parts.join('<br>');
}

function setLoading(on) { downloadBtn.disabled = on; btnText.textContent = on ? 'Memproses...' : 'Unduh Sekarang'; spinner.hidden = !on; }
function showMessage(text, type = 'error') { message.textContent = text; message.className = `message ${type}`; message.hidden = false; }
function hideMessage() { message.hidden = true; }
function resetResult() { preview.innerHTML = ''; meta.innerHTML = ''; result.hidden = true; currentPrimaryUrl = null; }
function resetAll() { resetResult(); hideMessage(); setLoading(false); }
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

const themeBtn = document.getElementById('themeBtn');
const savedTheme = localStorage.getItem('aio-theme') || 'dark';
document.documentElement.dataset.theme = savedTheme;
themeBtn.textContent = savedTheme === 'dark' ? '🌙' : '☀️';
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  themeBtn.textContent = next === 'dark' ? '🌙' : '☀️';
  localStorage.setItem('aio-theme', next);
});

detectBackend().then(() => console.log(`[aio] mode: ${API_MODE}`));
resetAll();