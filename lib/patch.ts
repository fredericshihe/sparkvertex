/**
 * Applies a set of patches to a source string.
 * Uses a robust Token-based "Anchor + LCS" algorithm to locate code blocks.
 * This approximates AST matching by ignoring whitespace and formatting,
 * and uses Longest Common Subsequence (LCS) logic to handle fuzzy matches.
 */

interface Token {
    text: string;
    start: number;
    end: number;
}

function tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    // Match words (identifiers, keywords) or non-whitespace symbols
    // This regex splits the code into meaningful atomic units
    const regex = /([a-zA-Z0-9_$]+)|([^\s\w])/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        tokens.push({
            text: match[0],
            start: match.index,
            end: regex.lastIndex
        });
    }
    return tokens;
}

export function applyPatches(source: string, patchText: string): string {
    // 1. Parse Patches
    const matches = Array.from(patchText.matchAll(/<<<<\s*SEARCH\s*([\s\S]*?)\s*====\s*([\s\S]*?)\s*>>>>/g));
    
    if (matches.length === 0) {
        // Fallback 1: Loose matches (no spaces or different spacing)
        let looseMatches = Array.from(patchText.matchAll(/<<<<SEARCH([\s\S]*?)====([\s\S]*?)>>>>/g));
        
        // Fallback 2: Handle "==== REPLACE" variation
        if (looseMatches.length === 0) {
             looseMatches = Array.from(patchText.matchAll(/<<<<\s*SEARCH\s*([\s\S]*?)\s*====\s*REPLACE\s*([\s\S]*?)\s*>>>>/g));
        }

        // Fallback 3: Handle missing closing >>>> (truncated response)
        if (looseMatches.length === 0) {
             looseMatches = Array.from(patchText.matchAll(/<<<<\s*SEARCH\s*([\s\S]*?)\s*====\s*([\s\S]*?)$/g));
        }

        if (looseMatches.length > 0) {
             const result = applyPatchesInternal(source, looseMatches);
             return validatePatchedCode(source, result);
        }
        return source;
    }

    const result = applyPatchesInternal(source, matches);
    return validatePatchedCode(source, result);
}

/**
 * Post-validation: Ensure the patched code is structurally valid.
 * If validation fails, return the original source to prevent corruption.
 */
function validatePatchedCode(originalSource: string, patchedCode: string): string {
    // Check 1: Basic HTML structure
    const hasDoctype = patchedCode.includes('<!DOCTYPE') || patchedCode.includes('<!doctype');
    const hasHtmlTag = /<html[\s>]/i.test(patchedCode);
    const hasClosingHtml = /<\/html>/i.test(patchedCode);
    
    if (!hasDoctype && !hasHtmlTag) {
        // Might be a partial result or corrupted
        console.error('Validation failed: Missing basic HTML structure');
        return originalSource;
    }

    // Check 2: Script tag balance (critical for React)
    const scriptOpenCount = (patchedCode.match(/<script/gi) || []).length;
    const scriptCloseCount = (patchedCode.match(/<\/script>/gi) || []).length;
    
    if (scriptOpenCount !== scriptCloseCount) {
        console.error(`Validation failed: Unbalanced script tags (open: ${scriptOpenCount}, close: ${scriptCloseCount})`);
        return originalSource;
    }

    // Check 3: Brace balance in script content (rough check)
    const scriptMatch = patchedCode.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    if (scriptMatch) {
        for (const script of scriptMatch) {
            const content = script.replace(/<\/?script[^>]*>/gi, '');
            const openBraces = (content.match(/\{/g) || []).length;
            const closeBraces = (content.match(/\}/g) || []).length;
            
            // Allow small imbalance (comments, strings might have unmatched braces)
            if (Math.abs(openBraces - closeBraces) > 5) {
                console.error(`Validation failed: Severely unbalanced braces in script (open: ${openBraces}, close: ${closeBraces})`);
                return originalSource;
            }
        }
    }

    // Check 4: Code length sanity check
    // If patched code is less than 50% of original, something went very wrong
    if (patchedCode.length < originalSource.length * 0.5) {
        console.error(`Validation failed: Patched code is suspiciously short (${patchedCode.length} vs original ${originalSource.length})`);
        return originalSource;
    }

    // Check 5: Code length growth check
    // If patched code is more than 3x the original, AI might have duplicated content
    if (patchedCode.length > originalSource.length * 3) {
        console.error(`Validation failed: Patched code is suspiciously long (${patchedCode.length} vs original ${originalSource.length})`);
        return originalSource;
    }

    return patchedCode;
}

