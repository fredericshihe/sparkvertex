import { parse } from '@babel/parser';
// @ts-ignore
import _generate from '@babel/generator';

// NOTE: We intentionally DO NOT import @babel/traverse
// It causes "undefined is not an object (evaluating 'this.path.hub.buildError')" in browser
// Instead, we use direct AST array manipulation which is 100% safe

const generate = (_generate as any).default || (_generate as any);

/**
 * Lightweight AST Walker - Replacement for @babel/traverse
 * Safe in all environments (browser, Node.js, etc.)
 */
function simpleWalk(node: any, visitor: (node: any, parent?: any) => void, parent?: any) {
    if (!node || typeof node !== 'object') return;

    visitor(node, parent);

    // Traverse all properties, recurse into objects and arrays
    for (const key in node) {
        // Skip metadata properties to avoid infinite loops
        if (key === 'loc' || key === 'start' || key === 'end' || key === 'comments' || key === 'leadingComments' || key === 'trailingComments') continue;
        
        const child = node[key];
        if (Array.isArray(child)) {
            child.forEach(c => simpleWalk(c, visitor, node));
        } else if (child && typeof child === 'object' && child.type) {
            simpleWalk(child, visitor, node);
        }
    }
}

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

export function applyPatches(source: string, patchText: string, relaxedMode: boolean = false, targets: string[] = []): string {
    // relaxedMode: Use relaxed matching for first edits on uploaded code
    if (relaxedMode) {
        console.log('[Patch] Using relaxed matching mode for uploaded code');
    }

    // 0. Check for Explicit AST Replacement Blocks (Scheme 2: Modular Generation)
    // Format: <<<<AST_REPLACE: TargetName>>>> ...Content... >>>>
    const astMatches = Array.from(patchText.matchAll(/<<<<\s*AST_REPLACE:\s*([a-zA-Z0-9_$]+)\s*>>>>([\s\S]*?)\s*>>>>/g));
    if (astMatches.length > 0) {
        console.log(`[Patch] Found ${astMatches.length} explicit AST replacement blocks.`);
        let currentSource = source;
        for (const match of astMatches) {
            const [_, targetName, newContent] = match;

            // Safety Check: Validate the block before applying
            if (!validateAstReplaceBlock(targetName, newContent)) {
                console.error(`[Patch] Skipping invalid AST_REPLACE block for ${targetName}`);
                continue;
            }

            const result = applyExplicitASTPatch(currentSource, targetName, newContent);
            if (result) {
                currentSource = result;
            } else {
                console.warn(`[Patch] Failed to apply explicit AST patch for ${targetName}`);
            }
        }
        // If we processed AST patches, we might still have normal patches? 
        // For now, assume mixed usage is rare or handled sequentially.
        // But to be safe, let's continue to check for normal patches in the *remaining* text?
        // Actually, usually the AI will output EITHER AST blocks OR Search/Replace blocks.
        // If it outputs both, we should process both.
        
        // Let's return the result if we found AST matches, assuming the AI used this mode exclusively or primarily.
        // If there are also normal patches, we should probably process them too.
        // But for simplicity and safety in this "Scheme 2" rollout, let's return.
        return validatePatchedCode(source, currentSource);
    }
    
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
             const result = applyPatchesInternal(source, looseMatches, relaxedMode, targets);
             return validatePatchedCode(source, result);
        }
        return source;
    }

    const result = applyPatchesInternal(source, matches, relaxedMode, targets);
    return validatePatchedCode(source, result);
}

/**
 * Explicit AST Patching (Scheme 2)
 * Directly replaces a named variable/function with new content.
 * Uses simpleWalk instead of @babel/traverse
 */
function applyExplicitASTPatch(source: string, targetName: string, newContent: string): string | null {
    try {
        const originalAst = parse(source, { 
            sourceType: 'module', 
            plugins: ['jsx', 'typescript'],
            errorRecovery: true
        });
        
        let replacementRange: { start: number, end: number } | null = null;

        // Scan top-level nodes directly (no traverse needed)
        for (const node of originalAst.program.body) {
            // VariableDeclaration
            if (node.type === 'VariableDeclaration') {
                for (const decl of node.declarations) {
                    if (decl.id?.type === 'Identifier' && decl.id.name === targetName) {
                        if (node.start != null && node.end != null) {
                            replacementRange = { start: node.start, end: node.end };
                            break;
                        }
                    }
                }
            }
            // FunctionDeclaration
            else if (node.type === 'FunctionDeclaration' && node.id?.name === targetName) {
                if (node.start != null && node.end != null) {
                    replacementRange = { start: node.start, end: node.end };
                }
            }
            // ExportNamedDeclaration
            else if (node.type === 'ExportNamedDeclaration' && node.declaration) {
                const decl = node.declaration;
                if (decl.type === 'VariableDeclaration') {
                    for (const d of decl.declarations) {
                        if (d.id?.type === 'Identifier' && d.id.name === targetName) {
                            if (node.start != null && node.end != null) {
                                replacementRange = { start: node.start, end: node.end };
                                break;
                            }
                        }
                    }
                } else if (decl.type === 'FunctionDeclaration' && decl.id?.name === targetName) {
                    if (node.start != null && node.end != null) {
                        replacementRange = { start: node.start, end: node.end };
                    }
                }
            }
            if (replacementRange) break;
        }

        if (replacementRange) {
            console.log(`[AST] Explicitly replacing ${targetName}. Range: ${replacementRange.start}-${replacementRange.end}`);
            const before = source.slice(0, replacementRange.start);
            const after = source.slice(replacementRange.end);
            return before + newContent.trim() + after;
        } else {
            console.warn(`[AST] Target ${targetName} not found in source.`);
            return null;
        }

    } catch (e) {
        console.error('[AST] Explicit patch failed:', e);
        return null;
    }
}

