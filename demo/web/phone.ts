import { Alert, Linking } from "react-native";

type Btn = { text?: string; style?: "default" | "cancel" | "destructive"; onPress?: () => void };
export type Incoming = { title: string; body: string; data: Record<string, unknown>; sound?: string };

const SERVER = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787/api").replace(/\/api$/, "");
const search = new URLSearchParams(location.search);
if (search.get("phone")) window.name = `redvita-${search.get("phone")}`;
export const phoneName = window.name.startsWith("redvita-") ? window.name.slice(8) : "patient";
export const pushToken = `ExponentPushToken[demo-${phoneName}]`;

type SoundEvent = { at: number; what: "play" | "pause"; src: string };
const w = window as unknown as { __demo: Record<string, unknown>; __sounds: SoundEvent[] };
w.__sounds = [];
const play = HTMLMediaElement.prototype.play;
const pause = HTMLMediaElement.prototype.pause;
HTMLMediaElement.prototype.play = function () {
  w.__sounds.push({ at: Date.now(), what: "play", src: this.currentSrc || this.src });
  return play.call(this);
};
HTMLMediaElement.prototype.pause = function () {
  w.__sounds.push({ at: Date.now(), what: "pause", src: this.currentSrc || this.src });
  return pause.call(this);
};

const css = `
  html, body { background: #000; }
  #root { position: fixed; inset: 0; }
  #demo-os, #demo-os * { box-sizing: border-box; font-family: BlinkMacSystemFont, sans-serif; }
  #demo-os { position: fixed; inset: 0; pointer-events: none; z-index: 99999; }
  .sb { position: absolute; top: 0; left: 0; right: 0; height: 54px; display: flex; align-items: center;
        justify-content: space-between; padding: 6px 30px 0 46px; font-size: 17px; font-weight: 600; letter-spacing: -0.2px; }
  .sb.dark { color: #000; } .sb.light { color: #fff; }
  .sb .icons { display: flex; gap: 6px; align-items: center; }
  .sb svg { display: block; }
  .home { position: absolute; bottom: 8px; left: 50%; width: 140px; height: 5px; margin-left: -70px; border-radius: 3px; }
  .home.dark { background: #000; } .home.light { background: #fff; }
  .banner { position: absolute; left: 10px; right: 10px; top: 56px; border-radius: 24px; padding: 13px 15px;
            background: rgba(246,246,246,0.94); backdrop-filter: blur(20px); box-shadow: 0 8px 30px rgba(0,0,0,0.22);
            display: flex; gap: 11px; align-items: flex-start; transform: translateY(-140%); transition: transform .38s cubic-bezier(.2,.9,.3,1.05); }
  .banner.in { transform: translateY(0); }
  .banner img, .banner .appicon { width: 38px; height: 38px; border-radius: 9px; flex: none; }
  .banner .sms { background: linear-gradient(#5BE36E, #2DC24A); display: flex; align-items: center; justify-content: center; }
  .banner .txt { flex: 1; min-width: 0; color: #000; }
  .banner .row { display: flex; justify-content: space-between; gap: 8px; }
  .banner .t { font-size: 15px; font-weight: 600; line-height: 20px; }
  .banner .now { font-size: 13px; color: rgba(60,60,67,0.6); line-height: 20px; }
  .banner .b { font-size: 15px; line-height: 20px; margin-top: 1px; }
  .dim { position: absolute; inset: 0; background: rgba(0,0,0,0.25); opacity: 0; transition: opacity .2s; pointer-events: auto; }
  .dim.in { opacity: 1; }
  .alert { position: absolute; top: 50%; left: 50%; width: 270px; margin-left: -135px; transform: translateY(-50%) scale(1.1);
           background: rgba(242,242,242,0.97); border-radius: 14px; overflow: hidden; text-align: center; opacity: 0;
           transition: opacity .2s, transform .2s; pointer-events: auto; }
  .alert.in { opacity: 1; transform: translateY(-50%) scale(1); }
  .alert .h { padding: 19px 16px 2px; font-size: 17px; font-weight: 600; color: #000; }
  .alert .m { padding: 0 16px 19px; font-size: 13px; line-height: 17px; color: #000; }
  .alert .btns { display: flex; border-top: 0.5px solid rgba(60,60,67,0.3); }
  .alert .btns.v { flex-direction: column; }
  .alert button { all: unset; flex: 1; padding: 11px 0; font-size: 17px; color: #007AFF; cursor: pointer; text-align: center; }
  .alert .btns button + button { border-left: 0.5px solid rgba(60,60,67,0.3); }
  .alert button.bold { font-weight: 600; }
  .tap { position: absolute; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%;
         background: rgba(120,120,128,0.35); border: 2px solid rgba(255,255,255,0.7); animation: tap .5s ease-out forwards; }
  @keyframes tap { from { transform: scale(0.6); opacity: 1 } to { transform: scale(1.25); opacity: 0 } }
  .maps { position: absolute; inset: 0; background: #fff; pointer-events: auto; transform: translateY(100%); transition: transform .35s ease; }
  .maps.in { transform: translateY(0); }
  .maps iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
  .maps .back { position: absolute; top: 54px; left: 12px; font-size: 14px; font-weight: 600; color: #007AFF; z-index: 2;
                background: rgba(255,255,255,0.9); padding: 6px 12px; border-radius: 16px; cursor: pointer; }
`;