function applyPatchesInternal(source: string, matches: RegExpMatchArray[]): string {
    let currentSource = source;
    let successCount = 0;
    let failCount = 0;
    const failedBlocks: string[] = [];

    for (const match of matches) {
        const [_, searchBlock, replaceBlock] = match;
        
        // Filter noise from search block (like "/// SUMMARY:")
        let cleanSearchBlock = searchBlock.split('\n')
            .filter(l => !l.trim().startsWith('///') && !l.trim().match(/^summary:/i) && !l.trim().match(/^changes:/i))
            .join('\n');

        // CRITICAL: Detect and reject compressed placeholders
        // These patterns indicate the AI incorrectly used compression artifacts
        const compressionPatterns = [
            /\/\/\s*\[Component:.*?\]\s*-\s*Code omitted/i,
            /\/\/\s*\.\.\.\s*\d+\s*lines?\s*omitted/i,
            /\/\*\s*\.\.\.\s*code omitted/i,
            /\/\/\s*\.\.\.\s*existing code/i
        ];
        
        const hasCompressionArtifact = compressionPatterns.some(p => p.test(cleanSearchBlock));
        if (hasCompressionArtifact) {
            console.warn('Patch rejected: Contains compression artifacts that do not exist in source.');
            failedBlocks.push(cleanSearchBlock.substring(0, 80) + '...');
            failCount++;
            continue; // Skip this patch
        }

        const sourceTokens = tokenize(currentSource);
        const searchTokens = tokenize(cleanSearchBlock);
        
        if (searchTokens.length === 0) {
             console.warn("Empty search block tokens, skipping.");
             continue;
        }

        const matchRange = findBestTokenMatch(sourceTokens, searchTokens);

        if (matchRange) {
            const startChar = sourceTokens[matchRange.start].start;
            const endChar = sourceTokens[matchRange.end].end;
            
            const before = currentSource.substring(0, startChar);
            const after = currentSource.substring(endChar);
            
            currentSource = before + replaceBlock + after;
            successCount++;
            console.log(`Patch applied successfully using Token+LCS matching.`);
        } else {
            console.warn(`Patch failed for block: ${cleanSearchBlock.substring(0, 50)}...`);
            failedBlocks.push(cleanSearchBlock.substring(0, 80) + '...');
            failCount++;
        }
    }
    
    if (failCount > 0 && successCount === 0) {
        const hint = failedBlocks.length > 0 
            ? `\n失败的代码块: ${failedBlocks[0]}` 
            : '';
        throw new Error(`无法应用修改：找不到匹配的代码块 (${failCount} 处失败)${hint}`);
    }

    return currentSource;
}

