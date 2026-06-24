## 2024-05-22 - Animation Loop Optimization
**Learning:** Vanilla JS `requestAnimationFrame` loops can easily become bottlenecks if they perform DOM queries (`getElementById`) or layout thrashing (unnecessary class toggling) every frame.
**Action:** Always cache DOM references outside the loop. Use "dirty checks" for text updates (e.g., `lastTimeString`) to avoid touching the DOM when the visible content hasn't changed.
