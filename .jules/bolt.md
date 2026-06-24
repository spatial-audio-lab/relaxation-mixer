## 2024-05-22 - Missing Asset Preloading
**Learning:** The application architecture relies on fetching heavy audio assets (WebM/MP3) only upon user interaction (lazy loading), which introduces a noticeable delay between the "Start" action and the actual audio playback. Memory suggested preloading was present, but it was not.
**Action:** Implementing a `preloadCache` pattern for critical "above the fold" audio assets (like the default session) improves perceived performance significantly. Future implementations should consider preloading the next likely asset during idle time.
