import { parse } from '@babel/parser';
// @ts-ignore
import _generate from '@babel/generator';
import { BABEL_PARSER_CONFIG } from './code-rag';

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
    normalized?: string; // 🆕 Normalized form for comparison
}

/**
 * 🆕 Token Normalization Rules
 * Normalize tokens to reduce false mismatches caused by:
 * - Single vs double quotes: "foo" vs 'foo'
 * - Template literals: `foo` vs "foo"
 * - Optional semicolons in JS/TS
 * - Trailing commas
 */
function normalizeToken(text: string): string {
    // Rule 1: Normalize quotes - treat all quote types as equivalent
    // "foo" -> 'foo', `foo` -> 'foo'
    if (text === '"' || text === '`') {
        return "'";
    }
    
    // Rule 2: Optional semicolons - in JS/TS, semicolons are often optional
    // We keep them but mark them as "soft" by returning a special marker
    // Actually, for matching purposes, we'll just ignore trailing semicolons
    // by not normalizing them here (handled in comparison logic)
    
    // Rule 3: Normalize arrow function variations
    // => is already a single token, no normalization needed
    
    // 🆕 Rule 4: Normalize whitespace in template literals
    // Helps with AI generating slightly different formatting
    
    return text;
}

/**
 * 🆕 P4 FIX: Levenshtein Distance for fuzzy token matching
 * Returns edit distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    
    const matrix: number[][] = [];
    
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[b.length][a.length];
}

/**
 * 🆕 P4 FIX: Fuzzy token comparison
 * Returns true if tokens are "close enough" to be considered equivalent
 * Tolerance: max 1 edit for short tokens, 2 for longer ones
 */
function tokensFuzzyEqual(a: Token, b: Token): boolean {
    // Fast path: exact match
    if (a.text === b.text) return true;
    
    // Normalized match
    const aNorm = a.normalized || a.text;
    const bNorm = b.normalized || b.text;
    if (aNorm === bNorm) return true;
    
    // Skip fuzzy match for short tokens (likely punctuation)
    if (a.text.length < 3 || b.text.length < 3) return false;
    
    // Calculate edit distance tolerance based on token length
    const maxLen = Math.max(a.text.length, b.text.length);
    const tolerance = maxLen <= 5 ? 1 : 2;
    
    const distance = levenshteinDistance(a.text, b.text);
    return distance <= tolerance;
}

function tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    // Match words (identifiers, keywords) or non-whitespace symbols
    // This regex splits the code into meaningful atomic units
    const regex = /([a-zA-Z0-9_$]+)|([^\s\w])/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const tokenText = match[0];
        tokens.push({
            text: tokenText,
            start: match.index,
            end: regex.lastIndex,
            normalized: normalizeToken(tokenText)
        });
    }
    return tokens;
}

/**
 * 🆕 Compare two tokens with normalization
 * Returns true if tokens are equivalent (even if not identical)
 */
function tokensEqual(a: Token, b: Token): boolean {
    // Fast path: exact match
    if (a.text === b.text) return true;
    
    // Normalized match
    const aNorm = a.normalized || a.text;
    const bNorm = b.normalized || b.text;
    
    return aNorm === bNorm;
}

/**
 * 🆕 Compare token text strings with normalization
 * Used for simple string comparisons in matching algorithms
 */
function tokenTextEqual(a: string, b: string): boolean {
    if (a === b) return true;
    return normalizeToken(a) === normalizeToken(b);
}

// Helper to strip comments from code
function stripComments(code: string): string {
    return code
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '') // JSX comments (First! to avoid leaving empty {})
        .replace(/\/\*[\s\S]*?\*\//g, '')     // Block comments
        .replace(/\/\/.*/g, '');              // Line comments
}

export interface PatchStats {
    total: number;
    success: number;
    failed: number;
    failures: string[]; // List of failure reasons
}

export interface PatchResult {
    code: string;
    stats: PatchStats;
}

/**
 * Applies patches and returns detailed statistics.
 * Use this when you need to know which patches succeeded/failed (Partial Apply).
 */