/**
 * AST-based Smart Patching (Level 1: Conflict Detection)
 * Detects if the new code defines variables that already exist in the source,
 * and performs a surgical replacement instead of relying on the SEARCH block.
 * Uses direct AST array access - no @babel/traverse
 * 
 * NOTE: This function is OPTIONAL and failing is OK - we fall back to text matching.
 * The primary purpose is to enable "whole variable replacement" when the AI defines
 * a complete variable/function that already exists in the source.
 */
function applySmartASTPatch(source: string, replaceBlock: string): string | null {
    // Quick bail-out: Only try AST patching for code that looks like a complete definition
    // Skip fragments, JSX snippets, partial code, etc.
    const looksLikeCompleteDefinition = /^\s*(const|let|var|function|export\s+(const|let|var|function)|class)\s+[A-Z]/.test(replaceBlock);
    if (!looksLikeCompleteDefinition) {
        return null; // Silent bail - this is expected for most patches
    }

    try {
        const newAst = parse(replaceBlock, { 
            sourceType: 'module', 
            plugins: ['jsx', 'typescript'],
            errorRecovery: true 
        });
        
        let targetVariableName: string | null = null;
        let targetType: 'VariableDeclarator' | 'FunctionDeclaration' = 'VariableDeclarator';

        // Scan top-level nodes of the new code
        for (const node of newAst.program.body) {
            if (node.type === 'VariableDeclaration') {
                for (const decl of node.declarations) {
                    if (decl.id?.type === 'Identifier') {
                        const name = decl.id.name;
                        // Heuristic: Only care about UPPER_CASE constants (config) or PascalCase (components)
                        if (/^[A-Z][A-Z0-9_]+$/.test(name) || /^[A-Z][a-zA-Z0-9]+$/.test(name)) {
                            targetVariableName = name;
                            targetType = 'VariableDeclarator';
                            break;
                        }
                    }
                }
            } else if (node.type === 'FunctionDeclaration' && node.id?.type === 'Identifier') {
                const name = node.id.name;
                if (/^[A-Z][a-zA-Z0-9]+$/.test(name)) { // React Components
                    targetVariableName = name;
                    targetType = 'FunctionDeclaration';
                    break;
                }
            } else if (node.type === 'ExportNamedDeclaration' && node.declaration) {
                const decl = node.declaration;
                if (decl.type === 'VariableDeclaration') {
                    for (const d of decl.declarations) {
                        if (d.id?.type === 'Identifier') {
                            const name = d.id.name;
                            if (/^[A-Z][A-Z0-9_]+$/.test(name) || /^[A-Z][a-zA-Z0-9]+$/.test(name)) {
                                targetVariableName = name;
                                targetType = 'VariableDeclarator';
                                break;
                            }
                        }
                    }
                } else if (decl.type === 'FunctionDeclaration' && decl.id?.name) {
                    const name = decl.id.name;
                    if (/^[A-Z][a-zA-Z0-9]+$/.test(name)) {
                        targetVariableName = name;
                        targetType = 'FunctionDeclaration';
                    }
                }
            }
            if (targetVariableName) break;
        }

        if (!targetVariableName) return null;

        // 2. Find the variable in the original source
        const originalAst = parse(source, { 
            sourceType: 'module', 
            plugins: ['jsx', 'typescript'],
            errorRecovery: true
        });
        
        let replacementRange: { start: number, end: number } | null = null;

        // Scan top-level nodes of the original code
        for (const node of originalAst.program.body) {
            if (targetType === 'VariableDeclarator' && node.type === 'VariableDeclaration') {
                for (const decl of node.declarations) {
                    if (decl.id?.type === 'Identifier' && decl.id.name === targetVariableName) {
                        if (node.start != null && node.end != null) {
                            replacementRange = { start: node.start, end: node.end };
                            break;
                        }
                    }
                }
            } else if (targetType === 'FunctionDeclaration' && node.type === 'FunctionDeclaration' && node.id?.name === targetVariableName) {
                if (node.start != null && node.end != null) {
                    replacementRange = { start: node.start, end: node.end };
                }
            } else if (node.type === 'ExportNamedDeclaration' && node.declaration) {
                const decl = node.declaration;
                if (targetType === 'VariableDeclarator' && decl.type === 'VariableDeclaration') {
                    for (const d of decl.declarations) {
                        if (d.id?.type === 'Identifier' && d.id.name === targetVariableName) {
                            if (node.start != null && node.end != null) {
                                replacementRange = { start: node.start, end: node.end };
                                break;
                            }
                        }
                    }
                } else if (targetType === 'FunctionDeclaration' && decl.type === 'FunctionDeclaration' && decl.id?.name === targetVariableName) {
                    if (node.start != null && node.end != null) {
                        replacementRange = { start: node.start, end: node.end };
                    }
                }
            }
            if (replacementRange) break;
        }

        // 3. Surgical Replacement
        if (replacementRange) {
            console.log(`[AST] Detected existing variable ${targetVariableName}. Overwriting range ${replacementRange.start}-${replacementRange.end}`);
            const before = source.slice(0, replacementRange.start);
            const after = source.slice(replacementRange.end);
            return before + replaceBlock + after;
        }

    } catch (e) {
        // Silent fail - AST patching is optional, text matching will handle it
        // Only log in debug scenarios
        if (typeof window !== 'undefined' && (window as any).__DEBUG_PATCH__) {
            console.warn('[AST] Smart patch analysis failed, falling back to text patch:', e);
        }
    }
    return null;
}

