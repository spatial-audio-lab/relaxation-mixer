## 2026-01-24 - DOM Caching in Animation Loops
**Learning:** Frequent DOM queries (`document.getElementById`, `querySelectorAll`) in `requestAnimationFrame` loops or high-frequency event handlers (like `input` on sliders) create unnecessary overhead.
**Action:** Implement `state.uiCache` to store references to static DOM elements during initialization, and use these cached references in sync/update functions.