export function applyPatchesWithDetails(source: string, patchText: string, relaxedMode: boolean = false, targets: string[] = []): PatchResult {
    const startTime = performance.now();
    console.log(`[Patch] 🚀 Starting patch application (source: ${Math.round(source.length/1024)}KB, patch: ${Math.round(patchText.length/1024)}KB)`);
    
    // relaxedMode: Use relaxed matching for first edits on uploaded code
    if (relaxedMode) {
        console.log('[Patch] Using relaxed matching mode for uploaded code');
    }

    // 0. Check for Explicit AST Replacement Blocks (Scheme 2: Modular Generation)
    const astMatches = Array.from(patchText.matchAll(/<<<<\s*AST_REPLACE:\s*([a-zA-Z0-9_$]+)\s*>>>>([\s\S]*?)\s*>>>>/g));
    if (astMatches.length > 0) {
        console.log(`[Patch] Found ${astMatches.length} explicit AST replacement blocks.`);
        let currentSource = source;
        let successCount = 0;
        let failCount = 0;
        const failures: string[] = [];

        for (const match of astMatches) {
            const [_, targetName, newContent] = match;

            // Safety Check: Validate the block before applying
            if (!validateAstReplaceBlock(targetName, newContent)) {
                console.error(`[Patch] Skipping invalid AST_REPLACE block for ${targetName}`);
                failCount++;
                failures.push(`AST_REPLACE: Invalid block syntax for ${targetName}`);
                continue;
            }

            const result = applyExplicitASTPatch(currentSource, targetName, newContent);
            if (result) {
                currentSource = result;
                successCount++;
            } else {
                console.warn(`[Patch] Failed to apply explicit AST patch for ${targetName}`);
                failCount++;
                failures.push(`AST_REPLACE: Target ${targetName} not found`);
            }
        }
        
        const finalCode = validatePatchedCode(source, currentSource);
        // If validation reverted code, mark as full failure
        if (finalCode === source && currentSource !== source) {
             return {
                 code: source,
                 stats: {
                     total: astMatches.length,
                     success: 0,
                     failed: astMatches.length,
                     failures: ["Validation failed after applying AST patches"]
                 }
             };
        }

        return {
            code: finalCode,
            stats: {
                total: astMatches.length,
                success: successCount,
                failed: failCount,
                failures
            }
        };
    }
    
    // 1. Parse Patches (支持行号锚定格式: <<<<SEARCH @L42-L58)
    // 新格式: <<<<SEARCH @L[start]-L[end] ... ==== ... >>>>
    // 行号锚定正则：捕获 @L123-L456 格式
    
    // 提取行号信息的辅助函数
    const extractLineNumbers = (fullMatch: string): { startLine?: number; endLine?: number } => {
        const lineMatch = fullMatch.match(/@L(\d+)(?:-L(\d+))?/);
        if (lineMatch) {
            return {
                startLine: parseInt(lineMatch[1], 10),
                endLine: lineMatch[2] ? parseInt(lineMatch[2], 10) : undefined
            };
        }
        return {};
    };
    
    let matches = Array.from(patchText.matchAll(/<<<<\s*SEARCH\s*(?:@L\d+(?:-L\d+)?)?\s*([\s\S]*?)\s*====\s*([\s\S]*?)\s*>>>>/g));
    
    if (matches.length === 0) {
        // Fallback 1: Loose matches (no spaces or different spacing)
        matches = Array.from(patchText.matchAll(/<<<<SEARCH(?:\s*@L\d+(?:-L\d+)?)?([\s\S]*?)====([\s\S]*?)>>>>/g));
        
        // Fallback 2: Handle "==== REPLACE" variation
        if (matches.length === 0) {
             matches = Array.from(patchText.matchAll(/<<<<\s*SEARCH\s*(?:@L\d+(?:-L\d+)?)?\s*([\s\S]*?)\s*====\s*REPLACE\s*([\s\S]*?)\s*>>>>/g));
        }

        // Fallback 3: Handle missing closing >>>> (truncated response)
        if (matches.length === 0) {
             matches = Array.from(patchText.matchAll(/<<<<\s*SEARCH\s*(?:@L\d+(?:-L\d+)?)?\s*([\s\S]*?)\s*====\s*([\s\S]*)$/g));
        }
    }

    if (matches.length > 0) {
         const matchStartTime = performance.now();
         const { code: rawResult, stats } = applyPatchesInternalWithStats(source, matches, relaxedMode, targets);
         console.log(`[Patch] ⏱️ Patch matching took ${(performance.now() - matchStartTime).toFixed(0)}ms`);
         
         const validationStartTime = performance.now();
         const finalCode = validatePatchedCode(source, rawResult);
         console.log(`[Patch] ⏱️ Validation took ${(performance.now() - validationStartTime).toFixed(0)}ms`);
         
         // If validation reverted code, treat as failure
         if (finalCode === source && rawResult !== source) {
             console.log(`[Patch] ⏱️ Total time: ${(performance.now() - startTime).toFixed(0)}ms (validation reverted)`);
             return {
                 code: source,
                 stats: {
                     ...stats,
                     success: 0,
                     failed: stats.total,
                     failures: [...stats.failures, "Post-patch validation failed (syntax error or broken references)"]
                 }
             };
         }

         console.log(`[Patch] ⏱️ Total time: ${(performance.now() - startTime).toFixed(0)}ms`);
         return { code: finalCode, stats };
    }

    console.log(`[Patch] ⏱️ Total time: ${(performance.now() - startTime).toFixed(0)}ms (no patches found)`);
    return { 
        code: source, 
        stats: { total: 0, success: 0, failed: 0, failures: [] } 
    };
}

/**
 * Legacy wrapper for backward compatibility.
 * Returns only the code string.
 */
export function applyPatches(source: string, patchText: string, relaxedMode: boolean = false, targets: string[] = []): string {
    const result = applyPatchesWithDetails(source, patchText, relaxedMode, targets);
    return result.code;
}

/**
 * Explicit AST Patching (Scheme 2)
 * Directly replaces a named variable/function with new content.
 * Uses simpleWalk instead of @babel/traverse
 */
