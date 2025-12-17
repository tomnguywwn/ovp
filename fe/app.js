document.addEventListener('DOMContentLoaded', function() {
  console.log('app.js: DOM loaded, initializing map');
  
  const hanoi = [21.0277644, 105.8341598];
  const mapEl = document.getElementById('map');
  if (!mapEl) {
    console.error('Map element not found!');
    return;
  }
  
  const map = L.map('map').setView(hanoi, 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);
  
  console.log('Map initialized');

  let originMarker = null;
  let originLatLng = null;
  let searchCircle = null;
  let storeLayer = L.layerGroup().addTo(map);
  let routeLayer = L.layerGroup().addTo(map);

  function setInfo(text) {
    const infoEl = document.getElementById('info');
    if (infoEl) infoEl.innerText = text || '';
  }

  map.on('click', async function(e) {
    console.log('Map clicked at', e.latlng);
    originLatLng = e.latlng;
    if (originMarker) originMarker.setLatLng(originLatLng);
    else originMarker = L.marker(originLatLng, {draggable:false}).addTo(map).bindPopup('Origin').openPopup();

    // draw 1km circle
    if (searchCircle) searchCircle.setLatLng(originLatLng);
    else searchCircle = L.circle(originLatLng, {radius:1000, color:'#3388ff', fill:false}).addTo(map);

    setInfo('Searching for convenience stores (1 km)...');

    try {
      const res = await fetch(`/api/nearby?lat=${originLatLng.lat}&lon=${originLatLng.lng}&radius=1000`);
      if (!res.ok) throw new Error(await res.text());
      const geojson = await res.json();
      console.log('Nearby stores:', geojson.features.length);
      renderStores(geojson.features || []);
      setInfo(`${(geojson.features || []).length} stores found`);
    } catch (err) {
      console.error('Nearby error:', err);
      setInfo('Search failed: ' + err.message);
    }
  });

  function renderStores(features) {
    console.log('Rendering', features.length, 'stores');
    storeLayer.clearLayers();
    routeLayer.clearLayers();
    const list = document.getElementById('stores');
    if (!list) {
      console.error('Stores list element not found!');
      return;
    }
    list.innerHTML = '';
    features.forEach((f, idx) => {
      const coords = f.geometry.coordinates; // [lon, lat]
      const latlng = L.latLng(coords[1], coords[0]);
      const name = f.properties.name || 'Unnamed';
      const marker = L.marker(latlng).addTo(storeLayer).bindPopup(name);

      // list item
      const li = document.createElement('li');
      li.textContent = name;
      li.onclick = () => {
        if (!originLatLng) {
          alert('Click the map to pick an origin first.');
          return;
        }
        // zoom to marker
        map.flyTo(latlng, 16);
        marker.openPopup();
        // request route
        fetchRoute(originLatLng, latlng);
      };
      list.appendChild(li);
    });
  }

  async function fetchRoute(startLatLng, endLatLng) {
    setInfo('Fetching route...');
    routeLayer.clearLayers();
    try {
      const url = `/api/route?start_lat=${startLatLng.lat}&start_lon=${startLatLng.lng}&end_lat=${endLatLng.lat}&end_lon=${endLatLng.lng}`;
      console.log('Fetching route:', url);
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const feature = await res.json();
      const geom = feature.geometry;
      const route = L.geoJSON(geom, {style:{color:'red', weight:4}}).addTo(routeLayer);
      map.fitBounds(route.getBounds(), {padding:[50,50]});
      const props = feature.properties || {};
      setInfo(`Distance: ${(props.distance/1000).toFixed(2)} km, ETA: ${(props.duration/60).toFixed(0)} min`);
    } catch (err) {
      console.error('Route error:', err);
      setInfo('Route failed: ' + err.message);
    }
  }
});