function findBestTokenMatch(sourceTokens: Token[], searchTokens: Token[]): { start: number, end: number } | null {
    const M = searchTokens.length;
    const N = sourceTokens.length;
    if (M === 0 || N < M) return null;

    let bestScore = 0;
    let bestRange = null;

    // Optimization: Anchor-based search
    // We identify candidate regions in the source where the search block might exist.
    const candidates = new Set<number>();
    
    // Helper to add candidates for a specific token index in search block
    const addCandidates = (tokenIdxInSearch: number, strict = true) => {
        const tokenText = searchTokens[tokenIdxInSearch].text;
        
        // Strict mode: Skip common tokens and symbols
        if (strict) {
            const isCommonSymbol = /^[{}(),;=.\[\]<>+\-*\/]$/.test(tokenText);
            const isCommonKeyword = /^(if|else|return|const|let|var|import|export|from)$/.test(tokenText);
            if (tokenText.length < 3 || isCommonSymbol || isCommonKeyword) return false;
        }

        let found = false;
        for (let i = 0; i < N; i++) {
            if (sourceTokens[i].text === tokenText) {
                const estimatedStart = i - tokenIdxInSearch;
                candidates.add(Math.max(0, estimatedStart));
                found = true;
            }
        }
        return found;
    };

    // Strategy 0: Exact Contiguous Token Match (The Gold Standard)
    // This prevents "skipping" tokens in the source which leads to accidental deletion.
    const exactMatch = findExactTokenMatch(sourceTokens, searchTokens);
    if (exactMatch) {
        return exactMatch;
    }

    // Strategy 1: Smart Anchors (Top 5 longest/rarest tokens)
    // Instead of fixed positions, we scan the search block for the "best" anchors.
    const rankedTokens = searchTokens.map((t, i) => ({ index: i, text: t.text, length: t.text.length }))
        .sort((a, b) => b.length - a.length); // Sort by length descending

    // Try top 5 anchors
    let anchorsFound = 0;
    for (const tokenInfo of rankedTokens) {
        if (anchorsFound >= 5) break;
        if (addCandidates(tokenInfo.index, true)) {
            anchorsFound++;
        }
    }

    // Strategy 2: Fallback to fixed positions if no smart anchors worked (e.g. block of short vars)
    if (candidates.size === 0) {
        // Try relaxed matching on fixed positions
        addCandidates(0, false);
        addCandidates(Math.floor(M / 2), false);
        addCandidates(M - 1, false);
    }
    
    // Strategy 3: Desperate Scan (if still no candidates, scan every 10th token)
    if (candidates.size === 0) {
        for (let i = 0; i < N - M; i += 10) {
            candidates.add(i);
        }
    }

    const sortedCandidates = Array.from(candidates).sort((a, b) => a - b);
    const checkedRegions = new Set<number>();

    for (const startIdx of sortedCandidates) {
        // Quantize to avoid redundant checks (check every 5 tokens)
        const regionKey = Math.floor(startIdx / 5);
        if (checkedRegions.has(regionKey)) continue;
        checkedRegions.add(regionKey);

        // Define window: Allow length flexibility (0.5x to 1.5x to be very generous with insertions/deletions)
        const windowStart = Math.max(0, startIdx - 5); 
        const windowEnd = Math.min(N, startIdx + M + Math.max(10, M * 0.5)); 
        
        const sourceWindow = sourceTokens.slice(windowStart, windowEnd);
        
        // Compute LCS with Bounds and Length
        const matchResult = findLCSMatch(sourceWindow, searchTokens);
        
        if (matchResult) {
            const { start, end, length } = matchResult;
            const spanLength = end - start + 1;
            
            // Score = Harmonic mean of Precision and Recall (F1-like), but penalized by span gap
            // Precision = length / spanLength (How dense is the match in the source?)
            // Recall = length / M (How much of the search block did we find?)
            // We want to maximize both.
            
            // Simple Gap Penalty Score:
            // 2 * length / (M + spanLength)
            // If perfect match: 2 * M / (M + M) = 1.0
            // If sparse match (gap): 2 * M / (M + Huge) ~= 0
            
            const score = (2 * length) / (M + spanLength);

            if (score > bestScore) {
                bestScore = score;
                bestRange = {
                    start: windowStart + start,
                    end: windowStart + end
                };
            }
        }
    }

    // Threshold: 0.85 (Strict Mode)
    // Previously 0.4, which allowed deleting ~50% of the code in the block.
    // 0.85 ensures that we match at least ~85% of the tokens contiguously.
    if (bestScore > 0.85) {
        return bestRange;
    }

    return null;
}

function findExactTokenMatch(sourceTokens: Token[], searchTokens: Token[]): { start: number, end: number } | null {
    if (searchTokens.length === 0) return null;
    
    const firstToken = searchTokens[0].text;
    const M = searchTokens.length;
    const N = sourceTokens.length;

    // Optimization: Only scan where the first token matches
    for (let i = 0; i <= N - M; i++) {
        if (sourceTokens[i].text === firstToken) {
            let match = true;
            for (let j = 1; j < M; j++) {
                if (sourceTokens[i + j].text !== searchTokens[j].text) {
                    match = false;
                    break;
                }
            }
            if (match) {
                return {
                    start: i,
                    end: i + M - 1
                };
            }
        }
    }
    return null;
}

function findLCSMatch(seq1: Token[], seq2: Token[]): { start: number, end: number, length: number } | null {
    const m = seq1.length;
    const n = seq2.length;
    const dp = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (seq1[i - 1].text === seq2[j - 1].text) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    const length = dp[m][n];
    if (length === 0) return null;

    // Backtrack to find the range of the match in seq1
    let i = m, j = n;
    let firstMatchIdx = -1;
    let lastMatchIdx = -1;

    while (i > 0 && j > 0) {
        if (seq1[i - 1].text === seq2[j - 1].text) {
            if (lastMatchIdx === -1) lastMatchIdx = i - 1;
            firstMatchIdx = i - 1;
            i--;
            j--;
        } else if (dp[i - 1][j] > dp[i][j - 1]) {
            i--;
        } else {
            j--;
        }
    }

    return { start: firstMatchIdx, end: lastMatchIdx, length };
}

// Removed calculateLCS and findLCSBounds as they are replaced by findLCSMatch