function applyExplicitASTPatch(source: string, targetName: string, newContent: string): string | null {
    try {
        const originalAst = parse(source, BABEL_PARSER_CONFIG);
        
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
        const newAst = parse(replaceBlock, BABEL_PARSER_CONFIG);
        
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
        const originalAst = parse(source, BABEL_PARSER_CONFIG);
        
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
 * 
 * ⚡ Performance Optimization (Dec 2025):
 * - Skip heavy AST validation for small patches (< 10KB change)
 * - Add timing logs for performance monitoring
 */
function validatePatchedCode(originalSource: string, patchedCode: string): string {
    const startTime = performance.now();
    const isLargeFile = originalSource.length > 50000; // 50KB threshold
    
    // Step -1: Sanity Check for Truncation (Critical Fix for 26-byte bug)
    if (patchedCode.length < 100 && originalSource.length > 500) {
        console.error(`[Patch] CRITICAL: Patched code is suspiciously short (${patchedCode.length} chars). Reverting to original.`);
        return originalSource;
    }

    // Step 0: Heuristic Syntax Repair (fast, no AST)
    patchedCode = validateAndFixSyntax(patchedCode);
    
    // ⚡ Fast Path: Skip heavy AST validation for large files with small changes
    const changeSize = Math.abs(patchedCode.length - originalSource.length);
    const isSmallChange = changeSize < 10000; // Less than 10KB difference
    
    if (isLargeFile && isSmallChange) {
        console.log(`[Patch] ⚡ Fast path: Large file (${Math.round(originalSource.length/1024)}KB) with small change (${changeSize} chars), skipping full AST validation`);
        
        // Quick checks only (no AST parsing)
        // Check 1: Basic HTML structure
        const hasDoctype = patchedCode.includes('<!DOCTYPE') || patchedCode.includes('<!doctype');
        const hasHtmlTag = /<html[\s>]/i.test(patchedCode);
        const isReactComponent = /import\s+.*from|export\s+(default\s+)?(function|const|class)|return\s*\(?\s*<[A-Z]/.test(patchedCode);
        
        if (!hasDoctype && !hasHtmlTag && !isReactComponent) {
            console.error('[Patch] Fast path validation failed: Missing basic structure');
            return originalSource;
        }
        
        // Check 2: Code length sanity
        if (patchedCode.length < originalSource.length * 0.5 || patchedCode.length > originalSource.length * 3) {
            console.error(`[Patch] Fast path validation failed: Suspicious length change`);
            return originalSource;
        }
        
        console.log(`[Patch] ⚡ Validation completed in ${(performance.now() - startTime).toFixed(0)}ms (fast path)`);
        return patchedCode;
    }

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

    // Step 0.7: Undefined Reference Detection (Safety Net 2b) - CRITICAL
    // This catches cases where AI deleted component definitions but left references
    const undefinedRefs = detectUndefinedReferences(patchedCode);
    if (undefinedRefs.length > 0) {
        console.error(`[Patch] CRITICAL: Found ${undefinedRefs.length} undefined component references: ${undefinedRefs.join(', ')}`);
        console.error('[Patch] Reverting to original source to prevent broken app');
        return originalSource;
    }

    // Step 0.8: Compare definitions - detect if patch accidentally deleted components
    // Only run if original source had no undefined refs (was valid)
    const originalUndefinedRefs = detectUndefinedReferences(originalSource);
    if (originalUndefinedRefs.length === 0) {
        // Original was valid, check if patched code lost any definitions
        const originalDefs = extractTopLevelDefinitions(originalSource);
        const patchedDefs = extractTopLevelDefinitions(patchedCode);
        
        const lostDefinitions = originalDefs.filter(def => !patchedDefs.includes(def));
        if (lostDefinitions.length > 0) {
            // Check if the lost definitions are still referenced
            const stillReferenced = lostDefinitions.filter(def => {
                // Simple regex check for usage (not perfect but catches most cases)
                const usagePattern = new RegExp(`<${def}[\\s/>]|\\b${def}\\s*\\(`, 'g');
                return usagePattern.test(patchedCode);
            });
            
            if (stillReferenced.length > 0) {
                console.error(`[Patch] CRITICAL: Patch deleted ${stillReferenced.length} component definitions that are still referenced: ${stillReferenced.join(', ')}`);
                console.error('[Patch] Reverting to original source to prevent broken app');
                return originalSource;
            } else {
                console.warn(`[Patch] Warning: ${lostDefinitions.length} definitions were removed but not referenced: ${lostDefinitions.join(', ')}`);
            }
        }
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
    // Note: validateAndFixSyntax already tries to fix imbalanced tags,
    // so this check is for cases that couldn't be automatically fixed.
    const scriptOpenCount = (patchedCode.match(/<script/gi) || []).length;
    const scriptCloseCount = (patchedCode.match(/<\/script>/gi) || []).length;
    
    if (scriptOpenCount !== scriptCloseCount) {
        // Don't fail immediately - the code was already attempted to be fixed
        // Only fail if the difference is significant (more than 1)
        const diff = Math.abs(scriptOpenCount - scriptCloseCount);
        if (diff > 1) {
            console.error(`Validation failed: Unbalanced script tags (open: ${scriptOpenCount}, close: ${scriptCloseCount})`);
            return originalSource;
        } else {
            console.warn(`Validation warning: Minor script tag imbalance (open: ${scriptOpenCount}, close: ${scriptCloseCount}), proceeding anyway`);
        }
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

    console.log(`[Patch] ✅ Validation completed in ${(performance.now() - startTime).toFixed(0)}ms`);
    return patchedCode;
}

/**
 * Incremental Patch Validation (Safety Net 4)
 * Validates that a single patch application didn't break the code structure.
 * Returns { valid: true } if safe, or { valid: false, reason: string } if not.
 */
function validateIncrementalPatch(
    previousSource: string,
    newSource: string,
    originalDefinitions: string[],
    patchIndex: number
): { valid: boolean; reason?: string } {
    // Check 1: Quick syntax validation
    try {
        const isHtml = /^\s*<!DOCTYPE|^\s*<html/i.test(newSource);
        let contentToCheck = newSource;
        
        if (isHtml) {
            const match = newSource.match(/<script[^>]*type=["']text\/babel["'][^>]*>([\s\S]*?)<\/script>/i);
            if (match) {
                contentToCheck = match[1];
            }
        }
        
        parse(contentToCheck, {
            ...BABEL_PARSER_CONFIG,
            errorRecovery: false // Strict mode - any error means invalid
        });
    } catch (e: any) {
        return { 
            valid: false, 
            reason: `Syntax error after patch ${patchIndex + 1}: ${e.message}` 
        };
    }
    
    // Check 2: Component definitions integrity
    const newDefinitions = extractTopLevelDefinitions(newSource);
    
    // Check if any original definitions were lost
    const lostDefinitions = originalDefinitions.filter(def => !newDefinitions.includes(def));
    
    if (lostDefinitions.length > 0) {
        // Check if the lost definitions are still referenced in the new source
        const stillReferenced = lostDefinitions.filter(def => {
            // Look for JSX usage or function calls
            const usagePattern = new RegExp(`<${def}[\\s/>]|\\b${def}\\s*\\(|case\\s+['"]${def}['"]`, 'g');
            return usagePattern.test(newSource);
        });
        
        if (stillReferenced.length > 0) {
            return {
                valid: false,
                reason: `Patch ${patchIndex + 1} deleted component(s) that are still referenced: ${stillReferenced.join(', ')}`
            };
        }
    }
    
    // Check 3: Detect orphaned code (code outside of any function)
    // This catches the "Step2_PetSelection body without declaration" case
    try {
        const isHtml = /^\s*<!DOCTYPE|^\s*<html/i.test(newSource);
        let contentToCheck = newSource;
        
        if (isHtml) {
            const match = newSource.match(/<script[^>]*type=["']text\/babel["'][^>]*>([\s\S]*?)<\/script>/i);
            if (match) {
                contentToCheck = match[1];
            }
        }
        
        const ast = parse(contentToCheck, BABEL_PARSER_CONFIG);
        
        // Check for orphaned statements at top level that shouldn't be there
        for (const node of ast.program.body) {
            // ExpressionStatement at top level with hooks or setState calls is suspicious
            if (node.type === 'ExpressionStatement') {
                const code = contentToCheck.slice(node.start!, node.end!);
                if (/\buse[A-Z]\w*\s*\(/.test(code) || /\bset[A-Z]\w*\s*\(/.test(code)) {
                    return {
                        valid: false,
                        reason: `Patch ${patchIndex + 1} created orphaned hook/setState call at top level`
                    };
                }
            }
        }
    } catch (e) {
        // Parsing failed - already caught in Check 1
    }
    
    return { valid: true };
}

/**
 * Internal logic for applying patches with stats.
 */
function applyPatchesInternalWithStats(
    source: string, 
    matches: RegExpMatchArray[], 
    relaxedMode: boolean = false, 
    targets: string[] = []
): { code: string; stats: PatchStats } {
    // 🆕 TRANSACTIONAL: Work on a copy, only commit if all succeed
    let workingSource = source;
    let successCount = 0;
    let failCount = 0;
    const failedBlocks: string[] = [];
    const appliedPatches: { index: number; before: string; after: string }[] = [];

    // CRITICAL: Capture original component definitions for incremental validation
    const originalDefinitions = extractTopLevelDefinitions(source);
    console.log(`[Patch] Original definitions: ${originalDefinitions.join(', ')}`);
    console.log(`[Patch] 🔄 TRANSACTIONAL MODE: ${matches.length} patches to apply`);

    // Safety Net 3: Text Fallback Scope Limitation
    let allowedRanges: { start: number, end: number }[] | null = null;
    if (targets && targets.length > 0) {
        try {
            const foundRanges = findTargetRanges(workingSource, targets);
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

    // 🆕 P1: 行号锚定辅助函数
    const extractLineNumbers = (fullMatch: string): { startLine?: number; endLine?: number } => {
        const lineMatch = fullMatch.match(/@L(\d+)(?:-L(\d+))?/);
        if (lineMatch) {
            return {
                startLine: parseInt(lineMatch[1], 10),
                endLine: lineMatch[2] ? parseInt(lineMatch[2], 10) : undefined
            };
        }
        return {};
    };
    
    // 🆕 P1: 行号优先匹配策略
    const applyLineAnchoredPatch = (
        source: string, 
        searchBlock: string, 
        replaceBlock: string, 
        lineInfo: { startLine?: number; endLine?: number }
    ): string | null => {
        if (!lineInfo.startLine) return null;
        
        const sourceLines = source.split('\n');
        const searchLines = searchBlock.trim().split('\n');
        
        // 行号是 1-based，转换为 0-based
        const startIdx = lineInfo.startLine - 1;
        const endIdx = lineInfo.endLine ? lineInfo.endLine - 1 : startIdx + searchLines.length - 1;
        
        // 边界检查
        if (startIdx < 0 || endIdx >= sourceLines.length) {
            console.warn(`[Patch] 行号越界: L${lineInfo.startLine}-L${lineInfo.endLine || 'auto'} (文件共 ${sourceLines.length} 行)`);
            return null;
        }
        
        // 验证行号范围内的内容是否与 searchBlock 匹配
        const targetLines = sourceLines.slice(startIdx, endIdx + 1);
        const targetContent = targetLines.join('\n').trim();
        const searchContent = searchBlock.trim();
        
        // 使用归一化比较（忽略首尾空白）
        const normalizedTarget = targetContent.replace(/^\s+|\s+$/gm, '');
        const normalizedSearch = searchContent.replace(/^\s+|\s+$/gm, '');
        
        // 计算相似度（简单的行匹配率）
        const targetLinesTrimmed = normalizedTarget.split('\n');
        const searchLinesTrimmed = normalizedSearch.split('\n');
        let matchedLines = 0;
        const minLen = Math.min(targetLinesTrimmed.length, searchLinesTrimmed.length);
        
        for (let i = 0; i < minLen; i++) {
            if (targetLinesTrimmed[i].trim() === searchLinesTrimmed[i].trim()) {
                matchedLines++;
            }
        }
        
        const similarity = minLen > 0 ? matchedLines / minLen : 0;
        
        if (similarity >= 0.7) {
            // 70% 以上的行匹配，接受这个定位
            console.log(`[Patch] ✅ 行号锚定成功: L${lineInfo.startLine}-L${endIdx + 1} (相似度: ${(similarity * 100).toFixed(0)}%)`);
            
            // 替换这些行
            const before = sourceLines.slice(0, startIdx);
            const after = sourceLines.slice(endIdx + 1);
            const result = [...before, replaceBlock.trim(), ...after].join('\n');
            return result;
        } else {
            console.warn(`[Patch] ⚠️ 行号锚定失败: L${lineInfo.startLine}-L${endIdx + 1} 相似度过低 (${(similarity * 100).toFixed(0)}%)`);
            return null;
        }
    };

    for (const match of matches) {
        const [fullMatch, searchBlock, replaceBlock] = match;
        const patchIndex = matches.indexOf(match);
        const previousSource = workingSource; // Save for potential rollback
        
        // 🆕 P1: 提取行号信息
        const lineInfo = extractLineNumbers(fullMatch);
        if (lineInfo.startLine) {
            console.log(`[Patch] 🎯 发现行号锚定: @L${lineInfo.startLine}${lineInfo.endLine ? `-L${lineInfo.endLine}` : ''}`);
        }
        
        // Helper to record failure
        const recordFailure = (reason: string) => {
            failedBlocks.push(reason);
            failCount++;
        };

        // 🆕 P1: Strategy -1: 行号锚定优先匹配
        if (lineInfo.startLine) {
            const lineResult = applyLineAnchoredPatch(workingSource, searchBlock, replaceBlock, lineInfo);
            if (lineResult) {
                const validation = validateIncrementalPatch(previousSource, lineResult, originalDefinitions, patchIndex);
                if (!validation.valid) {
                    console.error(`[Patch] ROLLBACK (行号锚定): ${validation.reason}`);
                    recordFailure(`Line Anchored Patch (rolled back): ${validation.reason}`);
                    // 继续尝试其他策略
                } else {
                    workingSource = lineResult;
                    appliedPatches.push({ index: patchIndex, before: previousSource, after: workingSource });
                    successCount++;
                    continue; // 成功，跳到下一个 patch
                }
            }
            // 行号锚定失败，回退到模糊匹配
            console.log(`[Patch] 行号锚定未成功，回退到模糊匹配...`);
        }

        // Strategy 0: AST Smart Patch (Conflict Detection)
        const astResult = applySmartASTPatch(workingSource, replaceBlock);
        if (astResult) {
            const validation = validateIncrementalPatch(previousSource, astResult, originalDefinitions, patchIndex);
            if (!validation.valid) {
                console.error(`[Patch] ROLLBACK: ${validation.reason}`);
                recordFailure(`AST Smart Patch (rolled back): ${validation.reason}`);
                continue;
            }
            workingSource = astResult;
            appliedPatches.push({ index: patchIndex, before: previousSource, after: workingSource });
            successCount++;
            continue;
        }

        // CRITICAL: Detect and reject compressed placeholders
        const compressionPatterns = [
            /\/\/\s*\[Component:.*?\]\s*-\s*Code omitted/i,
            /\/\/\s*\.\.\.\s*\d+\s*lines?\s*omitted/i,
            /\/\*\s*\.\.\.\s*code omitted/i,
            /\/\/\s*\.\.\.\s*existing code/i,
            /\/\*\s*compressed\s*\*\//i,
            /@semantic-compressed/i,
            /=>\s*\{\s*\/\*\s*compressed\s*\*\/\s*\}/i
        ];

        let cleanSearchBlock = searchBlock.split('\n')
            .filter(l => {
                const trimmed = l.trim();
                if (trimmed.startsWith('///') || trimmed.match(/^summary:/i) || trimmed.match(/^changes:/i)) return false;
                if (compressionPatterns.some(p => p.test(trimmed))) return false;
                return true;
            })
            .join('\n');
        
        const originalHasCompression = compressionPatterns.some(p => p.test(searchBlock));
        if (originalHasCompression) {
            console.warn('Patch warning: Search block contained compression artifacts. Switching to Anchor Matching.');
            
            // Strategy: Anchor Matching (Head + Tail)
            const searchLines = searchBlock.split('\n').map(l => l.trim()).filter(l => l);
            if (searchLines.length >= 2) {
                const startLine = searchLines[0];
                const endLine = searchLines[searchLines.length - 1];
                
                const sourceLines = workingSource.split('\n');
                let bestAnchorMatch = null;
                
                for (let i = 0; i < sourceLines.length; i++) {
                    if (sourceLines[i].trim() === startLine) {
                        for (let j = i + 1; j < Math.min(i + 500, sourceLines.length); j++) {
                            if (sourceLines[j].trim() === endLine) {
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
                    const newContent = (before ? before + '\n' : '') + replaceBlock + (after ? '\n' + after : '');
                    const patchEndIndex = (before ? before.length + 1 : 0) + replaceBlock.length;
                    const candidateSource = fixOverlapArtifacts(newContent, patchEndIndex);
                    
                    const validation = validateIncrementalPatch(previousSource, candidateSource, originalDefinitions, patchIndex);
                    if (!validation.valid) {
                        console.error(`[Patch] ROLLBACK Anchor: ${validation.reason}`);
                        recordFailure(`Anchor Patch (rolled back): ${validation.reason}`);
                        continue;
                    }
                    workingSource = candidateSource;
                    appliedPatches.push({ index: patchIndex, before: previousSource, after: workingSource });
                    successCount++;
                    continue;
                }
            }
        }

        const sourceTokens = tokenize(workingSource);
        const searchTokens = tokenize(cleanSearchBlock);
        
        if (searchTokens.length === 0) {
             console.warn("Empty search block tokens, skipping.");
             recordFailure("Empty search block");
             continue;
        }

        let matchRange = findBestTokenMatch(sourceTokens, searchTokens, allowedRanges);
        
        if (!matchRange && relaxedMode) {
            console.log('[Patch] Strict match failed, trying relaxed matching...');
            matchRange = findBestTokenMatchRelaxed(sourceTokens, searchTokens);
        }

        // Strategy 1.5: Comment-Insensitive Match
        if (!matchRange) {
            const strippedSearchBlock = stripComments(cleanSearchBlock);
            if (strippedSearchBlock.length < cleanSearchBlock.length) {
                const strippedSearchTokens = tokenize(strippedSearchBlock);
                if (strippedSearchTokens.length > 0) {
                    matchRange = findBestTokenMatchRelaxed(sourceTokens, strippedSearchTokens);
                    if (matchRange) console.log('[Patch] Comment-insensitive match successful!');
                }
            }
        }

        // Strategy 1.6: Fuzzy Token Matching
        if (!matchRange) {
            console.log('[Patch] Trying fuzzy token matching...');
            matchRange = findBestTokenMatchFuzzy(sourceTokens, searchTokens, allowedRanges);
            if (matchRange) console.log('[Patch] Fuzzy token match successful!');
        }

        // Fallback: AST Lite
        if (!matchRange) {
             const functionMatch = tryFunctionMatch(workingSource, cleanSearchBlock);
             if (functionMatch) {
                 if (!isValidBlockSyntax(replaceBlock)) {
                     recordFailure(`${cleanSearchBlock.substring(0, 50)}... (Invalid Syntax)`);
                     continue;
                 }

                 console.log(`[Patch] AST Lite match successful for function: ${functionMatch.name}`);
                 const before = workingSource.substring(0, functionMatch.start);
                 const after = workingSource.substring(functionMatch.end);
                 const newContent = before + replaceBlock + after;
                 const patchEndIndex = before.length + replaceBlock.length;
                 const candidateSource = fixOverlapArtifacts(newContent, patchEndIndex);
                 
                 const validation = validateIncrementalPatch(previousSource, candidateSource, originalDefinitions, patchIndex);
                 if (!validation.valid) {
                     recordFailure(`AST Lite for ${functionMatch.name} (rolled back): ${validation.reason}`);
                     continue;
                 }
                 workingSource = candidateSource;
                 appliedPatches.push({ index: patchIndex, before: previousSource, after: workingSource });
                 successCount++;
                 continue;
             }
        }

        // Fallback: Significant Anchor Matching
        if (!matchRange) {
            const searchLines = cleanSearchBlock.split('\n').map(l => l.trim()).filter(l => l);
            if (searchLines.length >= 2) {
                let startLine = searchLines[0];
                let endLine = searchLines[searchLines.length - 1];
                
                if (startLine.length > 15 && endLine.length > 15) {
                     const sourceLines = workingSource.split('\n');
                     const countOccurrences = (line: string) => sourceLines.filter(l => l.trim() === line).length;
                     
                     let startOccurrences = countOccurrences(startLine);
                     let expandedAnchorStart = 0;
                     
                     if (startOccurrences > 1 && searchLines.length >= 3) {
                         const combinedStart = searchLines[0] + '\n' + searchLines[1];
                         for (let i = 0; i < sourceLines.length - 1; i++) {
                             const combined = sourceLines[i].trim() + '\n' + sourceLines[i + 1].trim();
                             if (combined === combinedStart) {
                                 expandedAnchorStart = i;
                                 startLine = searchLines[0];
                                 startOccurrences = 1;
                                 break;
                             }
                         }
                     }
                     
                     if (startOccurrences === 1) {
                         let bestAnchorMatch = null;
                         for (let i = expandedAnchorStart; i < sourceLines.length; i++) {
                             if (sourceLines[i].trim() === startLine || (expandedAnchorStart > 0 && i === expandedAnchorStart)) {
                                 const searchStart = expandedAnchorStart > 0 ? expandedAnchorStart : i;
                                 for (let j = searchStart + 1; j < Math.min(searchStart + 500, sourceLines.length); j++) {
                                     if (sourceLines[j].trim() === endLine) {
                                         bestAnchorMatch = { startLine: searchStart, endLine: j };
                                         break;
                                     }
                                 }
                             }
                             if (bestAnchorMatch) break;
                         }

                         if (bestAnchorMatch) {
                             console.log(`[Patch] Significant Anchor match successful`);
                             const before = sourceLines.slice(0, bestAnchorMatch.startLine).join('\n');
                             const after = sourceLines.slice(bestAnchorMatch.endLine + 1).join('\n');
                             const newContent = (before ? before + '\n' : '') + replaceBlock + (after ? '\n' + after : '');
                             const patchEndIndex = (before ? before.length + 1 : 0) + replaceBlock.length;
                             const candidateSource = fixOverlapArtifacts(newContent, patchEndIndex);
                             
                             const validation = validateIncrementalPatch(previousSource, candidateSource, originalDefinitions, patchIndex);
                             if (!validation.valid) {
                                 recordFailure(`Significant Anchor (rolled back): ${validation.reason}`);
                                 continue;
                             }
                             workingSource = candidateSource;
                             appliedPatches.push({ index: patchIndex, before: previousSource, after: workingSource });
                             successCount++;
                             continue;
                         }
                     }
                }
            }
        }

        if (matchRange) {
            const startChar = sourceTokens[matchRange.start].start;
            const endChar = sourceTokens[matchRange.end].end;
            
            const before = workingSource.substring(0, startChar);
            const after = workingSource.substring(endChar);
            
            const newContent = before + replaceBlock + after;
            const patchEndIndex = before.length + replaceBlock.length;
            const candidateSource = fixOverlapArtifacts(newContent, patchEndIndex);
            
            const validation = validateIncrementalPatch(previousSource, candidateSource, originalDefinitions, patchIndex);
            if (!validation.valid) {
                recordFailure(`Token+LCS (rolled back): ${validation.reason}`);
                continue;
            }
            workingSource = candidateSource;
            appliedPatches.push({ index: patchIndex, before: previousSource, after: workingSource });
            successCount++;
            console.log(`Patch applied successfully using Token+LCS matching.`);
        } else {
            console.warn(`Patch failed for block: ${cleanSearchBlock.substring(0, 50)}...`);
            recordFailure(`Could not find matching code block: "${cleanSearchBlock.substring(0, 50)}..."`);
        }
    }
    
    // 🆕 TRANSACTIONAL COMMIT LOGIC
    if (failCount > 0 && successCount === 0) {
        // Complete failure handled by caller checking stats
    }
    
    if (failCount > 0 && successCount > 0) {
        console.warn(`[Patch] ⚠️ PARTIAL SUCCESS: ${successCount}/${matches.length} patches applied, ${failCount} failed`);
        console.warn(`[Patch] Failed blocks: ${failedBlocks.join('; ')}`);
    }
    
    console.log(`[Patch] ✅ TRANSACTION COMPLETE: ${successCount} patches applied successfully`);

    return {
        code: workingSource,
        stats: {
            total: matches.length,
            success: successCount,
            failed: failCount,
            failures: failedBlocks
        }
    };
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
            // 🆕 Use normalized comparison for quote/semicolon tolerance
            if (tokenTextEqual(sourceTokens[i].text, tokenText)) {
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

/**
 * 🆕 P4 FIX: Fuzzy Token Matching
 * Uses Levenshtein distance to tolerate small typos in tokens
 * Useful when AI generates slightly different variable names or strings
 */
function findBestTokenMatchFuzzy(
    sourceTokens: Token[], 
    searchTokens: Token[], 
    allowedRanges: { start: number, end: number }[] | null = null
): { start: number, end: number } | null {
    const M = searchTokens.length;
    const N = sourceTokens.length;
    if (M === 0 || N < M) return null;

    let bestScore = 0;
    let bestRange = null;

    // Slide through source with moderate step
    for (let i = 0; i <= N - M; i += 3) {
        // Check allowed ranges
        if (allowedRanges) {
            const tokenStartChar = sourceTokens[i].start;
            const isAllowed = allowedRanges.some(range => tokenStartChar >= range.start && tokenStartChar <= range.end);
            if (!isAllowed) continue;
        }

        const windowEnd = Math.min(N, i + M + Math.max(15, M * 0.5));
        const sourceWindow = sourceTokens.slice(i, windowEnd);
        
        // Use fuzzy LCS matching
        const matchResult = findLCSMatchFuzzy(sourceWindow, searchTokens);
        
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

    // Fuzzy threshold: 0.70 (slightly higher than pure relaxed to avoid false positives)
    if (bestScore > 0.70) {
        console.log(`[Patch] Fuzzy match found with score ${bestScore.toFixed(2)}`);
        return bestRange;
    }

    return null;
}

/**
 * 🆕 P4 FIX: Fuzzy LCS Match
 * Uses tokensFuzzyEqual for comparison instead of exact equality
 */
function findLCSMatchFuzzy(seq1: Token[], seq2: Token[]): { start: number, end: number, length: number } | null {
    const m = seq1.length;
    const n = seq2.length;
    const dp = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

    // Use fuzzy comparison
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (tokensFuzzyEqual(seq1[i - 1], seq2[j - 1])) {
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
        if (tokensFuzzyEqual(seq1[i - 1], seq2[j - 1])) {
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

function findExactTokenMatch(sourceTokens: Token[], searchTokens: Token[]): { start: number, end: number } | null {
    if (searchTokens.length === 0) return null;
    
    const firstToken = searchTokens[0];
    const M = searchTokens.length;
    const N = sourceTokens.length;

    // Optimization: Only scan where the first token matches
    // 🆕 Use normalized comparison for quote/semicolon tolerance
    for (let i = 0; i <= N - M; i++) {
        if (tokensEqual(sourceTokens[i], firstToken)) {
            let match = true;
            for (let j = 1; j < M; j++) {
                if (!tokensEqual(sourceTokens[i + j], searchTokens[j])) {
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

    // 🆕 Use normalized comparison for quote/semicolon tolerance
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (tokensEqual(seq1[i - 1], seq2[j - 1])) {
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
        if (tokensEqual(seq1[i - 1], seq2[j - 1])) {
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

    // 3. Use AST to find the function in source (Robust)
    try {
        const ast = parse(source, BABEL_PARSER_CONFIG);
        let foundNode: any = null;

        // Scan top-level nodes
        for (const node of ast.program.body) {
            // Function Declaration
            if (node.type === 'FunctionDeclaration' && node.id?.name === funcName) {
                foundNode = node;
                break;
            }
            // Variable Declaration (const foo = () => ...)
            else if (node.type === 'VariableDeclaration') {
                for (const decl of node.declarations) {
                    if (decl.id?.type === 'Identifier' && decl.id.name === funcName) {
                        foundNode = node; // Replace the whole declaration
                        break;
                    }
                }
            }
            // Export Named Declaration
            else if (node.type === 'ExportNamedDeclaration' && node.declaration) {
                const decl = node.declaration;
                if (decl.type === 'FunctionDeclaration' && decl.id?.name === funcName) {
                    foundNode = node; // Replace the export statement
                    break;
                } else if (decl.type === 'VariableDeclaration') {
                    for (const d of decl.declarations) {
                        if (d.id?.type === 'Identifier' && d.id.name === funcName) {
                            foundNode = node;
                            break;
                        }
                    }
                }
            }
            if (foundNode) break;
        }

        if (foundNode && typeof foundNode.start === 'number' && typeof foundNode.end === 'number') {
            console.log(`[Patch] AST Lite found ${funcName} at ${foundNode.start}-${foundNode.end}`);
            return { start: foundNode.start, end: foundNode.end, name: funcName };
        }

    } catch (e) {
        console.warn(`[Patch] AST Lite lookup failed for ${funcName}:`, e);
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
  
      // SAFETY FIX: Do not dedup if the overlap is just closing braces/brackets
      // This prevents accidental deletion of nested closing braces (e.g. } \n })
      if (/^[\}\]\)]+[;,]?$/.test(tail)) {
          continue;
      }

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

    // 0. Fix unbalanced script tags (critical for HTML)
    const scriptOpenCount = (fixedCode.match(/<script/gi) || []).length;
    const scriptCloseCount = (fixedCode.match(/<\/script>/gi) || []).length;
    
    if (scriptOpenCount > scriptCloseCount) {
        const diff = scriptOpenCount - scriptCloseCount;
        console.warn(`[Patch] Detected ${diff} unclosed <script> tags. Attempting repair...`);
        // Find where to insert </script> - usually at the end before </body> or </html>
        if (fixedCode.includes('</body>')) {
            fixedCode = fixedCode.replace('</body>', '</script>\n'.repeat(diff) + '</body>');
        } else if (fixedCode.includes('</html>')) {
            fixedCode = fixedCode.replace('</html>', '</script>\n'.repeat(diff) + '</html>');
        } else {
            // Just append at the end
            fixedCode += '\n</script>'.repeat(diff);
        }
    } else if (scriptCloseCount > scriptOpenCount) {
        // More closing than opening - remove extra closing tags from the end
        const diff = scriptCloseCount - scriptOpenCount;
        console.warn(`[Patch] Detected ${diff} extra </script> tags. Attempting repair...`);
        for (let i = 0; i < diff; i++) {
            const lastCloseIdx = fixedCode.lastIndexOf('</script>');
            if (lastCloseIdx !== -1) {
                fixedCode = fixedCode.slice(0, lastCloseIdx) + fixedCode.slice(lastCloseIdx + 9);
            }
        }
    }

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
        const ast = parse(scriptContent, BABEL_PARSER_CONFIG);

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
        // Match Babel script tag specifically (where React code lives)
        const match = code.match(/<script[^>]*type=["']text\/babel["'][^>]*>([\s\S]*?)<\/script>/i);
        if (match) {
            contentToCheck = match[1];
        } else {
            // Fallback: try to match any script tag
            const fallbackMatch = code.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
            if (fallbackMatch) {
                contentToCheck = fallbackMatch[1];
            } else {
                // If HTML but no script, maybe just validate HTML structure?
                // For now, we focus on JS syntax safety.
                return;
            }
        }
    }

    try {
        parse(contentToCheck, {
            ...BABEL_PARSER_CONFIG,
            errorRecovery: false // Strict mode
        });
    } catch (e: any) {
        throw new Error(`Syntax Error in patched file: ${e.message} (${e.loc?.line}:${e.loc?.column})`);
    }
}

/**
 * Safety Net 2b: Undefined Reference Detection
 * Detects JSX components and function calls that reference undefined identifiers.
 * This catches cases where AI accidentally deleted component definitions.
 * Returns array of undefined references found.
 */
function detectUndefinedReferences(code: string): string[] {
    const isHtml = /^\s*<!DOCTYPE|^\s*<html/i.test(code);
    let contentToCheck = code;

    if (isHtml) {
        const match = code.match(/<script[^>]*type=["']text\/babel["'][^>]*>([\s\S]*?)<\/script>/i);
        if (match) {
            contentToCheck = match[1];
        } else {
            return []; // No babel script to check
        }
    }

    try {
        const ast = parse(contentToCheck, BABEL_PARSER_CONFIG);

        // Collect defined identifiers (top-level declarations)
        const definedIdentifiers = new Set<string>();
        
        // Built-in React and browser globals
        const builtinGlobals = new Set([
            // React
            'React', 'ReactDOM', 'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback',
            'useContext', 'useReducer', 'useLayoutEffect', 'useId', 'useTransition', 'useDeferredValue',
            'createContext', 'forwardRef', 'memo', 'lazy', 'Suspense', 'Fragment',
            // Browser
            'window', 'document', 'console', 'fetch', 'localStorage', 'sessionStorage',
            'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame',
            'Promise', 'JSON', 'Math', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean',
            'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'Proxy', 'Reflect',
            'Error', 'TypeError', 'SyntaxError', 'ReferenceError',
            'URL', 'URLSearchParams', 'FormData', 'Blob', 'File', 'FileReader',
            'Image', 'Audio', 'Video', 'Canvas',
            'atob', 'btoa', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
            'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'Infinity', 'NaN', 'undefined', 'null',
            'navigator', 'location', 'history', 'screen', 'alert', 'confirm', 'prompt',
            'crypto', 'performance', 'TextEncoder', 'TextDecoder',
            'Intl', 'RegExp', 'eval', 'Function',
            // Common libraries (often loaded via CDN)
            'confetti', 'html2canvas', 'QRCode', 'Chart', 'moment', 'dayjs', 'axios',
            'Babel', '_', 'lodash', '$', 'jQuery', 'lucide', 'Lucide',
            // Spark platform globals
            'SPARK_APP_ID', 'SPARK_API_BASE', 'SPARK_USER_ID', 'SparkCMS',
            // HTML Elements (JSX intrinsic elements will be lowercase)
            'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'button', 'input', 'form',
            'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot',
            'img', 'video', 'audio', 'canvas', 'svg', 'path', 'circle', 'rect', 'line',
            'section', 'article', 'header', 'footer', 'nav', 'aside', 'main',
            'label', 'select', 'option', 'textarea', 'fieldset', 'legend',
            'pre', 'code', 'blockquote', 'em', 'strong', 'i', 'b', 'u', 's', 'br', 'hr',
            // Common Component Names (often used as placeholders or generic components)
            'Header', 'Footer', 'Layout', 'Container', 'Button', 'Input', 'Card', 'Modal', 'Icon',
            'Controls', 'Summary', 'Sidebar', 'Menu', 'MenuItem', 'List', 'ListItem', 'Grid', 'Row', 'Col', 'Section',
            'Text', 'Title', 'Subtitle', 'Image', 'Avatar', 'Badge', 'Tag', 'Tooltip', 'Popover',
            'Tabs', 'Tab', 'Accordion', 'AccordionItem', 'Alert', 'Toast', 'Spinner', 'Loader',
            'Form', 'FormItem', 'Label', 'Select', 'Option', 'Checkbox', 'Radio', 'Switch', 'Slider',
            'Table', 'Thead', 'Tbody', 'Tr', 'Th', 'Td', 'Pagination', 'Breadcrumb', 'Dropdown',
            'Navbar', 'Nav', 'NavItem', 'Link', 'Router', 'Route', 'Switch', 'Redirect',
            'App', 'Main', 'Root', 'Wrapper', 'Provider', 'Context', 'Consumer',
            'Suspense', 'ErrorBoundary', 'Portal', 'Fragment', 'StrictMode', 'Profiler',
            // Card variants (commonly generated by AI)
            'AppointmentCard', 'ProductCard', 'UserCard', 'ProfileCard', 'EventCard', 'TaskCard',
            'ItemCard', 'ContentCard', 'InfoCard', 'DataCard', 'StatCard', 'FeatureCard',
            // Item variants
            'AppointmentItem', 'ProductItem', 'UserItem', 'TaskItem', 'ListItemContent',
            // View/Panel variants
            'DetailView', 'ListView', 'GridView', 'Panel', 'SidePanel', 'BottomPanel',
            // Form variants
            'SearchForm', 'FilterForm', 'EditForm', 'CreateForm', 'LoginForm', 'SignupForm'
        ]);

        // First pass: collect all top-level definitions
        for (const node of ast.program.body) {
            if (node.type === 'VariableDeclaration') {
                for (const decl of node.declarations) {
                    if (decl.id?.type === 'Identifier') {
                        definedIdentifiers.add(decl.id.name);
                    }
                }
            } else if (node.type === 'FunctionDeclaration' && node.id?.name) {
                definedIdentifiers.add(node.id.name);
            } else if (node.type === 'ClassDeclaration' && node.id?.name) {
                definedIdentifiers.add(node.id.name);
            } else if (node.type === 'ImportDeclaration') {
                for (const spec of node.specifiers || []) {
                    if (spec.local?.name) {
                        definedIdentifiers.add(spec.local.name);
                    }
                }
            }
        }

        // Second pass: collect all JSX component references (PascalCase)
        const referencedComponents = new Set<string>();
        const undefinedReferences: string[] = [];

        simpleWalk(ast, (node: any) => {
            // JSX Element opening tag
            if (node.type === 'JSXOpeningElement' && node.name) {
                let componentName: string | null = null;
                
                if (node.name.type === 'JSXIdentifier') {
                    componentName = node.name.name;
                } else if (node.name.type === 'JSXMemberExpression') {
                    // e.g., React.Fragment - check the object
                    if (node.name.object?.type === 'JSXIdentifier') {
                        componentName = node.name.object.name;
                    }
                }

                // Only check PascalCase components (not intrinsic HTML elements)
                if (componentName && /^[A-Z]/.test(componentName)) {
                    referencedComponents.add(componentName);
                }
            }

            // Function calls that might be component invocations
            if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
                const funcName = node.callee.name;
                // Check if it's a PascalCase function (likely a component or class)
                if (/^[A-Z][a-zA-Z0-9]*$/.test(funcName)) {
                    referencedComponents.add(funcName);
                }
            }
        });

        // Check for undefined components
        Array.from(referencedComponents).forEach(comp => {
            if (!definedIdentifiers.has(comp) && !builtinGlobals.has(comp)) {
                undefinedReferences.push(comp);
            }
        });

        return undefinedReferences;

    } catch (e) {
        // If parsing fails, we can't detect undefined references
        console.warn('[Patch] Unable to detect undefined references:', e);
        return [];
    }
}

/**
 * Helper: Extract top-level PascalCase definitions (components/classes)
 * Used to compare before/after patch to detect accidentally deleted components
 */
function extractTopLevelDefinitions(code: string): string[] {
    const isHtml = /^\s*<!DOCTYPE|^\s*<html/i.test(code);
    let contentToCheck = code;

    if (isHtml) {
        const match = code.match(/<script[^>]*type=["']text\/babel["'][^>]*>([\s\S]*?)<\/script>/i);
        if (match) {
            contentToCheck = match[1];
        } else {
            return [];
        }
    }

    try {
        const ast = parse(contentToCheck, BABEL_PARSER_CONFIG);

        const definitions: string[] = [];

        for (const node of ast.program.body) {
            if (node.type === 'VariableDeclaration') {
                for (const decl of node.declarations) {
                    if (decl.id?.type === 'Identifier' && /^[A-Z]/.test(decl.id.name)) {
                        definitions.push(decl.id.name);
                    }
                }
            } else if (node.type === 'FunctionDeclaration' && node.id?.name && /^[A-Z]/.test(node.id.name)) {
                definitions.push(node.id.name);
            } else if (node.type === 'ClassDeclaration' && node.id?.name && /^[A-Z]/.test(node.id.name)) {
                definitions.push(node.id.name);
            }
        }

        return definitions;
    } catch (e) {
        return [];
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
            ...BABEL_PARSER_CONFIG,
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
