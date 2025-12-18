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

  // Red marker icon for origin
  const redIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });

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
    else originMarker = L.marker(originLatLng, {draggable:false, icon:redIcon}).addTo(map).bindPopup('Origin').openPopup();

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

  // simple html-escape helper
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

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
      // address may be in properties.address or under tags
      const address = f.properties.address || (f.properties.tags && (f.properties.tags['addr:full'] || ((f.properties.tags['addr:housenumber'] || '') + ' ' + (f.properties.tags['addr:street'] || '')).trim())) || '';

      const popupHtml = `<strong>${escapeHtml(name)}</strong>${address ? '<br/>' + escapeHtml(address) : ''}`;
      const marker = L.marker(latlng).addTo(storeLayer).bindPopup(popupHtml);

      // list item with name + address
      const li = document.createElement('li');
      li.innerHTML = `<div class="store-name">${escapeHtml(name)}</div>${address ? `<div class="store-address" style="font-size:0.9em;color:#555;">${escapeHtml(address)}</div>` : ''}`;
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