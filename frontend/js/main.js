// ==========================
// 地図初期化
// ==========================
const map = L.map("map").setView([35.681236, 139.767125], 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
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

  const coordStr = points
    .map(p => `${p.lng},${p.lat}`)
    .join(";");

  const url =
    `https://router.project-osrm.org/route/v1/foot/${coordStr}` +
    `?overview=full&geometries=geojson`;

  const res = await fetch(url);
  const data = await res.json();
  if (!data.routes) return;

  const coords = data.routes[0].geometry.coordinates
    .map(c => [c[1], c[0]]);

  routeLine && map.removeLayer(routeLine);
  routeLine = L.polyline(coords, {
    color: "purple",
    weight: 4
  }).addTo(map);

  updatePOIs(coords);
}

// ==========================
// 観光スポット（Overpass API）
// ==========================
function buildOverpass(points) {
  return `
[out:json][timeout:25];
(
${points.map(p => `
  node(around:60,${p[0]},${p[1]})["tourism"];
  node(around:60,${p[0]},${p[1]})["historic"];
  node(around:60,${p[0]},${p[1]})["leisure"="park"];
`).join("")}
);
out tags center;
`;
}

async function updatePOIs(coords) {
  poiMarkers.forEach(m => map.removeLayer(m));
  poiMarkers = [];
  shownPOIs.clear();

  const sample = coords.filter((_, i) => i % 30 === 0);
  const query = buildOverpass(sample);

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query
  });

  const data = await res.json();
  showPOIs(data.elements);
}

function showPOIs(elements) {
  for (const el of elements) {
    if (!el.lat || shownPOIs.has(el.id)) continue;
    shownPOIs.add(el.id);

    const tags = el.tags || {};
    const html = `
      <div class="popup">
        <b>${tags.name || "おすすめスポット"}</b>
        ${tags.description ? `<p>${tags.description}</p>` : ""}
      </div>
    `;

    const m = L.marker([el.lat, el.lon]).addTo(map).bindPopup(html);
    poiMarkers.push(m);
  }
}

// ==========================
// 検索（Nominatim）
// ==========================
search.oninput = async () => {
  const q = search.value;
  if (q.length < 2) {
    suggest.innerHTML = "";
    return;
  }

  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?q=${encodeURIComponent(q)}&format=json&limit=6`;

  const res = await fetch(url, {
    headers: { "User-Agent": "osanpo-plus" }
  });
  const data = await res.json();

  suggest.innerHTML = "";
  data.forEach(item => {
    const div = document.createElement("div");
    div.textContent = item.display_name;
    div.onclick = () => {
      const latlng = { lat: +item.lat, lng: +item.lon };
      map.setView(latlng, 16);
      placeMarker(latlng);
      suggest.innerHTML = "";
    };
    suggest.appendChild(div);
  });
};

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
