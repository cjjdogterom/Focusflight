#!/usr/bin/env python3
"""Generate src/data/runways.json with surveyed runway ends per airport.

Joins the app's airports.json (IATA+ICAO) with OurAirports runways.csv
(public domain) and picks the longest open runway per airport. When both
runway ends have plausible coordinates, they are included so the app can
take off from / land on the REAL runway visible in the satellite imagery;
otherwise only length+ident remain (synthetic fallback geometry).

Usage: python3 scripts/build_runways.py path/to/runways.csv
"""

import csv
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def dist_m(lat1, lon1, lat2, lon2):
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def bearing(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def ang_diff(a, b):
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d


def main(csv_path):
    airports = json.loads((ROOT / 'src/data/airports.json').read_text())
    icao_to_iata = {r[1]: r[0] for r in airports if r[1]}

    by_icao = {}
    with open(csv_path, newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            if row['closed'] == '1':
                continue
            icao = row['airport_ident']
            if icao not in icao_to_iata:
                continue
            by_icao.setdefault(icao, []).append(row)

    out = {}
    with_ends = 0
    for icao, rows in by_icao.items():
        iata = icao_to_iata[icao]
        best = None
        for row in rows:
            le_i, he_i = row['le_ident'].strip(), row['he_ident'].strip()
            try:
                ft = float(row['length_ft']) if row['length_ft'] else 0
            except ValueError:
                ft = 0
            ft_m = ft * 0.3048
            ends = None
            try:
                la1, lo1 = float(row['le_latitude_deg']), float(row['le_longitude_deg'])
                la2, lo2 = float(row['he_latitude_deg']), float(row['he_longitude_deg'])
                span = dist_m(la1, lo1, la2, lo2)
                plausible = span >= 400 and (ft_m == 0 or abs(span - ft_m) / ft_m <= 0.35)
                if plausible and le_i and he_i:
                    # order sanity: le->he bearing should match le true heading
                    try:
                        le_hdg = float(row['le_heading_degT'])
                    except (ValueError, TypeError):
                        le_hdg = None
                    b = bearing(la1, lo1, la2, lo2)
                    if le_hdg is not None and ang_diff(b, le_hdg) > 135:
                        la1, lo1, la2, lo2 = la2, lo2, la1, lo1
                        le_i, he_i = he_i, le_i
                    ends = [
                        [le_i, round(la1, 6), round(lo1, 6)],
                        [he_i, round(la2, 6), round(lo2, 6)],
                    ]
                    length = round(span)
                else:
                    length = round(ft_m) if ft_m else 0
            except (ValueError, TypeError):
                length = round(ft_m) if ft_m else 0
            if length <= 0:
                continue
            ident = f'{le_i}/{he_i}' if le_i and he_i else (le_i or he_i or '?')
            cand = {'lengthM': length, 'ident': ident}
            if ends:
                cand['ends'] = ends
            # prefer runways WITH ends, then by length
            key = (1 if ends else 0, length)
            if best is None or key > best[0]:
                best = (key, cand)
        if best:
            out[iata] = best[1]
            if 'ends' in best[1]:
                with_ends += 1

    # keep airports that had data before but no open runway rows now
    old = json.loads((ROOT / 'src/data/runways.json').read_text())
    for iata, v in old.items():
        out.setdefault(iata, {'lengthM': v['lengthM'], 'ident': v['ident']})

    (ROOT / 'src/data/runways.json').write_text(
        json.dumps(out, separators=(',', ':'), ensure_ascii=False))
    print(f'airports: {len(out)}, with surveyed ends: {with_ends}')


if __name__ == '__main__':
    main(sys.argv[1])
