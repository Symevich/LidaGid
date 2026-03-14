/* ============================================================
   map.js — reusable Leaflet map for LidaGid
   Reads data-sources attribute on #map element:
     data-sources="sights"                 → only sights
     data-sources="sights enterprises"     → multiple
     data-sources="sights enterprises people" → all
   Image paths in JSON use "../assets/..." (from html/ folder).
   On index.html we need "." prefix instead — handled via data-root.
   ============================================================ */

(function () {
  const mapEl = document.getElementById("map");
  if (!mapEl) return;

  const sourcesAttr = mapEl.dataset.sources || "sights enterprises people";
  const sources = sourcesAttr.trim().split(/\s+/);
  const dataRoot = mapEl.dataset.root || ".."; // index uses ".", sections use ".."

  // ── Colour per category ──
  const COLORS = {
    sights: "#e84040", // yellow/amber
    enterprises: "#f5a623", // blue
    people: "#4a90d9", // green
  };

  // ── Build Leaflet circle marker icon ──
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

  // ── Init map ──
  const map = L.map("map", { zoomControl: true }).setView(
    [53.891750, 25.302094],
    12,
  );

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  // ── Fetch and render each source ──
  const fetches = sources.map((source) =>
    fetch(`${dataRoot}/data/${source}.json`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((items) => ({ source, items }))
      .catch(() => ({ source, items: [] })),
  );

  Promise.all(fetches).then((results) => {
    results.forEach(({ source, items }) => {
      const color = COLORS[source] || "#999";
      const icon = makeIcon(color);

      items.forEach((item) => {
        if (!item.lat || !item.lng) return;

        // Fix image path: JSON stores "../assets/..." relative to html/
        // On index page root is "." so we need "./assets/..."
        const rawImage = item.image || "";
        const imageSrc = rawImage.replace(/^\.\.\//, dataRoot + "/");

        // Object page link
        const sectionPage = `${dataRoot}/html/${source === "sights" ? "sights" : source === "enterprises" ? "enterprises" : "people"}.html`;
        const objectHref = `${dataRoot}/html/object.html?source=${source}&id=${encodeURIComponent(item.id)}`;

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
