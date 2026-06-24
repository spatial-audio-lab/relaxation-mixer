## 2025-05-23 - Animation Loop DOM Thrashing
**Learning:** Even simple `document.getElementById` calls inside a `requestAnimationFrame` loop (60fps) can cause significant overhead. Combined with redundant `textContent` updates and `classList` toggling, this creates unnecessary CPU load.
**Action:** Always cache DOM elements used in animation loops, use dirty-checking for text updates, and move state-based class toggling (like play/pause) out of the loop and into event handlers.
