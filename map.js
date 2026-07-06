(function () {
  let map = null;
  let routeLayer = null;
  let routeMarkers = [];
  let categoryMarkers = [];
  let activeCategories = new Set(Object.keys(CATEGORY_GROUPS));
  let showRoute = true;
  let showAllPlaces = true;

  function initMap() {
    if (map) return;
    const el = document.getElementById("trip-map");
    if (!el) return;

    map = L.map("trip-map", { zoomControl: true }).setView([33.38, 126.55], 10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    routeLayer = L.layerGroup().addTo(map);
    renderCategoryFilters();
    updateMap(window.activeDay || DAYS[0].id);
  }

  function renderCategoryFilters() {
    const el = document.getElementById("category-filters");
    if (!el) return;

    const chips = Object.entries(CATEGORY_GROUPS)
      .map(
        ([id, g]) => `
        <label class="cat-chip active" data-cat="${id}" style="--chip-color:${g.color}">
          <input type="checkbox" checked data-cat="${id}" />
          <span class="cat-dot"></span>${g.label}
        </label>`
      )
      .join("");

    el.innerHTML = `
      <div class="map-toggles">
        <label class="map-toggle"><input type="checkbox" id="toggle-route" checked /> 날짜별 동선</label>
        <label class="map-toggle"><input type="checkbox" id="toggle-places" checked /> 카테고리 장소</label>
      </div>
      <div class="cat-chips">${chips}</div>
    `;

    el.querySelectorAll(".cat-chip input").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.dataset.cat;
        const label = input.closest(".cat-chip");
        if (input.checked) {
          activeCategories.add(id);
          label.classList.add("active");
        } else {
          activeCategories.delete(id);
          label.classList.remove("active");
        }
        updateCategoryMarkers();
      });
    });

    document.getElementById("toggle-route").addEventListener("change", (e) => {
      showRoute = e.target.checked;
      updateRoute(window.activeDay || DAYS[0].id);
    });

    document.getElementById("toggle-places").addEventListener("change", (e) => {
      showAllPlaces = e.target.checked;
      updateCategoryMarkers();
    });
  }

  function makeIcon(color, label, isRoute) {
    const size = isRoute ? 28 : 22;
    const html = isRoute
      ? `<div class="route-pin" style="background:${color}">${label}</div>`
      : `<div class="cat-pin" style="background:${color}"></div>`;
    return L.divIcon({
      html,
      className: "custom-pin",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  function popupHtml(place, extra) {
    const cat = CATEGORY_GROUPS[place.category];
    return `
      <div class="map-popup">
        <strong>${place.name}</strong>
        <span class="popup-cat" style="background:${cat?.color || "#999"}">${cat?.label || place.type}</span>
        ${place.time ? `<div class="popup-time">${place.time}</div>` : ""}
        ${place.dayLabel ? `<div class="popup-day">${place.dayLabel}</div>` : ""}
        ${place.address ? `<div class="popup-addr">${place.address}</div>` : ""}
        ${extra || ""}
        ${place.mapUrl ? `<a href="${place.mapUrl}" target="_blank" rel="noopener">지도에서 열기</a>` : ""}
      </div>`;
  }

  function updateRoute(dayId) {
    routeLayer.clearLayers();
    routeMarkers.forEach((m) => map.removeLayer(m));
    routeMarkers = [];

    if (!showRoute) return;

    const dayIndex = DAYS.findIndex((d) => d.id === dayId);
    const day = DAYS[dayIndex];
    if (!day) return;

    const color = DAY_ROUTE_COLORS[dayIndex] || DAY_ROUTE_COLORS[0];
    const points = [];

    day.stops.forEach((stop, i) => {
      const coords = getCoords(stop.name);
      if (!coords) return;
      const [lat, lng] = coords;
      points.push([lat, lng]);

      const marker = L.marker([lat, lng], {
        icon: makeIcon(color, i + 1, true),
        zIndexOffset: 1000,
      })
        .bindPopup(
          popupHtml(
            {
              name: stop.name,
              type: stop.type,
              time: stop.time,
              address: stop.address,
              dayLabel: day.date,
              category: getCategoryId(stop.type),
              mapUrl: stop.mapUrl,
            },
            stop.note ? `<div class="popup-note">${stop.note}</div>` : ""
          )
        )
        .addTo(map);

      routeMarkers.push(marker);
    });

    if (points.length > 1) {
      L.polyline(points, {
        color,
        weight: 4,
        opacity: 0.85,
        dashArray: "8 6",
      }).addTo(routeLayer);
    }

    if (points.length) {
      const bounds = L.latLngBounds(points);
      if (showAllPlaces && categoryMarkers.length) {
        categoryMarkers.forEach((m) => bounds.extend(m.getLatLng()));
      }
      map.fitBounds(bounds.pad(0.12));
    }
  }

  function updateCategoryMarkers() {
    categoryMarkers.forEach((m) => map.removeLayer(m));
    categoryMarkers = [];

    if (!showAllPlaces) return;

    const day = DAYS.find((d) => d.id === (window.activeDay || DAYS[0].id));

    ALL_PLACES.forEach((place) => {
      if (!activeCategories.has(place.category)) return;

      const isOnRoute =
        place.dayId === day?.id &&
        day.stops.some((s) => s.name === place.name);

      const cat = CATEGORY_GROUPS[place.category];
      const marker = L.marker([place.lat, place.lng], {
        icon: makeIcon(cat.color, "", false),
        opacity: isOnRoute ? 0.35 : 1,
        zIndexOffset: isOnRoute ? 0 : 500,
      })
        .bindPopup(
          popupHtml(
            place,
            place.inRoute
              ? ""
              : '<div class="popup-note">코스 미배정 · 여유 시 방문</div>'
          )
        )
        .addTo(map);

      categoryMarkers.push(marker);
    });
  }

  function updateMap(dayId) {
    if (!map) return;
    updateRoute(dayId);
    updateCategoryMarkers();
  }

  window.TripMap = { initMap, updateMap };
})();
