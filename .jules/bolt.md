## 2026-02-04 - Animation Loop State Management
**Learning:** Avoid managing state-dependent UI classes (like `.playing`) inside `requestAnimationFrame` loops. It causes redundant DOM operations and can lead to bugs where state changes (like pausing) don't trigger cleanup if the loop exits early.
**Action:** Move class toggling to state change handlers (`play`, `pause`, `stop`) and use the loop only for continuous values (progress, time).
