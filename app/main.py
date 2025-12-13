from flask import Blueprint, render_template, request, jsonify
import requests

main_bp = Blueprint(
    "main",
    __name__,
    template_folder="templates",
    static_folder="static"
)

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
        "limit": 6
    }

    res = requests.get(
        url,
        params=params,
        headers={"User-Agent": "osanpo-plus"}
    )

    return jsonify(res.json())

# ==========================
# 観光スポット（Overpass）
# ==========================
@main_bp.route("/api/poi", methods=["POST"])
def poi():
    data = request.json
    points = data.get("points", [])

    body = ""
    for lat, lon in points:
        body += f"""
        node(around:60,{lat},{lon})["tourism"];
        node(around:60,{lat},{lon})["historic"];
        node(around:60,{lat},{lon})["leisure"="park"];
        """

    query = f"""
[out:json][timeout:25];
(
{body}
);
out tags center;
"""

    res = requests.post(
        "https://overpass-api.de/api/interpreter",
        data=query
    )

    return jsonify(res.json())
