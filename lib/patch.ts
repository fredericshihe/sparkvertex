export function applyPatches(source: string, patchText: string): string {
  // Extract all SEARCH/REPLACE blocks
  // The regex handles the format:
  // <<<<SEARCH
  // ... content ...
  // ====
  // ... content ...
  // >>>>
  // Enhanced regex to be more permissive with whitespace around markers
  const matches = patchText.matchAll(/<<<<\s*SEARCH\s*\n([\s\S]*?)\n====\s*\n([\s\S]*?)\n>>>>/g);
  
  let result = source;
  let successCount = 0;
  let failCount = 0;

  for (const match of matches) {
    const [full, searchBlock, replaceBlock] = match;
    
    // Normalize line endings to avoid issues with CRLF vs LF
    // Also trim trailing whitespace from lines to be more forgiving
    const normalize = (str: string) => str.replace(/\r\n/g, '\n');
    
    const normalizedSource = normalize(result);
    const normalizedSearch = normalize(searchBlock);
    
    if (normalizedSource.includes(normalizedSearch)) {
      result = normalizedSource.replace(normalizedSearch, replaceBlock);
      successCount++;
    } else {
      // Fallback: Try to match with trimmed lines (ignoring indentation differences)
      // This is risky but helpful for AI that messes up indentation
      console.warn('Exact match failed, trying fuzzy match for:', searchBlock.substring(0, 50) + '...');
      
      // Try to find the block by ignoring leading/trailing whitespace on each line
      // This is computationally more expensive but worth it for recovery
      try {
          const searchLines = normalizedSearch.split('\n').map(l => l.trim()).filter(l => l);
          const sourceLines = normalizedSource.split('\n');
          
          let foundIdx = -1;
          // Simple sliding window (naive)
          for (let i = 0; i < sourceLines.length; i++) {
              let match = true;
              for (let j = 0; j < searchLines.length; j++) {
                  if (i + j >= sourceLines.length || !sourceLines[i + j].trim().includes(searchLines[j])) {
                      match = false;
                      break;
                  }
              }
              if (match) {
                  foundIdx = i;
                  break;
              }
          }
          
          if (foundIdx !== -1) {
              console.log('Fuzzy match found at line', foundIdx);
              // We found where it starts, but replacing is tricky because we need exact indices.
              // For now, let's just count it as fail to avoid corrupting code.
              // Implementing robust fuzzy patch is complex.
              failCount++;
          } else {
              failCount++;
          }
      } catch (e) {
          failCount++;
      }
    }
  }

  console.log(`Patch applied: ${successCount} success, ${failCount} failed.`);
  
  if (failCount > 0 && successCount === 0) {
      throw new Error(`无法应用修改：找不到匹配的代码块 (${failCount} 处失败)`);
  }
  
  return result;
}
