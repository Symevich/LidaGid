/* ============================================================
   map.js — reusable Leaflet map for LidaGid (multilang)
   Configure via attributes on <div id="map">:
     data-sources="sights enterprises people"  (space-separated)
     data-root="."   (for index.html) or ".." (for html/ pages)
   ============================================================ */

(function () {
  const mapEl = document.getElementById("map");
  if (!mapEl) return;

  const sources  = (mapEl.dataset.sources || "sights enterprises people")
    .trim()
    .split(/\s+/);
  const dataRoot = mapEl.dataset.root || "..";

  const COLORS = {
    sights:      "#f5a623",
    enterprises: "#4a90d9",
    people:      "#5cb85c",
  };

  function makeIcon(color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z"
            fill="${color}" stroke="#fff" stroke-width="2"/>
      <circle cx="14" cy="14" r="5" fill="#fff"/>
    </svg>`;
    return L.divIcon({
      html: svg,
      className: "",
      iconSize: [28, 36],
      iconAnchor: [14, 36],
      popupAnchor: [0, -38],
    });
  }

  const map = L.map("map", { zoomControl: true }).setView([53.8918, 25.3021], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  Promise.all(
    sources.map((source) => {
      // Use language-aware filename via I18N if available
      const file = (typeof I18N !== 'undefined')
        ? I18N.dataFile(source)
        : `${source}.json`;
      return fetch(`${dataRoot}/data/${file}`)
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then((items) => ({ source, items }))
        .catch(() => ({ source, items: [] }));
    })
  ).then((results) => {
    const lang = (typeof I18N !== 'undefined') ? I18N.get() : 'be';

    results.forEach(({ source, items }) => {
      const icon = makeIcon(COLORS[source] || "#999");

      items.forEach((item) => {
        if (!item.lat || !item.lng) return;

        const imageSrc  = (item.image || "").replace(/^\.\.\//, dataRoot + "/");
        const langParam = lang !== 'be' ? `&lang=${lang}` : '';
        const objectHref = `${dataRoot}/html/object.html?source=${source}&id=${encodeURIComponent(item.id)}${langParam}`;

        const popupHtml = `
          <div class="map-popup">
            ${imageSrc ? `<img src="${imageSrc}" alt="${item.title}" class="map-popup__img">` : ""}
            <a href="${objectHref}" class="map-popup__title">${item.title}</a>
          </div>`;

        L.marker([item.lat, item.lng], { icon })
          .addTo(map)
          .bindPopup(popupHtml, { maxWidth: 220, className: "map-popup-wrap" });
      });
    });
  });
})();
