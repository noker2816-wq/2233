#!/usr/bin/env python3
"""osm-raw.json → site/map-data.json (마을 좌표계로 변환·단순화).

좌표계: 중구청을 원점, 1km ≈ 100단위, 동쪽 +x, 북쪽 -z.
지도 데이터 © OpenStreetMap contributors (ODbL).
OSM에서 찾지 못한 일부 위치는 '대략 위치'(approx: true)로 표시한다.
"""
import json, math, os

HERE = os.path.dirname(__file__)
raw = json.load(open(os.path.join(HERE, "osm-raw.json"), encoding="utf-8"))
OUT = os.path.join(HERE, "..", "site", "map-data.json")

HALL = (35.86925, 128.60594)
KX, KZ = 9025.0, 11095.0


def P(lat, lon):
    return [round((lon - HALL[1]) * KX, 2), round(-(lat - HALL[0]) * KZ, 2)]


def dp(pts, tol):
    """Douglas-Peucker 단순화"""
    if len(pts) < 3:
        return pts
    (x1, z1), (x2, z2) = pts[0], pts[-1]
    dx, dz = x2 - x1, z2 - z1
    L = math.hypot(dx, dz) or 1e-9
    best, idx = -1, 0
    for i in range(1, len(pts) - 1):
        x, z = pts[i]
        d = abs(dz * x - dx * z + x2 * z1 - z2 * x1) / L
        if d > best:
            best, idx = d, i
    if best > tol:
        return dp(pts[: idx + 1], tol)[:-1] + dp(pts[idx:], tol)
    return [pts[0], pts[-1]]


def ring(geo, tol=1.0):
    if geo["type"] == "Polygon":
        coords = geo["coordinates"][0]
    elif geo["type"] == "MultiPolygon":
        coords = max((p[0] for p in geo["coordinates"]), key=len)
    else:
        return None
    pts = [P(lat, lon) for lon, lat in coords]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    # 닫힌 고리는 시작점에서 가장 먼 점으로 둘로 나눠 단순화
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    a = dp(pts[: far + 1], tol)
    b = dp(pts[far:] + [pts[0]], tol)
    return a[:-1] + b[:-1]


def centroid(r):
    a = cx = cz = 0.0
    for (x1, z1), (x2, z2) in zip(r, r[1:] + r[:1]):
        c = x1 * z2 - x2 * z1
        a += c
        cx += (x1 + x2) * c
        cz += (z1 + z2) * c
    a *= 0.5
    if abs(a) < 1e-6:
        return [sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r)]
    return [round(cx / (6 * a), 2), round(cz / (6 * a), 2)]


def first(name):
    res = raw["pois"].get(name, {}).get("results", [])
    return res[0] if res else None


out = {"attribution": "지도 데이터 © OpenStreetMap contributors (ODbL)", "unitsPerKm": 100}

# 경계
jung = raw["bounds"]["중구"][0]
out["jung"] = ring(jung["geojson"], 1.5)
xs = [p[0] for p in out["jung"]]
zs = [p[1] for p in out["jung"]]
BB = (min(xs) - 60, max(xs) + 60, min(zs) - 60, max(zs) + 60)
out["bbox"] = [round(v, 1) for v in BB]

DONG_NAMES = ["동인동", "삼덕동", "성내1동", "성내2동", "성내3동", "대신동", "남산1동", "남산2동", "남산3동", "남산4동", "대봉1동", "대봉2동"]
BAD = {"대신동 행정복지센터"}  # OSM 검색이 다른 건물(성내3동)을 돌려준 경우
ALT_CENTER = {"대봉1동 행정복지센터": "대봉1동 주민센터"}
dongs = []
for d in DONG_NAMES:
    b = raw["bounds"][d][0]
    r = ring(b["geojson"], 1.0)
    c = centroid(r)
    poi = first(f"{d} 행정복지센터")
    approx = poi is None or f"{d} 행정복지센터" in BAD
    center = P(float(poi["lat"]), float(poi["lon"])) if not approx else c
    dongs.append({"name": d, "ring": r, "label": c, "center": center, "approx": approx})
out["dongs"] = dongs
out["hall"] = P(*HALL)

# 도로
MAJOR = {"달구벌대로": 15, "국채보상로": 13, "중앙대로": 13, "공평로": 11, "동덕로": 11, "서성로": 10, "달성로": 11,
         "태평로": 13, "명덕로": 12, "신천대로": 13}
MAJOR_TYPES = {"trunk", "primary", "secondary", "tertiary", "secondary_link"}
seen = set()
minors = []
majors = []


def line(geo):
    if geo["type"] == "LineString":
        return [P(lat, lon) for lon, lat in geo["coordinates"]]
    return None


def inbox(p):
    return BB[0] <= p[0] <= BB[1] and BB[2] <= p[1] <= BB[3]