const signalSvg = `<svg width="19" height="12" viewBox="0 0 19 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor"/><rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor"/></svg>`;
const wifiSvg = `<svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 2.3c2.4 0 4.6.9 6.3 2.5l1.2-1.3C14 1.6 11.4.5 8.5.5S3 1.6 1 3.5l1.2 1.3C3.9 3.2 6.1 2.3 8.5 2.3zm0 3.5c1.4 0 2.7.5 3.8 1.4l1.2-1.3C12.1 4.6 10.4 4 8.5 4s-3.6.6-5 1.9l1.2 1.3c1.1-.9 2.4-1.4 3.8-1.4zm0 3.4c.6 0 1.1.2 1.5.6L8.5 11.5 7 9.8c.4-.4.9-.6 1.5-.6z" fill="currentColor"/></svg>`;
const planeSvg = `<svg width="17" height="16" viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" fill="currentColor"/></svg>`;
const batterySvg = (pct: number) =>
  `<svg width="27" height="13" viewBox="0 0 27 13"><rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" stroke-opacity="0.4"/><rect x="2" y="2" width="${(20 * pct) / 100}" height="9" rx="2" fill="currentColor"/><path d="M25 4.5v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2z" fill="currentColor" fill-opacity="0.4"/></svg>`;

let os: HTMLDivElement;
let bar: HTMLDivElement;
let home: HTMLDivElement;
let airplane = false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", html = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function drawBar() {
  const d = new Date();
  const time = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}`;
  const net = airplane ? planeSvg : signalSvg + wifiSvg;
  bar.innerHTML = `<span>${time}</span><span class="icons">${net}${batterySvg(phoneName === "patient" ? 100 : 82)}</span>`;
}

function tint() {
  const probe = (y: number) => {
    let e = document.elementFromPoint(200, y) as HTMLElement | null;
    while (e && e !== document.body) {
      const s = getComputedStyle(e);
      if (s.backgroundImage.includes("gradient")) return 0;
      const m = s.backgroundColor.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?/);
      if (m && (m[4] === undefined || Number(m[4]) > 0.5)) return 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3];
      e = e.parentElement;
    }
    return 255;
  };
  const mapsOpen = !!os.querySelector(".maps.in");
  bar.className = `sb ${mapsOpen || probe(70) > 140 ? "dark" : "light"}`;
  home.className = `home ${mapsOpen || probe(830) > 140 ? "dark" : "light"}`;
}

function fitText() {
  for (const e of document.querySelectorAll<HTMLElement>('#root [dir="auto"]')) {
    if (e.scrollWidth <= e.clientWidth + 1) continue;
    const s = getComputedStyle(e);
    if (s.textOverflow !== "ellipsis") continue;
    const size = parseFloat(s.fontSize);
    const original = Number(e.dataset.fitFrom ?? size);
    e.dataset.fitFrom = String(original);
    if (size > original * 0.7) e.style.fontSize = `${size - 0.5}px`;
  }
}

function mount() {
  const style = el("style");
  style.textContent = css;
  document.head.appendChild(style);
  fetch("https://fonts.googleapis.com/css2?family=Inter:wght@300..800&display=block")
    .then((r) => r.text())
    .then((t) => {
      const f = el("style");
      f.textContent = t.replace(/font-family: 'Inter'/g, "font-family: 'BlinkMacSystemFont'");
      document.head.appendChild(f);
    })
    .catch(() => {});
  os = el("div");
  os.id = "demo-os";
  bar = el("div", "sb dark");
  home = el("div", "home dark");
  os.append(bar, home);
  document.body.appendChild(os);
  drawBar();
  setInterval(drawBar, 5_000);
  setInterval(tint, 200);
  setInterval(fitText, 250);
  document.addEventListener(
    "pointerdown",
    (e) => {
      const t = el("div", "tap");
      t.style.left = `${e.clientX}px`;
      t.style.top = `${e.clientY}px`;
      os.appendChild(t);
      setTimeout(() => t.remove(), 600);
    },
    true,
  );
}
if (document.body) mount();
else document.addEventListener("DOMContentLoaded", mount);

const ICON = require("../../assets/icon.png");
const iconUri = typeof ICON === "string" ? ICON : (ICON?.uri ?? ICON?.default ?? "");
const bubble = `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6L4.5 21l4.2-2.3c1 .2 2.1.3 3.3.3 5.5 0 10-3.6 10-8s-4.5-8-10-8z" fill="#fff"/></svg>`;

