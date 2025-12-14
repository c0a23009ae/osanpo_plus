// ==========================
// グローバル変数 & 設定
// ==========================
const map = L.map("map").setView([35.681236, 139.767125], 14);

// OSMレイヤー（企業のアプリらしく、少し彩度を落としたりカスタムしたいが、まずは標準OSMで）
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// 状態管理
const state = {
  mode: null, // "start", "way", "goal"
  markers: {
    start: null,
    goal: null,
    ways: [], // Array of markers
    route: null,
    pois: []  // Array of markers
  },
  shownPOIs: new Set()
};

// UI要素
const ui = {
  search: document.getElementById("search"),
  suggest: document.getElementById("suggest"),
  loading: document.getElementById("loadingOverlay"),
  toast: new bootstrap.Toast(document.getElementById("appToast")),
  toastMsg: document.getElementById("toastMessage"),
  calcBtn: document.getElementById("calcRouteBtn")
};

// ==========================
// ヘルパー関数: トースト & ローディング
// ==========================
function showToast(msg) {
  ui.toastMsg.textContent = msg;
  ui.toast.show();
}

function setLoading(isLoading) {
  if (isLoading) ui.loading.classList.remove("d-none");
  else ui.loading.classList.add("d-none");
}

// ==========================
// カスタムマーカー作成 (FontAwesome)
// ==========================
function createCustomIcon(type) {
  let iconClass = "";
  let bgClass = "";
  
  if (type === "start") {
    iconClass = "fa-play";
    bgClass = "marker-start";
  } else if (type === "goal") {
    iconClass = "fa-flag-checkered";
    bgClass = "marker-goal";
  } else if (type === "way") {
    iconClass = "fa-location-dot";
    bgClass = "marker-way";
  }

  return L.divIcon({
    className: "", // デフォルトクラスを無効化
    html: `<div class="custom-marker ${bgClass}"><i class="fa-solid ${iconClass}"></i></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 42], // 下部中央にアンカー
    popupAnchor: [0, -40]
  });
}

// ==========================
// イベントリスナー設定
// ==========================

// モード切り替え (ラジオボタン)
document.querySelectorAll('input[name="mode"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    state.mode = e.target.id.replace("mode", "").toLowerCase(); // Start, Way, Goal
    showToast(`${state.mode.toUpperCase()} 地点の選択モードです。地図をクリックしてください。`);
  });
});

// 全削除
document.getElementById("clearBtn").onclick = () => {
  if (state.markers.start) map.removeLayer(state.markers.start);
  if (state.markers.goal) map.removeLayer(state.markers.goal);
  if (state.markers.route) map.removeLayer(state.markers.route);
  state.markers.ways.forEach(m => map.removeLayer(m));
  state.markers.pois.forEach(m => map.removeLayer(m));

  state.markers.start = null;
  state.markers.goal = null;
  state.markers.ways = [];
  state.markers.pois = [];
  state.shownPOIs.clear();

  // フォームリセット
  document.querySelectorAll('input[name="mode"]').forEach(r => r.checked = false);
  state.mode = null;
  ui.search.value = "";
  updateCalcButtonState();
  showToast("地図をクリアしました");
};

// ルート計算ボタン
ui.calcBtn.onclick = () => drawRoute();

// 地図クリック
map.on("click", e => {
  if (!state.mode) return;
  placeMarker(e.latlng, state.mode);
});

// ==========================
// マーカー配置ロジック
// ==========================
function placeMarker(latlng, type) {
  if (type === "start") {
    if (state.markers.start) map.removeLayer(state.markers.start);
    state.markers.start = L.marker(latlng, { icon: createCustomIcon("start") }).addTo(map);
  } else if (type === "goal") {
    if (state.markers.goal) map.removeLayer(state.markers.goal);
    state.markers.goal = L.marker(latlng, { icon: createCustomIcon("goal") }).addTo(map);
  } else if (type === "way") {
    const m = L.marker(latlng, { icon: createCustomIcon("way") }).addTo(map);
    // 経由地はクリックで削除可能に
    m.bindPopup("クリックで削除").on("click", () => {
        map.removeLayer(m);
        state.markers.ways = state.markers.ways.filter(w => w !== m);
        updateCalcButtonState();
    });
    state.markers.ways.push(m);
  }

  updateCalcButtonState();
}

function updateCalcButtonState() {
  // スタートとゴールがあれば計算ボタン有効化
  ui.calcBtn.disabled = !(state.markers.start && state.markers.goal);
}

// ==========================
// ルート検索 & 描画 (OSRM)
// ==========================
async function drawRoute() {
  if (!state.markers.start || !state.markers.goal) return;

  setLoading(true);
  try {
    const points = [
      state.markers.start.getLatLng(),
      ...state.markers.ways.map(m => m.getLatLng()),
      state.markers.goal.getLatLng()
    ];

    const coordStr = points.map(p => `${p.lng},${p.lat}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/foot/${coordStr}?overview=full&geometries=geojson`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("ルート検索に失敗しました");
    
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) {
      showToast("ルートが見つかりませんでした");
      return;
    }

    // 既存ルート・POI削除
    if (state.markers.route) map.removeLayer(state.markers.route);
    state.markers.pois.forEach(m => map.removeLayer(m));
    state.markers.pois = [];
    state.shownPOIs.clear();

    // 新規ルート描画
    const routeGeoJSON = data.routes[0].geometry;
    state.markers.route = L.geoJSON(routeGeoJSON, {
      style: { color: "#6f42c1", weight: 6, opacity: 0.8 }
    }).addTo(map);

    // マップをルート全体にフィット
    map.fitBounds(state.markers.route.getBounds(), { padding: [50, 50] });

    // スポット検索 (間引き処理)
    const allCoords = routeGeoJSON.coordinates.map(c => [c[1], c[0]]); // GeoJSONは[lon, lat]なので反転
    const sampled = allCoords.filter((_, i) => i % 40 === 0); // 間引き間隔調整
    await fetchPOIs(sampled);

    showToast(`ルート計算完了: 距離 ${(data.routes[0].distance / 1000).toFixed(1)}km`);

  } catch (e) {
    console.error(e);
    showToast("エラー: " + e.message);
  } finally {
    setLoading(false);
  }
}

// ==========================
// POI 検索 (Backend)
// ==========================
async function fetchPOIs(points) {
  try {
    const res = await fetch("/api/poi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points })
    });
    const data = await res.json();
    showPOIsOnMap(data.elements || []);
  } catch (e) {
    console.error("POI Fetch Error", e);
  }
}

// ==========================
// POI 表示 & Wiki画像
// ==========================
function showPOIsOnMap(elements) {
  elements.forEach(el => {
    if (!el.lat || !el.lon || state.shownPOIs.has(el.id)) return;
    state.shownPOIs.add(el.id);

    const tags = el.tags || {};
    const name = tags.name || "スポット";

    // ポップアップコンテンツ生成
    const container = document.createElement("div");
    
    const header = document.createElement("div");
    header.className = "poi-popup-header";
    header.textContent = name;
    container.appendChild(header);

    const body = document.createElement("div");
    body.className = "poi-popup-body";

    // カテゴリバッジなどを出すとより良い
    if(tags.tourism) body.innerHTML += `<span class="badge bg-info text-dark me-1">${tags.tourism}</span>`;
    if(tags.historic) body.innerHTML += `<span class="badge bg-warning text-dark me-1">歴史</span>`;

    const img = document.createElement("img");
    img.className = "poi-popup-img";
    body.appendChild(img);
    container.appendChild(body);

    // マーカー作成 (小さめのドット)
    const marker = L.circleMarker([el.lat, el.lon], {
      radius: 6,
      fillColor: "#ffc107",
      color: "#fff",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8
    }).addTo(map);

    marker.on("click", (e) => {
      L.DomEvent.stopPropagation(e); // 地図クリックを無効化
    });

    marker.bindPopup(container);
    state.markers.pois.push(marker);

    // ポップアップが開かれた時だけ画像を取得する (負荷軽減)
    marker.on("popupopen", () => {
        if (img.src) return; // 既に取得済みなら何もしない
        fetchWikiImage(name, tags, img);
    });
  });
}

function fetchWikiImage(name, tags, imgElement) {
    // 1. タグに画像がある場合
    if (tags.image) {
        imgElement.src = tags.image;
        imgElement.style.display = "block";
        return;
    }
    // 2. Wikimedia Commons
    if (tags.wikimedia_commons && tags.wikimedia_commons.startsWith("File:")) {
        const filename = tags.wikimedia_commons.replace("File:", "");
        imgElement.src = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=300`;
        imgElement.style.display = "block";
        return;
    }

    // 3. Wikipedia API検索
    const apiUrl = `https://ja.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=pageimages&pithumbsize=300&generator=search&gsrsearch=${encodeURIComponent(name)}`;
    
    fetch(apiUrl)
        .then(r => r.json())
        .then(data => {
            const pages = data.query?.pages;
            if (pages) {
                const page = Object.values(pages)[0];
                if (page.thumbnail && page.thumbnail.source) {
                    imgElement.src = page.thumbnail.source;
                    imgElement.style.display = "block";
                } else {
                    // 画像がない場合は非表示のまま、またはプレースホルダー
                    imgElement.remove();
                }
            } else {
                imgElement.remove();
            }
        })
        .catch(() => imgElement.remove());
}

// ==========================
// 住所検索 (Nominatim)
// ==========================
let searchTimer = null;
ui.search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = ui.search.value.trim();
  
  if (q.length < 2) {
    ui.suggest.style.display = "none";
    return;
  }

  searchTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      
      ui.suggest.innerHTML = "";
      if (data.length === 0) {
        ui.suggest.style.display = "none";
        return;
      }

      data.forEach(item => {
        const a = document.createElement("button");
        a.className = "list-group-item list-group-item-action text-start";
        a.innerHTML = `<i class="fa-solid fa-location-dot text-muted me-2"></i> ${item.display_name}`;
        a.onclick = () => {
          const latlng = { lat: parseFloat(item.lat), lng: parseFloat(item.lon) };
          map.setView(latlng, 16);
          // 検索結果をセンターにするだけで、マーカーはユーザーに選ばせる（UX上の選択）
          // もし自動でSTARTにするならここで placeMarker(latlng, 'start')
          ui.suggest.style.display = "none";
          ui.search.value = item.display_name.split(",")[0]; // 短い名前だけ残す
        };
        ui.suggest.appendChild(a);
      });
      ui.suggest.style.display = "block";

    } catch (e) {
      console.error(e);
    }
  }, 400); // Debounce
});

// 検索ボックス外をクリックしたら閉じる
document.addEventListener("click", (e) => {
  if (!ui.search.contains(e.target) && !ui.suggest.contains(e.target)) {
    ui.suggest.style.display = "none";
  }
});