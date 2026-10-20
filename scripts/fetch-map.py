#!/usr/bin/env python3
"""대구 중구 지도 데이터 수집 (OpenStreetMap Nominatim).

Nominatim 이용 정책에 맞춰 1초에 1건 이하로 요청한다.
결과: scripts/osm-raw.json (원본) — 가공은 scripts/build-map.py
지도 데이터 © OpenStreetMap contributors (ODbL)
"""
import json, time, urllib.parse, urllib.request, sys, os

UA = "seomu-village/1.0 (+https://github.com/noker2816-wq/2233)"
VIEWBOX = "128.568,35.884,128.628,35.846"  # 중구 일대 (서,북,동,남)
OUT = os.path.join(os.path.dirname(__file__), "osm-raw.json")

POIS = {
    "hall": ["대구광역시 중구청"],
    "dong": [f"{d} 행정복지센터" for d in ["동인동", "삼덕동", "성내1동", "성내2동", "성내3동", "대신동", "남산1동", "남산2동", "남산3동", "남산4동", "대봉1동", "대봉2동"]],
    "place": [
        "서문시장", "교동시장", "스파크랜드", "국채보상운동기념공원", "달성공원", "경상감영공원", "2.28기념중앙공원",
        "계산성당", "청라언덕", "김광석다시그리기길", "방천시장", "약령시", "대구근대역사관", "대구백화점", "현대백화점 대구점",
        "반월당역", "중앙로역", "명덕역", "서문시장역", "달성공원역", "신남역", "남산역", "건들바위역", "대봉교역", "청라언덕역",
        "대구역", "동성로", "삼덕동 대구미술관", "종로", "북성로",
    ],
}
ROADS = ["달구벌대로", "국채보상로", "중앙대로", "공평로", "동덕로", "서성로", "달성로", "태평로", "명덕로", "남산로",
         "신천대로", "동성로", "경상감영길", "종로", "북성로", "서문로", "명륜로", "봉산문화길", "삼덕로", "대봉로", "중앙대로83길"]


def get(params):
    q = urllib.parse.urlencode({**params, "format": "jsonv2", "viewbox": VIEWBOX, "bounded": 1, "countrycodes": "kr"})
    req = urllib.request.Request(f"https://nominatim.openstreetmap.org/search?{q}", headers={"User-Agent": UA, "Accept-Language": "ko"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
            time.sleep(1.1)
            return data
        except Exception as e:  # noqa
            print("  retry", e, file=sys.stderr)
            time.sleep(3)
    return []


def main():
    out = {"pois": {}, "roads": {}, "river": []}
    for group, names in POIS.items():
        for name in names:
            res = get({"q": name, "limit": 3, "polygon_geojson": 1})
            print(group, name, len(res))
            out["pois"][name] = {"group": group, "results": res}
    for name in ROADS:
        res = get({"street": name, "city": "대구", "limit": 50, "polygon_geojson": 1})
        if len(res) < 3:
            res += get({"q": f"{name} 대구 중구", "limit": 50, "polygon_geojson": 1})
        print("road", name, len(res))
        out["roads"][name] = res
    out["river"] = get({"q": "신천", "limit": 20, "polygon_geojson": 1})
    print("river", len(out["river"]))
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
