# Mobile Optimization Summary

## Homepage Optimization
The homepage loading speed on mobile devices has been optimized by targeting the WebGL background component (`Galaxy`).

### Changes in `components/Galaxy.tsx`
1.  **Reduced Shader Complexity**:
    - Introduced dynamic shader generation.
    - On mobile devices (`isMobile=true`), the shader now uses **2 layers** of star generation instead of 4. This significantly reduces the GPU load per pixel.
    
2.  **Resolution Optimization**:
    - On mobile devices, the Device Pixel Ratio (DPR) is capped at **1.5**. This prevents rendering at extremely high resolutions (like 3x on newer iPhones) which is unnecessary for a background effect and drains battery/performance.

3.  **Interaction Optimization**:
    - Mouse/Touch interaction listeners are **disabled** on mobile devices to reduce main thread work during scrolling.

### Changes in `app/HomeClient.tsx`
1.  **Mobile Detection**:
    - Added a `checkMobile` function to detect if the window width is less than 768px.
    - Passes the `isMobile` prop to the `Galaxy` component.

2.  **Loading Strategy**:
    - The `Galaxy` component continues to be lazy-loaded via `requestIdleCallback` (or `setTimeout` fallback) to ensure the main content (LCP) renders first.

## Previous Optimizations
- **Project Cards**: Implemented lazy loading for iframes and unloading of off-screen iframes to improve scrolling performance.
- **Cover Images**: Switched from static generation to live previews to avoid rendering issues.

## Recommendations
- Monitor the performance impact of `TiltedCard` on lower-end mobile devices. If scrolling is still jittery, consider disabling the tilt effect on mobile.
