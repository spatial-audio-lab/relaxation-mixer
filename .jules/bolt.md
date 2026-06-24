## 2024-05-23 - Audio Preloading Pattern
**Learning:** Preloading large audio assets (via `fetch` -> `ArrayBuffer`) before the `AudioContext` is initialized/resumed can significantly reduce the perceived latency for the first interaction (e.g., clicking "Start").
**Action:** Identify critical audio assets (intro, default session) and initiate their fetch immediately on page load, storing the Promise in a cache to be consumed by the audio loader.
