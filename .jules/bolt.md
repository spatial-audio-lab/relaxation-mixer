## 2024-05-22 - [Reactive UI Bottleneck]
**Learning:** The `markStateChanged` function triggers `requestAnimationFrame(syncAllUI)` on every call. Input events like slider dragging call this repeatedly, potentially flooding the rAF queue or causing redundant work if not coalesced by the browser/engine properly.
**Action:** Future optimizations should debounce or throttle `markStateChanged` or use a dirty flag to ensure `syncAllUI` is scheduled only once per frame.