export function banner(title: string, body: string, kind: "app" | "sms" = "app", ms = 4_500) {
  const b = el("div", "banner");
  const icon = kind === "sms" ? `<div class="appicon sms">${bubble}</div>` : `<img src="${iconUri}">`;
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  b.innerHTML = `${icon}<div class="txt"><div class="row"><span class="t">${esc(title)}</span><span class="now">now</span></div><div class="b">${esc(body)}</div></div>`;
  let top = 56;
  for (const other of os.querySelectorAll<HTMLElement>(".banner.in")) top = Math.max(top, other.offsetTop + other.offsetHeight + 8);
  b.style.top = `${top}px`;
  os.appendChild(b);
  requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add("in")));
  setTimeout(() => {
    b.classList.remove("in");
    setTimeout(() => b.remove(), 500);
  }, ms);
}

function chime(sound?: string) {
  if (!sound || sound === "default") {
    w.__sounds.push({ at: Date.now(), what: "play", src: "chime" });
    return;
  }
  const a = new Audio(require("../../assets/sounds/alarm.wav"));
  a.play().catch(() => {});
  setTimeout(() => a.pause(), 6_000);
}

type Listener = (n: Incoming) => void;
const received = new Set<Listener>();
export const onIncoming = (fn: Listener) => {
  received.add(fn);
  return () => received.delete(fn);
};

export function deliver(n: Incoming, opts: { show?: boolean } = {}) {
  if (opts.show !== false) {
    banner(n.title, n.body);
    chime(n.sound);
  }
  for (const fn of received) fn(n);
}

let events: EventSource | null = null;
function connect() {
  if (airplane || events) return;
  events = new EventSource(`${SERVER}/events?token=${encodeURIComponent(pushToken)}`);
  events.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.kind === "sms") {
      setTimeout(() => {
        banner(m.from.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "+1 ($1) $2-$3"), m.body, "sms", 7_000);
        w.__sounds.push({ at: Date.now(), what: "play", src: "sms" });
      }, 2_500);
    } else {
      deliver({ title: m.title, body: m.body, data: m.data ?? {}, sound: m.sound });
    }
  };
}
connect();

