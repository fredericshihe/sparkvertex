/**
 * Centralized logic for injecting mobile adaptation styles and meta tags into HTML content.
 * This ensures consistent behavior across Upload Preview, Detail Modal, and Standalone PWA views.
 */
export const getPreviewContent = (content: string | null) => {
  if (!content) return '';
  
  // Inject viewport for mobile adaptation and disable selection/callout
  // viewport-fit=cover is important for notches
  const viewportMeta = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">';
  
  const injectedStyle = `<style>
    * { -webkit-tap-highlight-color: transparent; }
    body { margin: 0; padding: 0; overflow-x: hidden; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; width: 100vw; height: 100vh; }
    ::-webkit-scrollbar { width: 0px; background: transparent; }
    body { -ms-overflow-style: none; scrollbar-width: none; }
    /* Ensure full height */
    html, body { height: 100%; width: 100%; }
  </style>`;
  
  let newContent = content;
  if (newContent.includes('<head>')) {
      newContent = newContent.replace('<head>', `<head>${viewportMeta}${injectedStyle}`);
  } else if (newContent.includes('<html>')) {
      newContent = newContent.replace('<html>', `<html><head>${viewportMeta}${injectedStyle}</head>`);
  } else {
      newContent = `<head>${viewportMeta}${injectedStyle}</head>${newContent}`;
  }
  return newContent;
};
