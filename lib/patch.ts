export function applyPatches(source: string, patchText: string): string {
  // Extract all SEARCH/REPLACE blocks
  // The regex handles the format:
  // <<<<SEARCH
  // ... content ...
  // ====
  // ... content ...
  // >>>>
  // Enhanced regex to be more permissive with whitespace around markers
  // Matches <<<<SEARCH followed by anything, then ====, then anything, then >>>>
  // \s* handles newlines and spaces flexibly
  const matches = Array.from(patchText.matchAll(/<<<<\s*SEARCH\s*([\s\S]*?)\s*====\s*([\s\S]*?)\s*>>>>/g));
  
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
              
              // Construct the new source
              // We need to be careful about preserving the original source's structure outside the match
              // Since we are working with normalizedSource (LF only), we should stick to that for consistency
              
              const before = sourceLines.slice(0, foundIdx).join('\n');
              const after = sourceLines.slice(foundIdx + searchLines.length).join('\n');
              
              // We replace the matched lines with the replaceBlock
              // Note: This assumes the match length in source is exactly searchLines.length
              // which is true for the current sliding window logic
              result = (before ? before + '\n' : '') + normalize(replaceBlock) + (after ? '\n' + after : '');
              successCount++;
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
