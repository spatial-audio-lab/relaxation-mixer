## 2024-05-22 - Memory vs Reality Drift
**Learning:** The memory/documentation stated that animation loops were already optimized (avoiding DOM queries, etc.), but the actual code revealed they were not. This suggests a regression or that the documentation described a planned/ideal state rather than the current state.
**Action:** Always verify "known" optimizations in the actual code before assuming they exist. Trust the code over the memory when they conflict.