Alert.alert = (title: string, message?: string, buttons?: Btn[]) => {
  const list: Btn[] = buttons && buttons.length ? buttons : [{ text: "OK" }];
  const dim = el("div", "dim");
  const box = el("div", "alert");
  box.innerHTML = `<div class="h"></div><div class="m"></div><div class="btns${list.length > 2 ? " v" : ""}"></div>`;
  box.querySelector(".h")!.textContent = title;
  box.querySelector(".m")!.textContent = message ?? "";
  const row = box.querySelector(".btns")!;
  list.forEach((b, i) => {
    const btn = el("button");
    btn.textContent = b.text ?? "OK";
    if (b.style !== "cancel" && i === list.length - 1) btn.className = "bold";
    if (b.style === "destructive") btn.style.color = "#FF3B30";
    btn.onclick = () => {
      dim.classList.remove("in");
      box.classList.remove("in");
      setTimeout(() => {
        dim.remove();
        box.remove();
      }, 220);
      b.onPress?.();
    };
    row.appendChild(btn);
  });
  os.append(dim, box);
  requestAnimationFrame(() => requestAnimationFrame(() => (dim.classList.add("in"), box.classList.add("in"))));
};

const openURL = Linking.openURL.bind(Linking);
Linking.openURL = async (url: string) => {
  const dir = url.match(/destination=([-\d.]+),([-\d.]+)/);
  if (!dir) {
    if (url.startsWith("tel:")) banner("Phone", `Calling ${url.slice(4)}…`);
    else await openURL(url);
    return;
  }
  const from = (window as unknown as { __demoHome?: { lat: number; lng: number } }).__demoHome;
  const maps = el("div", "maps");
  const frame = el("iframe");
  frame.srcdoc = directionsHtml(from ?? { lat: 18.43, lng: -66.1 }, { lat: +dir[1], lng: +dir[2] });
  const back = el("div", "back", "◀ RedVita");
  back.onclick = () => {
    maps.classList.remove("in");
    setTimeout(() => maps.remove(), 400);
  };
  maps.append(frame, back);
  os.insertBefore(maps, bar);
  requestAnimationFrame(() => requestAnimationFrame(() => maps.classList.add("in")));
};

function directionsHtml(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{margin:0;height:100%;font-family:BlinkMacSystemFont,sans-serif}
.card{position:absolute;left:10px;right:10px;bottom:28px;z-index:999;background:#fff;border-radius:18px;padding:16px 18px;box-shadow:0 6px 24px rgba(0,0,0,.2)}
.eta{font-size:26px;font-weight:700;color:#15803D}.sub{font-size:15px;color:#57534E;margin-top:2px}
.go{margin-top:12px;background:#15803D;color:#fff;font-weight:700;font-size:18px;text-align:center;padding:12px;border-radius:12px}
.leaflet-control-attribution{font-size:9px}</style></head><body><div id="map"></div>
<div class="card"><div class="eta" id="eta">Finding route…</div><div class="sub" id="sub">To Carmen's house</div><div class="go">Start</div></div>
<script>
var a=[${a.lat},${a.lng}], b=[${b.lat},${b.lng}];
var map=L.map('map',{zoomControl:false});
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
L.circleMarker(a,{radius:9,color:'#fff',weight:3,fillColor:'#2563EB',fillOpacity:1}).addTo(map);
L.circleMarker(b,{radius:11,color:'#fff',weight:3,fillColor:'#DC2626',fillOpacity:1}).addTo(map);
map.fitBounds([a,b],{padding:[70,70]});
fetch('https://router.project-osrm.org/route/v1/driving/'+a[1]+','+a[0]+';'+b[1]+','+b[0]+'?overview=full&geometries=geojson')
 .then(function(r){return r.json()}).then(function(j){var r=j.routes[0];
  var line=r.geometry.coordinates.map(function(c){return [c[1],c[0]]});
  L.polyline(line,{color:'#2563EB',weight:7,opacity:.9}).addTo(map);
  map.fitBounds(line,{paddingTopLeft:[50,90],paddingBottomRight:[50,200]});
  document.getElementById('eta').textContent=Math.round(r.duration/60)+' min';
  document.getElementById('sub').textContent=(r.distance/1000).toFixed(1)+' km · to Carmen\\'s house';
 }).catch(function(){document.getElementById('eta').textContent='Directions'});
</script></body></html>`;
}

w.__demo = {
  setAirplane(on: boolean) {
    airplane = on;
    drawBar();
    if (on) {
      events?.close();
      events = null;
    } else connect();
  },
  banner,
};
