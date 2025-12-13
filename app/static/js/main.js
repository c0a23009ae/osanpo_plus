// ==========================
// 地図
// ==========================
const map = L.map("map").setView([35.681236, 139.767125], 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

// ==========================
// 状態
// ==========================
let mode = null;
let startMarker = null;
let goalMarker = null;
let wayMarkers = [];
let routeLine = null;
let poiMarkers = [];
let shownPOIs = new Set();

// ==========================
// ボタン
// ==========================
startBtn.onclick = () => mode = "start";
wayBtn.onclick   = () => mode = "way";
goalBtn.onclick  = () => mode = "goal";

clearBtn.onclick = () => {
  startMarker && map.removeLayer(startMarker);
  goalMarker && map.removeLayer(goalMarker);
  wayMarkers.forEach(m => map.removeLayer(m));
  poiMarkers.forEach(m => map.removeLayer(m));
  routeLine && map.removeLayer(routeLine);

  startMarker = goalMarker = routeLine = null;
  wayMarkers = [];
  poiMarkers = [];
  shownPOIs.clear();
};

// ==========================
// 地図クリック
// ==========================
map.on("click", e => placeMarker(e.latlng));

function placeMarker(latlng) {
  if (!mode) return;

  if (mode === "start") {
    startMarker && map.removeLayer(startMarker);
    startMarker = L.marker(latlng, { icon: redIcon() }).addTo(map);
  }

  if (mode === "goal") {
    goalMarker && map.removeLayer(goalMarker);
    goalMarker = L.marker(latlng, { icon: greenIcon() }).addTo(map);
  }

  if (mode === "way") {
    const m = L.marker(latlng, { icon: blueIcon() }).addTo(map);
    m.on("click", () => {
      map.removeLayer(m);
      wayMarkers = wayMarkers.filter(w => w !== m);
      drawRoute();
    });
    wayMarkers.push(m);
  }

  drawRoute();
}

// ==========================
// OSRM ルーティング
// ==========================
async function drawRoute() {
  if (!startMarker || !goalMarker) return;

  const points = [
    startMarker.getLatLng(),
    ...wayMarkers.map(m => m.getLatLng()),
    goalMarker.getLatLng()
  ];

  const coordStr = points.map(p => `${p.lng},${p.lat}`).join(";");

  const url =
    `https://router.project-osrm.org/route/v1/foot/${coordStr}` +
    `?overview=full&geometries=geojson`;

  const res = await fetch(url);
  const data = await res.json();
  if (!data.routes) return;

  const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);

  routeLine && map.removeLayer(routeLine);
  routeLine = L.polyline(coords, { color: "purple", weight: 4 }).addTo(map);

  poiMarkers.forEach(m => map.removeLayer(m));
  poiMarkers = [];
  shownPOIs.clear();

  const sampled = coords.filter((_, i) => i % 30 === 0);
  searchPOIs(sampled);
}

// ==========================
// Overpass API
// ==========================
function buildOverpassQuery(points) {
  const q = points.map(p => `
    node(around:80,${p[0]},${p[1]})["tourism"];
    node(around:80,${p[0]},${p[1]})["historic"];
    node(around:80,${p[0]},${p[1]})["leisure"="park"];
  `).join("");

  return `
[out:json][timeout:25];
(
${q}
);
out tags center;
`;
}

async function searchPOIs(points) {
  const res = await fetch(
    "https://overpass-api.de/api/interpreter",
    { method: "POST", body: buildOverpassQuery(points) }
  );
  const data = await res.json();
  showPOIs(data.elements);
}

// ==========================
// Wikipedia 画像取得
// ==========================
async function fetchPlaceImage(name) {
  const searchUrl =
    "https://ja.wikipedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: name,
      format: "json",
      origin: "*"
    });

  const sRes = await fetch(searchUrl);
  const sData = await sRes.json();
  if (!sData.query.search.length) return null;

  const pageId = sData.query.search[0].pageid;

  const imgUrl =
    "https://ja.wikipedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      pageids: pageId,
      prop: "pageimages",
      pithumbsize: 400,
      format: "json",
      origin: "*"
    });

  const iRes = await fetch(imgUrl);
  const iData = await iRes.json();

  const page = iData.query.pages[pageId];
  return page.thumbnail ? page.thumbnail.source : null;
}

// ==========================
// POI 表示
// ==========================
async function showPOIs(elements) {
  for (const el of elements) {
    if (!el.lat || !el.lon || shownPOIs.has(el.id)) continue;
    shownPOIs.add(el.id);

    const name = el.tags?.name || "おすすめスポット";
    const img = await fetchPlaceImage(name);

    let html = `<div class="popup"><b>${name}</b>`;
    if (img) html += `<img src="${img}">`;
    html += `</div>`;

    const m = L.marker([el.lat, el.lon]).addTo(map).bindPopup(html);
    poiMarkers.push(m);
  }
}

// ==========================
// アイコン
// ==========================
function redIcon() {
  return new L.Icon({
    iconUrl: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
    iconSize: [32, 32]
  });
}
function blueIcon() {
  return new L.Icon({
    iconUrl: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
    iconSize: [32, 32]
  });
}
function greenIcon() {
  return new L.Icon({
    iconUrl: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
    iconSize: [32, 32]
  });
}
