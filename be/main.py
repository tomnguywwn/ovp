import os
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import httpx
from typing import Optional

OVERPASS_URL = os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter")
OSRM_URL = os.environ.get("OSRM_URL", "http://router.project-osrm.org")

app = FastAPI(title="Convenience Finder - Hanoi")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET","POST","OPTIONS"],
    allow_headers=["*"],
)

# Serve frontend (fe/) files under /static to avoid shadowing API routes
FE_DIR = os.path.join(os.path.dirname(__file__), "..", "fe")
app.mount("/static", StaticFiles(directory=FE_DIR), name="static")

from fastapi.responses import FileResponse


@app.get("/", include_in_schema=False)
async def root():
    """Return the frontend index.html"""
    index_path = os.path.join(FE_DIR, "index.html")
    return FileResponse(index_path)


async def query_overpass(lat: float, lon: float, radius: int = 1000):
    q = f"""
    [out:json];
    (
      node(around:{radius},{lat},{lon})["shop"="convenience"];
      way(around:{radius},{lat},{lon})["shop"="convenience"];
      relation(around:{radius},{lat},{lon})["shop"="convenience"];
    );
    out center tags;
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(OVERPASS_URL, data=q)
        resp.raise_for_status()
        return resp.json()


@app.get("/api/nearby")
async def nearby(lat: float = Query(...), lon: float = Query(...), radius: int = Query(1000)):
    try:
        data = await query_overpass(lat, lon, radius)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Overpass request failed: {str(e)}")

    features = []
    for el in data.get("elements", []):
        props = el.get("tags", {})
        props["osm_id"] = el.get("id")
        props["type"] = el.get("type")
        # get coordinates
        if el.get("type") == "node":
            lat_e = el.get("lat")
            lon_e = el.get("lon")
        else:
            center = el.get("center") or {}
            lat_e = center.get("lat")
            lon_e = center.get("lon")
        if lat_e is None or lon_e is None:
            continue
        name = props.get("name") or props.get("brand") or "Unnamed convenience"
        feature = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon_e, lat_e]},
            "properties": {"name": name, **props},
        }
        features.append(feature)

    return {"type": "FeatureCollection", "features": features}


@app.get("/api/route")
async def route(
    start_lat: float = Query(...),
    start_lon: float = Query(...),
    end_lat: float = Query(...),
    end_lon: float = Query(...),
):
    url = f"{OSRM_URL}/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}"
    params = {"overview": "full", "geometries": "geojson"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            j = resp.json()
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Routing request failed: {str(e)}")

    if not j.get("routes"):
        raise HTTPException(status_code=404, detail="No route found")

    route = j["routes"][0]
    geom = route.get("geometry")
    distance = route.get("distance")
    duration = route.get("duration")

    return {"type": "Feature", "geometry": geom, "properties": {"distance": distance, "duration": duration}}