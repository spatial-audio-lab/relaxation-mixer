## 2024-05-22 - Animation Loop DOM Thrashing
**Learning:** Vanilla JS animation loops (`requestAnimationFrame`) can silently accumulate performance debt through redundant `textContent` updates and `classList` modifications, even if the value hasn't changed.
**Action:** Always cache DOM references for loop-critical elements and implement "dirty checks" (e.g., `lastTimeString`) to skip DOM touches when data hasn't changed.
