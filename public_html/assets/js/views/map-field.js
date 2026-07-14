/**
 * <map-field> — a reusable OpenStreetMap (Leaflet) location field, loaded from
 * CDN with no build step. Editable mode lets the user click / drag to mark a
 * point (emits {lat, lng}); read-only mode just shows a marker. Falls back to
 * manual latitude/longitude inputs if the map library can't load.
 *
 *   <map-field v-model="coords" :editable="true"></map-field>
 *   coords = { lat: Number|null, lng: Number|null }
 */
(function () {
    'use strict';
    const { ref, reactive, watch, onMounted, onBeforeUnmount, nextTick } = Vue;

    // Lazy CDN loader for Leaflet (shared across every map-field instance).
    const leaflet = {
        state: 'idle', // idle | loading | ready | failed
        waiters: [],
        ensure() {
            return new Promise((resolve) => {
                if (this.state === 'ready') return resolve(true);
                if (this.state === 'failed') return resolve(false);
                this.waiters.push(resolve);
                if (this.state === 'loading') return;
                this.state = 'loading';
                const css = document.createElement('link');
                css.rel = 'stylesheet';
                css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                document.head.appendChild(css);
                const s = document.createElement('script');
                s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
                s.async = true;
                s.onload = () => { this.state = 'ready'; this.flush(true); };
                s.onerror = () => { this.state = 'failed'; this.flush(false); };
                document.head.appendChild(s);
            });
        },
        flush(ok) { const w = this.waiters; this.waiters = []; w.forEach(fn => fn(ok)); },
    };

    const DEFAULT_CENTER = [20.5937, 78.9629]; // India-ish default; only used when nothing is marked

    const MapField = {
        props: {
            modelValue: { type: Object, default: () => ({ lat: null, lng: null }) },
            editable: { type: Boolean, default: false },
            height: { type: String, default: '18rem' },
        },
        emits: ['update:modelValue'],
        setup(props, { emit }) {
            const el = ref(null);
            const failed = ref(false);
            const manual = reactive({ lat: props.modelValue && props.modelValue.lat, lng: props.modelValue && props.modelValue.lng });
            let map = null, marker = null;

            function coords() {
                const v = props.modelValue || {};
                const lat = (v.lat === '' || v.lat == null) ? null : Number(v.lat);
                const lng = (v.lng === '' || v.lng == null) ? null : Number(v.lng);
                return (isFinite(lat) && isFinite(lng) && lat !== null && lng !== null) ? [lat, lng] : null;
            }

            function setMarker(latlng) {
                if (!map) return;
                if (!marker) {
                    marker = L.marker(latlng, { draggable: props.editable }).addTo(map);
                    if (props.editable) marker.on('dragend', () => { const p = marker.getLatLng(); emitCoords(p.lat, p.lng); });
                } else {
                    marker.setLatLng(latlng);
                }
            }
            function emitCoords(lat, lng) {
                const r = (n) => Math.round(n * 1e7) / 1e7;
                emit('update:modelValue', { lat: r(lat), lng: r(lng) });
            }

            async function init() {
                const ok = await leaflet.ensure();
                if (!ok) { failed.value = true; return; }
                await nextTick();
                if (!el.value || map) return;
                const c = coords();
                map = L.map(el.value).setView(c || DEFAULT_CENTER, c ? 15 : 4);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '&copy; OpenStreetMap contributors',
                }).addTo(map);
                if (c) setMarker(c);
                if (props.editable) {
                    map.on('click', (e) => { setMarker(e.latlng); emitCoords(e.latlng.lat, e.latlng.lng); });
                }
                // Leaflet needs a size recalculation when shown inside a modal/tab.
                setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 200);
            }

            // Keep the marker/view in sync when the bound value changes externally.
            watch(() => props.modelValue, (v) => {
                manual.lat = v && v.lat; manual.lng = v && v.lng;
                const c = coords();
                if (map && c) { setMarker(c); map.setView(c, Math.max(map.getZoom(), 13)); }
            }, { deep: true });

            function applyManual() {
                const lat = Number(manual.lat), lng = Number(manual.lng);
                if (isFinite(lat) && isFinite(lng)) emitCoords(lat, lng);
            }

            onMounted(init);
            onBeforeUnmount(() => { if (map) { try { map.remove(); } catch (e) {} map = null; } });

            return { el, failed, manual, applyManual };
        },
        template: `
        <div>
            <div v-show="!failed" ref="el" :style="{ height: height, width: '100%' }" class="rounded-lg border border-slate-200 overflow-hidden"></div>
            <p v-if="!failed && editable" class="text-xs text-slate-400 mt-1">Click on the map to drop a pin, or drag the marker to adjust.</p>
            <div v-if="failed" class="rounded-lg border border-slate-200 p-3">
                <p class="text-xs text-slate-500 mb-2">Map unavailable — enter coordinates manually.</p>
                <div class="flex gap-2">
                    <input v-model.number="manual.lat" :readonly="!editable" type="number" step="any" placeholder="Latitude" class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    <input v-model.number="manual.lng" :readonly="!editable" type="number" step="any" placeholder="Longitude" class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    <button v-if="editable" type="button" @click="applyManual" class="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-brand hover:bg-brand/5 whitespace-nowrap">Set</button>
                </div>
            </div>
        </div>`,
    };

    CSApp.component('MapField', MapField);
})();