for name, res in raw["roads"].items():
    major_pts = []
    for r in res:
        if r["osm_id"] in seen:
            continue
        seen.add(r["osm_id"])
        pts = line(r["geojson"])
        if not pts:
            continue
        pts = [p for p in pts if inbox(p)]
        if len(pts) < 2:
            continue
        nm = r["display_name"].split(",")[0].strip()
        if name in MAJOR and nm == name and r["type"] in MAJOR_TYPES:
            major_pts.append(pts)
        else:
            kind = "pedestrian" if r["type"] in ("pedestrian", "footway", "path", "living_street") else "minor"
            w = 6.5 if r["type"] == "tertiary" else 4.2 if kind == "minor" else 4.5
            minors.append({"name": nm, "kind": kind, "w": w, "pts": dp(pts, 0.6)})
    if not major_pts:
        continue
    # 양방향 차로가 따로 그려진 도로도 하나의 중심선으로: 주축으로 투영 → 구간별 평균
    allp = [p for seg in major_pts for p in seg]
    mx = sum(p[0] for p in allp) / len(allp)
    mz = sum(p[1] for p in allp) / len(allp)
    sxx = sum((p[0] - mx) ** 2 for p in allp)
    szz = sum((p[1] - mz) ** 2 for p in allp)
    sxz = sum((p[0] - mx) * (p[1] - mz) for p in allp)
    ang = 0.5 * math.atan2(2 * sxz, sxx - szz)
    ux, uz = math.cos(ang), math.sin(ang)
    # 선분을 촘촘히 나눠서 투영 (점이 드문 구간 보완)
    dense = []
    for seg in major_pts:
        for (x1, z1), (x2, z2) in zip(seg, seg[1:]):
            n = max(1, int(math.hypot(x2 - x1, z2 - z1) / 2))
            for i in range(n):
                t = i / n
                dense.append((x1 + (x2 - x1) * t, z1 + (z2 - z1) * t))
    bins = {}
    STEP = 9
    for x, z in dense:
        a = (x - mx) * ux + (z - mz) * uz
        o = -(x - mx) * uz + (z - mz) * ux
        bins.setdefault(int(math.floor(a / STEP)), []).append(o)
    keys = sorted(bins)
    # 끊긴 구간은 나눈다
    runs, cur = [], [keys[0]]
    for k in keys[1:]:
        if k - cur[-1] > 4:
            runs.append(cur)
            cur = [k]
        else:
            cur.append(k)
    runs.append(cur)
    for run in runs:
        if len(run) < 4:
            continue
        pts = []
        for k in run:
            o = sorted(bins[k])[len(bins[k]) // 2]
            a = (k + 0.5) * STEP
            pts.append([mx + ux * a - uz * o, mz + uz * a + ux * o])
        # 가볍게 평활
        sm = [pts[0]] + [[(pts[i - 1][0] + 2 * pts[i][0] + pts[i + 1][0]) / 4, (pts[i - 1][1] + 2 * pts[i][1] + pts[i + 1][1]) / 4] for i in range(1, len(pts) - 1)] + [pts[-1]]
        majors.append({"name": name, "w": MAJOR[name], "pts": [[round(x, 1), round(z, 1)] for x, z in dp(sm, 0.8)]})

out["majors"] = majors
out["minors"] = minors

# 신천
riv = [r for r in raw["river"] if r["type"] == "river"]
if riv:
    pts = [p for p in line(riv[0]["geojson"]) if BB[0] - 80 <= p[0] <= BB[1] + 80 and BB[2] - 120 <= p[1] <= BB[3] + 120]
    out["river"] = {"w": 24, "pts": dp(pts, 1.0)}

# 명소
PLACES = {
    "서문시장": "market", "교동시장": "market", "방천시장": "market", "스파크랜드": "spark", "국채보상운동기념공원": "park_gukchae",
    "경상감영공원": "park_gyeongsang", "2.28기념중앙공원": "park", "계산성당": "cathedral", "청라언덕": "hill", "약령시": "herbal",
    "대구근대역사관": "museum", "경북대학교병원": "hospital", "대구제일교회": "church", "CGV 대구한일": "cinema",
    "대구역": "station", "김광석다시그리기길": "mural", "대구백화점": "dept", "현대백화점 대구점": "dept", "달성공원": "park_dalseong",
}
# OSM에서 못 찾은 곳: 대략적인 위치 (위도, 경도)
APPROX = {
    "교동시장": (35.8730, 128.6015), "방천시장": (35.8594, 128.6064), "김광석다시그리기길": (35.8603, 128.6070),
    "대구백화점": (35.8690, 128.5963), "현대백화점 대구점": (35.8662, 128.5915), "달성공원": (35.8740, 128.5795),
}
places = []
for name, kind in PLACES.items():
    r = first(name)
    item = {"name": name, "kind": kind}
    if name in APPROX or r is None or (name == "달성공원"):
        lat, lon = APPROX.get(name, (float(r["lat"]), float(r["lon"])) if r else (None, None))
        if lat is None:
            continue
        item.update({"x": P(lat, lon)[0], "z": P(lat, lon)[1], "approx": True})
    else:
        x, z = P(float(r["lat"]), float(r["lon"]))
        item.update({"x": x, "z": z})
        rg = ring(r["geojson"], 0.5) if r["geojson"]["type"] in ("Polygon", "MultiPolygon") else None
        if rg:
            item["ring"] = rg
    places.append(item)
out["places"] = places

# 도시철도
def stp(name, fallback=None):
    r = first(name)
    if r:
        return P(float(r["lat"]), float(r["lon"]))
    return P(*fallback)


out["metro"] = {
    "line3": [
        {"name": "달성공원", "p": stp("달성공원역")}, {"name": "서문시장", "p": stp("서문시장역")},
        {"name": "청라언덕", "p": stp("청라언덕역")}, {"name": "남산", "p": stp("남산역")},
        {"name": "명덕", "p": stp("명덕역")}, {"name": "건들바위", "p": stp("건들바위역")}, {"name": "대봉교", "p": stp("대봉교역")},
    ],
    "entrances": [
        {"name": "1·2호선 반월당역", "p": stp("반월당역")}, {"name": "1호선 중앙로역", "p": P(35.8712, 128.5939), "approx": True},
        {"name": "2호선 경대병원역", "p": P(35.8660, 128.6035), "approx": True}, {"name": "1호선 대구역", "p": stp("대구역")},
    ],
}

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("bbox", out["bbox"], "majors", len(majors), [m["name"] for m in majors], "minors", len(minors), "places", len(places))
for d in dongs:
    print(d["name"], d["center"], "approx" if d["approx"] else "")
print("size", os.path.getsize(OUT))
