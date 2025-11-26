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
    * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
    html { width: 100%; height: 100%; overflow: hidden; }
    body { 
      margin: 0; 
      padding: 0; 
      width: 100%; 
      height: 100%; 
      overflow-x: hidden; 
      overflow-y: auto;
      user-select: none; 
      -webkit-user-select: none; 
      -webkit-touch-callout: none; 
      background-color: #ffffff;
      /* Safe area handling */
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
      padding-left: env(safe-area-inset-left);
      padding-right: env(safe-area-inset-right);
    }
    ::-webkit-scrollbar { width: 0px; background: transparent; }
    body { -ms-overflow-style: none; scrollbar-width: none; }
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