/**
 * Post-validation: Ensure the patched code is structurally valid.
 * If validation fails, return the original source to prevent corruption.
 */
function validatePatchedCode(originalSource: string, patchedCode: string): string {
    // Step 0: Heuristic Syntax Repair
    patchedCode = validateAndFixSyntax(patchedCode);

    // Step 0.5: Deduplicate Top-Level Bindings (Safety Net 1)
    console.log('[Patch] Running AST Dedupe (Safety Net 1)...');
    const beforeDedupeLength = patchedCode.length;
    patchedCode = dedupeTopLevelBindings(patchedCode);
    const afterDedupeLength = patchedCode.length;
    if (beforeDedupeLength !== afterDedupeLength) {
        console.log(`[Patch] AST Dedupe changed code length: ${beforeDedupeLength} -> ${afterDedupeLength}`);
    }

    // Step 0.6: Whole File Validation (Safety Net 2)
    try {
        validateWholeFileOrThrow(patchedCode);
    } catch (e) {
        console.error('[Patch] Whole file validation failed:', e);
        return originalSource;
    }

    // Check 1: Basic HTML structure (Relaxed for React Components)
    const hasDoctype = patchedCode.includes('<!DOCTYPE') || patchedCode.includes('<!doctype');
    const hasHtmlTag = /<html[\s>]/i.test(patchedCode);
    
    // If it looks like a React component (imports, exports, or JSX), skip HTML structure check
    const isReactComponent = /import\s+.*from|export\s+(default\s+)?(function|const|class)|return\s*\(?\s*<[A-Z]/.test(patchedCode);

    if (!hasDoctype && !hasHtmlTag && !isReactComponent) {
        // Might be a partial result or corrupted
        console.error('Validation failed: Missing basic HTML structure and not a React component');
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

function applyPatchesInternal(source: string, matches: RegExpMatchArray[], relaxedMode: boolean = false, targets: string[] = []): string {
    let currentSource = source;
    let successCount = 0;
    let failCount = 0;
    const failedBlocks: string[] = [];

    // Safety Net 3: Text Fallback Scope Limitation
    // If targets are provided, we restrict the search to the ranges of those targets.
    let allowedRanges: { start: number, end: number }[] | null = null;
    if (targets && targets.length > 0) {
        try {
            const foundRanges = findTargetRanges(currentSource, targets);
            // IMPORTANT: Only restrict if we actually found ranges.
            // If no ranges found, fall back to full file search (allowedRanges = null)
            if (foundRanges.length > 0) {
                allowedRanges = foundRanges;
                console.log(`[Patch] Restricted text fallback to ${allowedRanges.length} ranges for targets: ${targets.join(', ')}`);
            } else {
                console.warn(`[Patch] No ranges found for targets: ${targets.join(', ')}. Proceeding with full file search.`);
            }
        } catch (e) {
            console.warn('[Patch] Failed to calculate target ranges, proceeding with full file search:', e);
        }
    }

    for (const match of matches) {
        const [_, searchBlock, replaceBlock] = match;
        
        // Strategy 0: AST Smart Patch (Conflict Detection)
        // Before trying text matching, check if we are replacing a known variable/function
        const astResult = applySmartASTPatch(currentSource, replaceBlock);
        if (astResult) {
            currentSource = astResult;
            successCount++;
            continue;
        }

        // CRITICAL: Detect and reject compressed placeholders
        // These patterns indicate the AI incorrectly used compression artifacts
        const compressionPatterns = [
            /\/\/\s*\[Component:.*?\]\s*-\s*Code omitted/i,
            /\/\/\s*\.\.\.\s*\d+\s*lines?\s*omitted/i,
            /\/\*\s*\.\.\.\s*code omitted/i,
            /\/\/\s*\.\.\.\s*existing code/i,
            /\/\*\s*compressed\s*\*\//i,
            /@semantic-compressed/i,
            /=>\s*\{\s*\/\*\s*compressed\s*\*\/\s*\}/i
        ];

        // Filter noise AND compression artifacts from search block
        let cleanSearchBlock = searchBlock.split('\n')
            .filter(l => {
                const trimmed = l.trim();
                // Filter metadata
                if (trimmed.startsWith('///') || trimmed.match(/^summary:/i) || trimmed.match(/^changes:/i)) return false;
                // Filter compression artifacts (treat them as wildcards by removing them)
                if (compressionPatterns.some(p => p.test(trimmed))) return false;
                return true;
            })
            .join('\n');
        
        // Check if we removed compression artifacts
        const originalHasCompression = compressionPatterns.some(p => p.test(searchBlock));
        if (originalHasCompression) {
            console.warn('Patch warning: Search block contained compression artifacts. Switching to Anchor Matching.');
            
            // Strategy: Anchor Matching (Head + Tail)
            // If the search block had compression artifacts, we trust the first and last lines
            // to define the boundaries, and ignore everything in between.
            const searchLines = searchBlock.split('\n').map(l => l.trim()).filter(l => l);
            if (searchLines.length >= 2) {
                const startLine = searchLines[0];
                const endLine = searchLines[searchLines.length - 1];
                
                // Find start line in source
                const sourceLines = currentSource.split('\n');
                let bestAnchorMatch = null;
                
                for (let i = 0; i < sourceLines.length; i++) {
                    if (sourceLines[i].trim() === startLine) {
                        // Found potential start, look for end within reasonable range (500 lines)
                        for (let j = i + 1; j < Math.min(i + 500, sourceLines.length); j++) {
                            if (sourceLines[j].trim() === endLine) {
                                // Found match!
                                bestAnchorMatch = { startLine: i, endLine: j };
                                break;
                            }
                        }
                    }
                    if (bestAnchorMatch) break;
                }
                
                if (bestAnchorMatch) {
                    console.log(`[Patch] Anchor match successful: lines ${bestAnchorMatch.startLine}-${bestAnchorMatch.endLine}`);
                    const before = sourceLines.slice(0, bestAnchorMatch.startLine).join('\n');
                    const after = sourceLines.slice(bestAnchorMatch.endLine + 1).join('\n');
                    // Need to handle newline carefully
                    const newContent = (before ? before + '\n' : '') + replaceBlock + (after ? '\n' + after : '');
                    const patchEndIndex = (before ? before.length + 1 : 0) + replaceBlock.length;
                    currentSource = fixOverlapArtifacts(newContent, patchEndIndex);
                    successCount++;
                    continue;
                }
            }
        }

        const sourceTokens = tokenize(currentSource);
        const searchTokens = tokenize(cleanSearchBlock);
        
        if (searchTokens.length === 0) {
             console.warn("Empty search block tokens, skipping.");
             continue;
        }

        // Use relaxed matching for uploaded code's first edit
        let matchRange = findBestTokenMatch(sourceTokens, searchTokens, allowedRanges);
        
        // If strict matching failed and we're in relaxed mode, try relaxed matching
        if (!matchRange && relaxedMode) {
            console.log('[Patch] Strict match failed, trying relaxed matching...');
            matchRange = findBestTokenMatchRelaxed(sourceTokens, searchTokens);
        }

        // Fallback: AST Lite (Function Body Replacement)
        if (!matchRange) {
             const functionMatch = tryFunctionMatch(currentSource, cleanSearchBlock);
             if (functionMatch) {
                 // Validate replaceBlock syntax before applying
                 if (!isValidBlockSyntax(replaceBlock)) {
                     console.warn(`[Patch] AST Lite: Replace block for ${functionMatch.name} has invalid syntax (unbalanced braces), skipping.`);
                     failedBlocks.push(cleanSearchBlock.substring(0, 80) + '... (Invalid Syntax)');
                     failCount++;
                     continue;
                 }

                 console.log(`[Patch] AST Lite match successful for function: ${functionMatch.name}`);
                 const before = currentSource.substring(0, functionMatch.start);
                 const after = currentSource.substring(functionMatch.end);
                 const newContent = before + replaceBlock + after;
                 const patchEndIndex = before.length + replaceBlock.length;
                 currentSource = fixOverlapArtifacts(newContent, patchEndIndex);
                 successCount++;
                 continue;
             }
        }

        if (matchRange) {
            const startChar = sourceTokens[matchRange.start].start;
            const endChar = sourceTokens[matchRange.end].end;
            
            const before = currentSource.substring(0, startChar);
            const after = currentSource.substring(endChar);
            
            const newContent = before + replaceBlock + after;
            const patchEndIndex = before.length + replaceBlock.length;
            currentSource = fixOverlapArtifacts(newContent, patchEndIndex);
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

function findBestTokenMatch(sourceTokens: Token[], searchTokens: Token[], allowedRanges: { start: number, end: number }[] | null = null): { start: number, end: number } | null {
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
        // Check allowed ranges for exact match
        if (allowedRanges) {
            const tokenStartChar = sourceTokens[exactMatch.start].start;
            const isAllowed = allowedRanges.some(range => tokenStartChar >= range.start && tokenStartChar <= range.end);
            if (!isAllowed) {
                console.log('[Patch] Exact match rejected because it is outside allowed ranges.');
                // Fall through to fuzzy search? Or return null?
                // If exact match is outside, fuzzy match inside is unlikely unless exact match was wrong.
                // But let's fall through to be safe.
            } else {
                return exactMatch;
            }
        } else {
            return exactMatch;
        }
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
        // Check allowed ranges
        if (allowedRanges) {
            const tokenStartChar = sourceTokens[startIdx].start;
            const isAllowed = allowedRanges.some(range => tokenStartChar >= range.start && tokenStartChar <= range.end);
            if (!isAllowed) continue;
        }

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

    // Threshold: Dynamic based on context
    // Default: 0.85 (Strict Mode) - ensures ~85% token match
    // Relaxed: 0.70 (for first edit on uploaded code)
    const threshold = 0.85;
    if (bestScore > threshold) {
        return bestRange;
    }

    return null;
}

// Relaxed version of findBestTokenMatch for first edits on uploaded code
// Uses a lower threshold (0.70) to accommodate unfamiliar code structures
export function findBestTokenMatchRelaxed(sourceTokens: Token[], searchTokens: Token[]): { start: number, end: number } | null {
    const M = searchTokens.length;
    const N = sourceTokens.length;
    if (M === 0 || N < M) return null;

    // First try exact match
    const exactMatch = findExactTokenMatch(sourceTokens, searchTokens);
    if (exactMatch) return exactMatch;

    let bestScore = 0;
    let bestRange = null;

    // Scan with larger windows for relaxed matching
    for (let i = 0; i <= N - M; i += 5) {
        const windowEnd = Math.min(N, i + M + Math.max(20, M * 0.8));
        const sourceWindow = sourceTokens.slice(i, windowEnd);
        
        const matchResult = findLCSMatch(sourceWindow, searchTokens);
        
        if (matchResult) {
            const { start, end, length } = matchResult;
            const spanLength = end - start + 1;
            const score = (2 * length) / (M + spanLength);

            if (score > bestScore) {
                bestScore = score;
                bestRange = { start: i + start, end: i + end };
            }
        }
    }

    // Relaxed threshold: 0.60 (allows more flexibility for uploaded code)
    // Lowered from 0.70 to handle cases where AI hallucinates extra context (e.g. BATTLE_BACKGROUNDS)
    // which reduces the score but the match is still valid for the existing part.
    if (bestScore > 0.60) {
        console.log(`[Patch] Relaxed match found with score ${bestScore.toFixed(2)}`);
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

/**
 * AST Lite: Tries to match a complete function definition.
 * Useful when the AI provides a full function replacement but minor details cause token mismatch.
 */
function tryFunctionMatch(source: string, searchBlock: string): { start: number, end: number, name: string } | null {
    // 1. Check if search block looks like a function start
    const funcNameRegex = /(?:function|const|let|var|async\s+function|export\s+function|export\s+const)\s+([a-zA-Z0-9_$]+)/;
    const match = searchBlock.match(funcNameRegex);
    if (!match) return null;
    
    const funcName = match[1];
    
    // 2. Verify search block is roughly a complete block (brace balance)
    const openBraces = (searchBlock.match(/\{/g) || []).length;
    const closeBraces = (searchBlock.match(/\}/g) || []).length;
    if (openBraces === 0 || openBraces !== closeBraces) return null;

    // 3. Find function start in source
    const sourceLines = source.split('\n');
    let startLineIdx = -1;
    
    for (let i = 0; i < sourceLines.length; i++) {
        const line = sourceLines[i];
        if (line.includes(funcName)) {
             // Strict check for definition line
             const defRegex = new RegExp(`(?:function|const|let|var|async\\s+function|export\\s+function|export\\s+const)\\s+${funcName}\\s*(=|\\()`);
             if (defRegex.test(line)) {
                 startLineIdx = i;
                 break;
             }
        }
    }
    
    if (startLineIdx === -1) return null;

    // 4. Find function end in source (Brace Counting)
    let currentOpen = 0;
    let foundStart = false;
    let endLineIdx = -1;
    
    for (let i = startLineIdx; i < sourceLines.length; i++) {
        const line = sourceLines[i];
        const opens = (line.match(/\{/g) || []).length;
        const closes = (line.match(/\}/g) || []).length;
        
        if (opens > 0) foundStart = true;
        currentOpen += opens;
        currentOpen -= closes;
        
        if (foundStart && currentOpen === 0) {
            endLineIdx = i;
            break;
        }
    }
    
    if (endLineIdx !== -1) {
        const startChar = sourceLines.slice(0, startLineIdx).join('\n').length + (startLineIdx > 0 ? 1 : 0);
        const endChar = sourceLines.slice(0, endLineIdx + 1).join('\n').length;
        return { start: startChar, end: endChar, name: funcName };
    }
    
    return null;
}

/**
 * Detects and fixes "Overlap Artifacts" where the AI includes the closing line of the search block
 * in the replace block, but the patcher also keeps it in the source, leading to duplication.
 * e.g. "];\n];"
 */
function fixOverlapArtifacts(fullCode: string, patchEndIndex: number): string {
    // Check range around the insertion point
    const checkRange = 200;
    const start = Math.max(0, patchEndIndex - checkRange);
    const end = Math.min(fullCode.length, patchEndIndex + checkRange);
    
    const before = fullCode.slice(start, patchEndIndex);
    const after = fullCode.slice(patchEndIndex, end);
  
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
  
    // Check for duplication at the seam
    // Look at the last few lines of 'before' and first few lines of 'after'
    for (let i = 1; i <= 5; i++) { // Check up to 5 lines of overlap
      if (beforeLines.length < i || afterLines.length < i) break;
  
      const tail = beforeLines.slice(-i).join('\n').trim();
      const head = afterLines.slice(0, i).join('\n').trim();
  
      if (tail.length > 0 && tail === head) {
        console.log(`[Patch] Detected code duplication overlap (${i} lines). Fixing...`);
        // Remove the duplicated part from the 'after' section
        // We need to calculate the exact length to remove including newlines
        const duplicationLength = afterLines.slice(0, i).join('\n').length + 1; // +1 for the newline that split them
        return fullCode.slice(0, patchEndIndex) + fullCode.slice(patchEndIndex + duplicationLength);
      }
    }
  
    return fullCode;
}

/**
 * Checks if a code block has valid syntax (basic brace balance).
 */
function isValidBlockSyntax(code: string): boolean {
    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    return openBraces === closeBraces;
}

/**
 * Heuristic Stream Repair
 * Fixes broken strings (especially URLs) caused by line breaks during streaming or copy-paste.
 */
function repairBrokenStrings(code: string): string {
    // Pattern: Quote start, content, newline, content, Quote end
    // This heuristic fixes URLs or strings that were split across lines invalidly
    return code.replace(/(['"])(https?:\/\/[^\r\n]*?)\r?\n\s*([^\r\n]*?)\1/g, "$1$2$3$1");
}

/**
 * Heuristic Syntax Validation and Repair
 * Checks for common truncation issues like unclosed braces or backticks.
 */
function validateAndFixSyntax(code: string): string {
    let fixedCode = repairBrokenStrings(code);
    const lines = fixedCode.split('\n');
    const lastLine = lines[lines.length - 1];

    // 1. Check for unclosed backticks (template literals)
    const backtickCount = (fixedCode.match(/`/g) || []).length;
    if (backtickCount % 2 !== 0) {
        console.warn('[Patch] Detected unclosed backtick. Attempting repair...');
        fixedCode += '`);'; 
    }

    // 2. Check for unclosed braces (simple counter)
    const openBraces = (fixedCode.match(/\{/g) || []).length;
    const closeBraces = (fixedCode.match(/\}/g) || []).length;
    
    if (openBraces > closeBraces) {
        const diff = openBraces - closeBraces;
        // Only fix if it's a small number (likely truncation at end)
        if (diff <= 3) {
             console.warn(`[Patch] Detected ${diff} unclosed braces. Attempting repair...`);
             fixedCode += '}'.repeat(diff);
             // If it looks like a function or statement, add semicolon
             if (!fixedCode.trim().endsWith(';')) {
                 fixedCode += ';';
             }
        }
    }

    return fixedCode;
}

/**
 * Safety Net 1: Deduplicate Top-Level Bindings
 * Uses DIRECT AST array manipulation - NO @babel/traverse dependency
 * This is 100% safe in browser environments
 */
function dedupeTopLevelBindings(code: string): string {
    try {
        // Determine if it's a full HTML file or JS/TS module
        const isHtml = /^\s*<!DOCTYPE|^\s*<html/i.test(code);
        let scriptContent = code;
        let scriptStart = 0;
        let scriptEnd = code.length;

        if (isHtml) {
            // Extract script content (try babel type first)
            const patterns = [
                /<script[^>]*type=["']text\/babel["'][^>]*>([\s\S]*?)<\/script>/i,
                /<script[^>]*>([\s\S]*?)<\/script>/i
            ];
            let match = null;
            for (const p of patterns) {
                match = code.match(p);
                if (match) break;
            }
            if (match) {
                scriptContent = match[1];
                scriptStart = match.index! + match[0].indexOf(match[1]);
                scriptEnd = scriptStart + match[1].length;
            } else {
                return code;
            }
        }

        // Use pure AST array manipulation (no traverse!)
        const dedupeResult = pureAstDedupe(scriptContent);
        
        if (dedupeResult && dedupeResult !== scriptContent) {
            if (isHtml) {
                return code.slice(0, scriptStart) + dedupeResult + code.slice(scriptEnd);
            }
            return dedupeResult;
        }
        
        return code;

    } catch (e) {
        console.warn('[Safety] Dedupe failed, returning original:', e);
        return code;
    }
}

/**
 * Pure AST-based deduplication using direct array manipulation
 * NO @babel/traverse - works in all environments
 */
function pureAstDedupe(scriptContent: string): string {
    try {
        const ast = parse(scriptContent, {
            sourceType: 'module',
            plugins: ['jsx', 'typescript'],
            errorRecovery: true
        });

        const body = ast.program.body;
        const seenDeclarations = new Map<string, number>(); // varName -> index in body
        const indicesToRemove = new Set<number>();

        // Single pass: scan all top-level nodes
        body.forEach((node: any, index: number) => {
            const declaredNames: string[] = [];

            // 1. VariableDeclaration (const/let/var x = ...)
            if (node.type === 'VariableDeclaration') {
                node.declarations.forEach((decl: any) => {
                    if (decl.id?.type === 'Identifier') {
                        declaredNames.push(decl.id.name);
                    }
                });
            }
            // 2. FunctionDeclaration (function x() {})
            else if (node.type === 'FunctionDeclaration' && node.id?.name) {
                declaredNames.push(node.id.name);
            }
            // 3. ExportNamedDeclaration (export const x = ..., export function x() {})
            else if (node.type === 'ExportNamedDeclaration' && node.declaration) {
                const decl = node.declaration;
                if (decl.type === 'VariableDeclaration') {
                    decl.declarations.forEach((d: any) => {
                        if (d.id?.type === 'Identifier') {
                            declaredNames.push(d.id.name);
                        }
                    });
                } else if (decl.type === 'FunctionDeclaration' && decl.id?.name) {
                    declaredNames.push(decl.id.name);
                }
            }

            // Process all declared names
            for (const varName of declaredNames) {
                if (seenDeclarations.has(varName)) {
                    // Duplicate found! Mark the EARLIER one for removal (Last-Win strategy)
                    const prevIndex = seenDeclarations.get(varName)!;
                    indicesToRemove.add(prevIndex);
                    console.log(`[Safety/AST] Found duplicate ${varName}: removing index ${prevIndex}, keeping index ${index}`);
                }
                // Update to current index (whether first time or replacing)
                seenDeclarations.set(varName, index);
            }
        });

        // If no duplicates, return original (avoid generator formatting changes)
        if (indicesToRemove.size === 0) {
            return scriptContent;
        }

        // Filter out the duplicates
        const newBody = body.filter((_: any, index: number) => !indicesToRemove.has(index));
        ast.program.body = newBody;

        // Generate output
        const output = generate(ast, {
            retainLines: true,
            compact: false,
        });

        console.log(`[Safety/AST] Removed ${indicesToRemove.size} duplicate declaration(s)`);
        return output.code;

    } catch (e: any) {
        // AST dedupe failure is non-critical - the code might still be valid
        // Only log a brief message, not the full error
        if (e.loc) {
            const lines = scriptContent.split('\n');
            const errorLine = lines[e.loc.line - 1];
            console.warn(`[Safety] AST dedupe skipped (parse error at line ${e.loc.line}): ${errorLine ? errorLine.substring(0, 50).trim() : 'unknown'}...`);
        } else {
            console.warn('[Safety] AST dedupe skipped (parse error)');
        }
        return scriptContent; // Return original on error
    }
}

/**
 * Safety Net 2: Whole File Validation
 * Parses the entire file (or script content) to ensure no syntax errors remain.
 * Throws if invalid.
 */
function validateWholeFileOrThrow(code: string): void {
    const isHtml = /^\s*<!DOCTYPE|^\s*<html/i.test(code);
    let contentToCheck = code;

    if (isHtml) {
        const match = code.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
        if (match) {
            contentToCheck = match[1];
        } else {
            // If HTML but no script, maybe just validate HTML structure?
            // For now, we focus on JS syntax safety.
            return;
        }
    }

    try {
        parse(contentToCheck, {
            sourceType: 'module',
            plugins: ['jsx', 'typescript'],
            errorRecovery: false // Strict mode
        });
    } catch (e: any) {
        throw new Error(`Syntax Error in patched file: ${e.message} (${e.loc?.line}:${e.loc?.column})`);
    }
}

/**
 * Safety Net 3: AST Replace Block Validation
 * Checks if a single AST_REPLACE block is valid code and declares the expected identifier.
 * Uses simpleWalk instead of @babel/traverse
 */
function validateAstReplaceBlock(targetName: string, code: string): boolean {
    try {
        const ast = parse(code, { 
            sourceType: 'module', 
            plugins: ['jsx', 'typescript'],
            errorRecovery: false 
        });
        
        let found = false;
        
        // Use simpleWalk instead of traverse
        simpleWalk(ast, (node: any) => {
            if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.id.name === targetName) {
                found = true;
            }
            if (node.type === 'FunctionDeclaration' && node.id?.name === targetName) {
                found = true;
            }
        });
        
        if (!found) {
            console.warn(`[Safety] AST_REPLACE block for ${targetName} does not declare the identifier.`);
            return false;
        }
        return true;
    } catch (e) {
        console.warn(`[Safety] AST_REPLACE block for ${targetName} has syntax errors:`, e);
        return false;
    }
}

/**
 * Helper: Find ranges of target variables/functions in the source.
 * Used to restrict text fallback search scope.
 */
function findTargetRanges(source: string, targets: string[]): { start: number, end: number }[] {
    const ranges: { start: number, end: number }[] = [];
    
    // Handle HTML wrapper
    const isHtml = /^\s*<!DOCTYPE|^\s*<html/i.test(source);
    let scriptContent = source;
    let offset = 0;

    if (isHtml) {
        // Try multiple script tag patterns (including type="text/babel")
        const scriptPatterns = [
            /<script[^>]*type=["']text\/babel["'][^>]*>([\s\S]*?)<\/script>/i,
            /<script[^>]*>([\s\S]*?)<\/script>/i
        ];
        
        let match = null;
        for (const pattern of scriptPatterns) {
            match = source.match(pattern);
            if (match) break;
        }
        
        if (match) {
            scriptContent = match[1];
            offset = match.index! + match[0].indexOf(match[1]);
        } else {
            console.warn('[Patch] findTargetRanges: No script tag found in HTML');
            return [];
        }
    }

    // Use regex-based fallback instead of AST traverse (more reliable in browser)
    // This is simpler but works in all environments
    for (const target of targets) {
        // Match: const/let/var TARGET_NAME = ... or function TARGET_NAME(
        const patterns = [
            new RegExp(`(const|let|var)\\s+${target}\\s*=`, 'g'),
            new RegExp(`function\\s+${target}\\s*\\(`, 'g'),
            new RegExp(`export\\s+(const|let|var)\\s+${target}\\s*=`, 'g'),
            new RegExp(`export\\s+function\\s+${target}\\s*\\(`, 'g'),
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(scriptContent)) !== null) {
                const startPos = offset + match.index;
                // Find the end of this declaration (look for the next top-level statement)
                // Simple heuristic: find the matching closing brace/bracket or semicolon at the same indent level
                let endPos = startPos;
                let depth = 0;
                let inString = false;
                let stringChar = '';
                
                for (let i = match.index; i < scriptContent.length; i++) {
                    const char = scriptContent[i];
                    const prevChar = i > 0 ? scriptContent[i - 1] : '';
                    
                    // Handle string literals
                    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
                        if (!inString) {
                            inString = true;
                            stringChar = char;
                        } else if (char === stringChar) {
                            inString = false;
                        }
                        continue;
                    }
                    
                    if (inString) continue;
                    
                    if (char === '{' || char === '[' || char === '(') depth++;
                    if (char === '}' || char === ']' || char === ')') depth--;
                    
                    // End of declaration: semicolon at depth 0, or closing brace returning to depth 0
                    if (depth === 0 && (char === ';' || (char === '}' && scriptContent[match.index].match(/function/)))) {
                        endPos = offset + i + 1;
                        break;
                    }
                    // Also check for newline + const/let/var/function at depth 0 (next declaration)
                    if (depth === 0 && char === '\n') {
                        const nextLine = scriptContent.slice(i + 1, i + 50);
                        if (/^\s*(const|let|var|function|export|\/\/|\/\*)/.test(nextLine)) {
                            endPos = offset + i;
                            break;
                        }
                    }
                }
                
                if (endPos > startPos) {
                    ranges.push({ start: startPos, end: endPos });
                    console.log(`[Patch] Found target ${target} at range ${startPos}-${endPos}`);
                }
            }
        }
    }

    return ranges;
}




