const TripSync = (function () {
  const STORAGE_KEY = "jeju-trip-v1";
  const POLL_MS = 3000;
  const MAX_POLL_ERRORS = 3;

  let ready = false;
  let polling = false;
  let pollTimer = null;
  let saveTimer = null;
  let pendingSave = false;
  let queuedState = null;
  let lastRemoteAt = 0;
  let lastLocalAt = 0;
  let pollErrorCount = 0;
  const listeners = new Set();

  function isConfigured() {
    return (
      typeof SUPABASE_CONFIG !== "undefined" &&
      SUPABASE_CONFIG.url &&
      SUPABASE_CONFIG.anonKey &&
      !String(SUPABASE_CONFIG.url).includes("YOUR_")
    );
  }

  function headers({ json = false } = {}) {
    const key = SUPABASE_CONFIG.anonKey;
    const h = { apikey: key };
    if (!String(key).startsWith("sb_publishable_")) {
      h.Authorization = `Bearer ${key}`;
    }
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  function notify(status, detail) {
    listeners.forEach((fn) => {
      try {
        fn(status, detail);
      } catch (_) {
        /* ignore */
      }
    });
  }

  function markReady(status) {
    if (ready) return;
    ready = true;
    notify(status);
  }

  function stateTimestamp(state) {
    return Number(state?.updatedAt || 0);
  }

  function wrapState(state) {
    return {
      days: state.days,
      kakaoPlaces: state.kakaoPlaces,
      naverPlaces: state.naverPlaces,
      updatedAt: Date.now(),
    };
  }

  function saveLocal(state) {
    const wrapped = wrapState(state);
    lastLocalAt = wrapped.updatedAt;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(wrapped));
    } catch (err) {
      console.warn("localStorage save failed:", err);
    }
    return wrapped;
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  async function readError(res) {
    try {
      const data = await res.json();
      return data.message || data.error || data.hint || `HTTP ${res.status}`;
    } catch (_) {
      return `HTTP ${res.status}`;
    }
  }

  function applyState(data, fromRemote) {
    const payload = {
      days: data.days,
      kakaoPlaces: data.kakaoPlaces,
      naverPlaces: data.naverPlaces,
    };
    const applied = TripStorage.applyRemote(payload);
    if (!applied) {
      notify("error", "데이터 형식이 올바르지 않아요");
      return false;
    }
    if (typeof refreshAllPlaces === "function") refreshAllPlaces();
    if (fromRemote) notify("remote-updated");
    else notify("synced");
    return true;
  }

  async function pullFromCloud({ silent = false } = {}) {
    if (!isConfigured()) return false;
    try {
      const tripId = encodeURIComponent(SUPABASE_CONFIG.tripId || "jeju-2026");
      const res = await fetch(
        `${SUPABASE_CONFIG.url}/rest/v1/trip_data?trip_id=eq.${tripId}&select=payload,updated_at`,
        { headers: headers() }
      );
      if (!res.ok) throw new Error(await readError(res));

      const rows = await res.json();
      pollErrorCount = 0;

      if (!rows.length) return false;

      const remoteAt = new Date(rows[0].updated_at).getTime();
      if (remoteAt <= lastRemoteAt) return false;
      lastRemoteAt = remoteAt;

      const payload = rows[0].payload || {};
      payload.updatedAt = remoteAt;
      if (remoteAt > lastLocalAt) {
        applyState(payload, true);
        saveLocal(payload);
      }
      if (!silent) notify("synced");
      return true;
    } catch (err) {
      pollErrorCount += 1;
      console.error("Cloud pull error:", err);
      if (!silent || pollErrorCount >= MAX_POLL_ERRORS) {
        notify("error", err.message || "연결을 확인해주세요");
      }
      return false;
    }
  }

  async function pushToCloud(state, immediate) {
    if (!isConfigured()) return false;

    if (!immediate) {
      queuedState = state;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const next = queuedState;
        queuedState = null;
        if (next) pushToCloud(next, true);
      }, 400);
      return true;
    }

    pendingSave = true;
    notify("saving");

    try {
      const wrapped = wrapState(state);
      const tripId = SUPABASE_CONFIG.tripId || "jeju-2026";
      const payload = {
        days: wrapped.days,
        kakaoPlaces: wrapped.kakaoPlaces,
        naverPlaces: wrapped.naverPlaces,
      };
      const body = {
        payload,
        updated_at: new Date().toISOString(),
      };

      let res = await fetch(
        `${SUPABASE_CONFIG.url}/rest/v1/trip_data?trip_id=eq.${encodeURIComponent(tripId)}`,
        {
          method: "PATCH",
          headers: { ...headers({ json: true }), Prefer: "return=minimal" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok && res.status !== 406) {
        throw new Error(await readError(res));
      }

      if (res.status === 406 || res.status === 404) {
        res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/trip_data`, {
          method: "POST",
          headers: { ...headers({ json: true }), Prefer: "return=minimal" },
          body: JSON.stringify({ trip_id: tripId, ...body }),
        });
        if (!res.ok) throw new Error(await readError(res));
      }

      pollErrorCount = 0;
      lastRemoteAt = wrapped.updatedAt;
      notify("saved");
      return true;
    } catch (err) {
      console.error("Cloud save error:", err);
      notify("error", err.message || "저장 실패");
      return false;
    } finally {
      setTimeout(() => {
        pendingSave = false;
        notify("synced");
      }, 150);
    }
  }

  function startPolling() {
    if (!isConfigured() || polling) return;
    polling = true;
    pollTimer = setInterval(() => {
      if (document.visibilityState !== "visible" || pendingSave) return;
      pullFromCloud({ silent: true });
    }, POLL_MS);
  }

  function stopPolling() {
    polling = false;
    clearInterval(pollTimer);
  }

  function bootstrap() {
    const local = loadLocal();
    if (local && TripStorage.applyRemote(local)) {
      lastLocalAt = stateTimestamp(local);
      if (typeof refreshAllPlaces === "function") refreshAllPlaces();
    }
  }

  async function init() {
    bootstrap();

    if (!isConfigured()) {
      markReady("local");
      return "local";
    }

    notify("connecting");
    const pulled = await pullFromCloud({ silent: true });
    if (!pulled) {
      await pushToCloud(TripStorage.getState(), true);
    }
    startPolling();
    markReady(pollErrorCount ? "error" : "synced");
    return pollErrorCount ? "error" : "synced";
  }

  function push(state, immediate) {
    saveLocal(state);
    notify("local-saved");

    if (!isConfigured()) {
      notify("local");
      return Promise.resolve(false);
    }

    return pushToCloud(state, immediate);
  }

  async function forcePull() {
    if (isConfigured()) return pullFromCloud({ silent: false });
    const local = loadLocal();
    if (local) {
      applyState(local, true);
      return true;
    }
    return false;
  }

  function exportJson() {
    const state = TripStorage.getState();
    return JSON.stringify(wrapState(state), null, 2);
  }

  function importJson(text) {
    const parsed = JSON.parse(text);
    if (!parsed?.days) throw new Error("일정 데이터가 없어요");
    const wrapped = wrapState(parsed);
    applyState(wrapped, false);
    saveLocal(wrapped);
    pushToCloud(wrapped, true);
    return true;
  }

  async function copyShare() {
    const text = exportJson();
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return "clipboard";
    }
    return text;
  }

  function onUpdate(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function whenReady() {
    if (ready) return Promise.resolve("ready");
    return new Promise((resolve) => {
      const handler = (status) => {
        if (ready) {
          listeners.delete(handler);
          resolve(status);
        }
      };
      listeners.add(handler);
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isConfigured()) {
      pullFromCloud({ silent: true });
    }
  });

  return {
    init,
    push,
    forcePull,
    exportJson,
    importJson,
    copyShare,
    onUpdate,
    whenReady,
    isConfigured,
    isEnabled: () => isConfigured(),
    stopPolling,
  };
})();
