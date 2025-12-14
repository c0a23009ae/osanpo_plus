from flask import Blueprint, render_template, request, jsonify
import requests
import logging

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# main_bp = Blueprint(
#     "main",
#     __name__,
#     template_folder="templates",
#     static_folder="static"
# )
main_bp = Blueprint(
    "main",
    __name__,
    template_folder="templates",
    static_folder="static", 
)

# OpenStreetMap系のAPIを利用する際のマナーとしてUser-Agentを設定
HEADERS = {
    "User-Agent": "OsanpoPlusApp/1.0 rogyo112@fanclub.pm" 
}

# ==========================
# 画面
# ==========================
@main_bp.route("/")
def index():
    return render_template("index.html")

# ==========================
# 検索（Nominatim）
# ==========================
@main_bp.route("/api/search")
def search():
    q = request.args.get("q", "")
    if len(q) < 2:
        return jsonify([])

    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": q,
        "format": "json",
        "limit": 5,
        "addressdetails": 0, # 詳細住所は不要
        "countrycodes": "jp" # 日本国内に限定
    }

    try:
        res = requests.get(url, params=params, headers=HEADERS, timeout=10)
        res.raise_for_status()
        return jsonify(res.json())
    except Exception as e:
        logger.error(f"Search API Error: {e}")
        return jsonify([])   # ← ステータス200


# ==========================
# 観光スポット（Overpass API）
# ==========================
@main_bp.route("/api/poi", methods=["POST"])
def poi():
    data = request.json
    points = data.get("points", [])
    
    if not points or len(points) > 100: # リクエスト過多を防ぐ
        return jsonify({"elements": []})

    # クエリ構築: 指定座標の周囲の観光スポットなどを検索
    # node(around:範囲, 緯度, 経度)
    body_parts = []
    for lat, lon in points:
        # 半径80m以内の tourism, historic, leisure=park を検索
        part = f"""
            (
             node(around:80,{lat},{lon})["tourism"];
             node(around:80,{lat},{lon})["historic"];
             node(around:80,{lat},{lon})["leisure"="park"];
            );
        """
        body_parts.append(part)

    # 連結（OverpassはUnionでつなげると重くなることがあるので、ここではシンプルに列挙）
    # 実際の運用ではバウンディングボックス(bbox)検索の方が効率的だが、ルート沿いなのでこの方式を維持
    
    # クエリ全体
    query_body = "".join(body_parts)
    
    query = f"""
        [out:json][timeout:25];
        (
          {query_body}
        );
        out tags center;
    """

    try:
        # Overpass APIのエンドポイント（混雑時は代替サーバーへの切り替えなどを検討）
        res = requests.post(
            "https://overpass-api.de/api/interpreter",
            data=query,
            headers=HEADERS,
            timeout=30
        )
        res.raise_for_status()
        return jsonify(res.json())
    except Exception as e:
        logger.error(f"Overpass API Error: {e}")
        return jsonify({"elements": [], "error": str(e)}), 500