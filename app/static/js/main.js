// ==========================
// 地図初期化
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
  fetchPOIs(sampled);
}

// ==========================
// POI 検索（バックエンド）
// ==========================
async function fetchPOIs(points) {
  const res = await fetch("/api/poi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ points })
  });

  const data = await res.json();
  showPOIs(data.elements || []);
}

// ==========================
// POI 表示（Wikipedia 名前検索）
// ==========================
function showPOIs(elements) {
  elements.forEach(el => {
    if (!el.lat || !el.lon || shownPOIs.has(el.id)) return;
    shownPOIs.add(el.id);

    const tags = el.tags || {};
    const name = tags.name || "おすすめスポット";

    const popup = document.createElement("div");
    popup.className = "popup";

    const title = document.createElement("b");
    title.textContent = name;
    popup.appendChild(title);

    const img = document.createElement("img");
    img.style.display = "none";
    popup.appendChild(img);

    const marker = L.marker([el.lat, el.lon]).addTo(map);
    marker.bindPopup(popup);
    poiMarkers.push(marker);

    // ===== 画像更新関数 =====
    const updatePopup = () => {
      img.style.display = "block";
      marker.setPopupContent(popup);
    };

    // ===== 優先順位 =====
    if (tags.image) {
      img.src = tags.image;
      updatePopup();
      return;
    }

    if (tags.wikimedia_commons?.startsWith("File:")) {
      img.src =
        "https://commons.wikimedia.org/wiki/Special:FilePath/" +
        encodeURIComponent(tags.wikimedia_commons.replace("File:", ""));
      updatePopup();
      return;
    }

    // ===== Wikipedia 名前検索（本命）=====
    fetch(
      `https://ja.wikipedia.org/w/api.php?` +
      new URLSearchParams({
        action: "query",
        format: "json",
        prop: "pageimages",
        pithumbsize: 400,
        generator: "search",
        gsrsearch: name,
        origin: "*"
      })
    )
      .then(r => r.json())
      .then(data => {
        const pages = data.query?.pages;
        if (!pages) return;

        const page = Object.values(pages)[0];
        if (page?.thumbnail?.source) {
          img.src = page.thumbnail.source;
          updatePopup();
        }
      })
      .catch(() => {});
  });
}

// ==========================
// 検索（Nominatim）
// ==========================
let timer = null;
search.oninput = () => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const q = search.value.trim();
    if (q.length < 2) {
      suggest.innerHTML = "";
      return;
    }

    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
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
        search.value = item.display_name;
      };
      suggest.appendChild(div);
    });
  }, 400);
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
