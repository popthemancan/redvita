import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { t } from "@/lib/i18n";
import type { LatLng } from "@/lib/location";
import { colors, font } from "./theme";

export type MapPatient = { id: string; name: string; tone: "ok" | "warn" | "danger"; home: LatLng | null };
export type MapPerson = { name: string; initials: string; me: boolean; responding: boolean; home: LatLng | null };

type Props = {
  patients: MapPatient[];
  people: MapPerson[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const html = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body,#map{margin:0;height:100%;background:#E9E5DF;font-family:-apple-system,system-ui,Roboto,sans-serif}
  .leaflet-control-attribution{font-size:9px}
  .home{display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);width:max-content}
  .pin{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;
       border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.3)}
  .pin svg{width:24px;height:24px;fill:#fff}
  .ok{background:${colors.ok}} .warn{background:${colors.warn}} .danger{background:${colors.danger}}
  .danger.pin{animation:pulse 1.4s ease-out infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(220,38,38,.6)}100%{box-shadow:0 0 0 18px rgba(220,38,38,0)}}
  .tag{margin-top:4px;background:#fff;border-radius:10px;padding:3px 8px;font-size:13px;font-weight:700;color:#1C1917;
       box-shadow:0 2px 6px rgba(0,0,0,.2)}
  .sel .pin{width:54px;height:54px}
  .person{transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;width:max-content}
  .face{width:34px;height:34px;border-radius:50%;background:#57534E;color:#fff;font-size:13px;font-weight:700;
        display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)}
  .me .face{background:${colors.me}}
  .going .face{border-color:${colors.ok};box-shadow:0 0 0 3px ${colors.ok}}
  .who{margin-top:2px;font-size:11px;font-weight:700;color:#1C1917;background:rgba(255,255,255,.9);border-radius:6px;padding:1px 5px}
</style></head><body><div id="map"></div><script>
  var map = L.map('map',{zoomControl:false,attributionControl:true});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,
    attribution:'© OpenStreetMap'}).addTo(map);
  map.setView([18.4,-66.1],11);
  var layer = L.layerGroup().addTo(map), lastFit = '';
  var house = '<svg viewBox="0 0 24 24"><path d="M12 3 2 11h3v9h5v-6h4v6h5v-9h3z"/></svg>';
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  window.update = function(d){
    layer.clearLayers();
    var pts = [];
    d.patients.forEach(function(p){
      if(!p.home) return;
      var sel = p.id === d.selectedId;
      var icon = L.divIcon({className:'',iconSize:null,html:
        '<div class="home '+(sel?'sel':'')+'"><div class="pin '+p.tone+'">'+house+'</div><div class="tag">'+esc(p.name)+'</div></div>'});
      L.marker([p.home.lat,p.home.lng],{icon:icon,zIndexOffset:sel?1000:500}).addTo(layer)
        .on('click',function(){window.ReactNativeWebView.postMessage(JSON.stringify({select:p.id}))});
      if(sel) pts.push([p.home.lat,p.home.lng]);
    });
    d.people.forEach(function(m){
      if(!m.home) return;
      var icon = L.divIcon({className:'',iconSize:null,html:
        '<div class="person '+(m.me?'me ':'')+(m.responding?'going':'')+'"><div class="face">'+esc(m.initials)+'</div><div class="who">'+(m.me?esc(d.you):esc(m.name))+'</div></div>'});
      L.marker([m.home.lat,m.home.lng],{icon:icon}).addTo(layer);
      pts.push([m.home.lat,m.home.lng]);
    });
    var key = d.selectedId + ':' + pts.length;
    if(pts.length && key !== lastFit){
      lastFit = key;
      if(pts.length === 1) map.setView(pts[0], 16); else map.fitBounds(pts,{padding:[60,60],maxZoom:16});
    }
  };
  window.ReactNativeWebView.postMessage(JSON.stringify({ready:true}));
</script></body></html>`;

export function FamilyMap({ patients, people, selectedId, onSelect }: Props) {
  const web = useRef<WebView<object>>(null);
  const ready = useRef(false);
  const payload = useMemo(() => JSON.stringify({ patients, people, selectedId, you: t.common.you }), [patients, people, selectedId]);

  useEffect(() => {
    if (ready.current) web.current?.injectJavaScript(`window.update(${payload}); true;`);
  }, [payload]);

  function onMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.ready) {
        ready.current = true;
        web.current?.injectJavaScript(`window.update(${payload}); true;`);
      }
      if (typeof msg.select === "string") onSelect(msg.select);
    } catch {
    }
  }

  const anyHome = patients.some((p) => p.home);
  if (!anyHome) {
    return (
      <View style={[styles.fill, styles.empty]}>
        <Ionicons name="map-outline" size={36} color={colors.muted} />
        <Text style={styles.emptyText}>{t.location.noHome}</Text>
      </View>
    );
  }

  return (
    <WebView<object>
      ref={web}
      style={styles.fill}
      originWhitelist={["*"]}
      source={{ html }}
      onMessage={onMessage}
      javaScriptEnabled
      scrollEnabled={false}
      setSupportMultipleWindows={false}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#E9E5DF" },
  empty: { alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  emptyText: { fontSize: font.small, color: colors.muted, textAlign: "center" },
});
