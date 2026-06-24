## 2024-05-22 - [Audio Preloading Architecture]
**Learning:** Decoupling audio fetching (ArrayBuffer) from decoding (AudioContext) is critical for SPA performance. It allows heavy network requests to occur during idle time (before user activation), resolving the 'click-to-play' latency bottleneck.
**Action:** Always check if 'lazy loading' is too lazy. Preload raw buffers for immediate assets (like startup sounds) while waiting for user gesture to unlock AudioContext.
