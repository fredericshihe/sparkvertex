import * as ts from 'typescript';
import * as path from 'path';

export interface ImportInfo {
  moduleSpecifier: string; // 例如 './components/Button'
  isTypeOnly: boolean;     // 是否是 import type
  defaultImport?: string;  // 例如 import React from ...
  namedImports: string[];  // 例如 import { useState, useEffect } ...
  namespaceImport?: string; // 例如 import * as utils from ...
}

export interface ExportInfo {
  name: string;
  isDefault: boolean;
  isTypeOnly: boolean;
}

export interface DependencyAnalysis {
  imports: ImportInfo[];
  exports: ExportInfo[];
  valueDependencies: string[];  // 实际值依赖（排除纯类型）
  typeDependencies: string[];   // 纯类型依赖
  localReferences: string[];    // 本地引用的标识符
  parseErrors?: string[];       // 解析过程中的错误（用于调试）
}

/**
 * 安全地执行 AST 遍历，捕获任何节点解析错误
 * 保证即使代码有语法错误也能优雅降级
 */
function safeVisit(node: ts.Node, visitor: (node: ts.Node) => void): void {
  try {
    visitor(node);
    ts.forEachChild(node, (child) => safeVisit(child, visitor));
  } catch (error) {
    // 记录错误但继续遍历其他节点
    console.warn(`[AST Parser] Error visiting node at pos ${node.pos}: ${error}`);
  }
}

/**
 * 解析代码并提取所有导入信息
 * 
 * ⚠️ 容错处理：即使代码有语法错误，TypeScript Parser 也会尽力解析
 * 返回能解析出的部分，不会中断整个流程
 */
export function parseImports(code: string, filePath: string = 'file.tsx'): ImportInfo[] {
  try {
    const sourceFile = ts.createSourceFile(
      filePath,
      code,
      ts.ScriptTarget.Latest,
      true
    );

    const imports: ImportInfo[] = [];

    const visit = (node: ts.Node): void => {
      try {
        if (ts.isImportDeclaration(node)) {
          const moduleSpecifier = node.moduleSpecifier;
          
          if (ts.isStringLiteral(moduleSpecifier)) {
            const importInfo: ImportInfo = {
              moduleSpecifier: moduleSpecifier.text,
              isTypeOnly: node.importClause?.isTypeOnly ?? false,
              namedImports: []
            };

            const importClause = node.importClause;
            if (importClause) {
              // Default import: import React from 'react'
              if (importClause.name) {
                importInfo.defaultImport = importClause.name.text;
              }

              // Named bindings
              const namedBindings = importClause.namedBindings;
              if (namedBindings) {
                // Namespace import: import * as utils from './utils'
                if (ts.isNamespaceImport(namedBindings)) {
                  importInfo.namespaceImport = namedBindings.name.text;
                }
                // Named imports: import { useState, useEffect } from 'react'
                else if (ts.isNamedImports(namedBindings)) {
                  for (const element of namedBindings.elements) {
                    // 检查单个 named import 是否是 type-only
                    // e.g., import { type User, Button } from './types'
                    if (!element.isTypeOnly) {
                      importInfo.namedImports.push(element.name.text);
                    }
                  }
                }
              }
            }

            imports.push(importInfo);
          }
        }
      } catch (nodeError) {
        console.warn(`[AST Parser] Error parsing import node: ${nodeError}`);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return imports;
  } catch (error) {
    console.error(`[AST Parser] Fatal error parsing imports, returning empty array: ${error}`);
    return [];
  }
}

/**
 * 解析代码并提取依赖，过滤掉纯类型引用
 * 这是主要的 API，用于替换 code-rag.ts 中的正则逻辑
 * 
 * ⚠️ 容错处理：即使代码有语法错误也能返回已解析的部分
 */
export function analyzeDependencies(code: string, filePath: string = 'file.tsx'): string[] {
  try {
    const imports = parseImports(code, filePath);
    const dependencies: string[] = [];

    for (const imp of imports) {
      // 跳过纯 type-only 导入
      if (imp.isTypeOnly) {
        continue;
      }

      // 只保留相对路径（本地文件依赖）
      if (imp.moduleSpecifier.startsWith('.')) {
        // 检查是否有实际的值导入（不仅仅是类型）
        const hasValueImport = 
          imp.defaultImport !== undefined ||
          imp.namespaceImport !== undefined ||
          imp.namedImports.length > 0;

        if (hasValueImport) {
          dependencies.push(imp.moduleSpecifier);
        }
      }
    }

    return dependencies;
  } catch (error) {
    console.error(`[AST Parser] Error analyzing dependencies, returning empty array: ${error}`);
    return [];
  }
}

/**
 * 完整的依赖分析，包括类型和值的区分
 * 
 * ⚠️ 容错处理：所有节点遍历都包裹在 try-catch 中
 */
export function analyzeFullDependencies(code: string, filePath: string = 'file.tsx'): DependencyAnalysis {
  const parseErrors: string[] = [];
  
  // 默认返回值（用于错误情况）
  const emptyResult: DependencyAnalysis = {
    imports: [],
    exports: [],
    valueDependencies: [],
    typeDependencies: [],
    localReferences: [],
    parseErrors
  };

  try {
    const sourceFile = ts.createSourceFile(
      filePath,
      code,
      ts.ScriptTarget.Latest,
      true
    );

    const imports = parseImports(code, filePath);
    const exports: ExportInfo[] = [];
    const valueDependencies: string[] = [];
    const typeDependencies: string[] = [];
    const localReferences: string[] = [];

    // 分类依赖
    for (const imp of imports) {
      if (!imp.moduleSpecifier.startsWith('.')) continue;

      if (imp.isTypeOnly) {
        typeDependencies.push(imp.moduleSpecifier);
      } else if (
        imp.defaultImport !== undefined ||
        imp.namespaceImport !== undefined ||
        imp.namedImports.length > 0
      ) {
        valueDependencies.push(imp.moduleSpecifier);
      }
    }

    // 解析导出（带容错）
    const visitExports = (node: ts.Node): void => {
      try {
        // export default
        if (ts.isExportAssignment(node)) {
          exports.push({
            name: 'default',
            isDefault: true,
            isTypeOnly: false
          });
        }
        // export { ... } 或 export const/function/class
        else if (ts.isExportDeclaration(node)) {
          const isTypeOnly = node.isTypeOnly ?? false;
          const exportClause = node.exportClause;
          
          if (exportClause && ts.isNamedExports(exportClause)) {
            for (const element of exportClause.elements) {
              exports.push({
                name: element.name.text,
                isDefault: false,
                isTypeOnly: isTypeOnly || element.isTypeOnly
              });
            }
          }
        }
        // export const X = ... / export function X() ...
        else if (
          (ts.isVariableStatement(node) || 
           ts.isFunctionDeclaration(node) || 
           ts.isClassDeclaration(node)) &&
          node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
        ) {
          if (ts.isVariableStatement(node)) {
            for (const decl of node.declarationList.declarations) {
              if (ts.isIdentifier(decl.name)) {
                exports.push({
                  name: decl.name.text,
                  isDefault: false,
                  isTypeOnly: false
                });
              }
            }
          } else if (ts.isFunctionDeclaration(node) && node.name) {
            exports.push({
              name: node.name.text,
              isDefault: false,
              isTypeOnly: false
            });
          } else if (ts.isClassDeclaration(node) && node.name) {
            exports.push({
              name: node.name.text,
              isDefault: false,
              isTypeOnly: false
            });
          }
        }
        // export type / export interface
        else if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) {
          if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
            exports.push({
              name: node.name.text,
              isDefault: false,
              isTypeOnly: true
            });
          }
        }
      } catch (nodeError) {
        parseErrors.push(`Export parse error at pos ${node.pos}: ${nodeError}`);
      }

      ts.forEachChild(node, visitExports);
    };

    visitExports(sourceFile);

    // 提取本地标识符引用（用于更高级的分析）
    const collectIdentifiers = (node: ts.Node): void => {
      try {
        if (ts.isIdentifier(node)) {
          const parent = node.parent;
          // 排除声明和属性访问
          if (!ts.isVariableDeclaration(parent) && 
              !ts.isFunctionDeclaration(parent) &&
              !ts.isPropertyAccessExpression(parent)) {
            localReferences.push(node.text);
          }
        }
      } catch (nodeError) {
        parseErrors.push(`Identifier collect error: ${nodeError}`);
      }
      ts.forEachChild(node, collectIdentifiers);
    };

    // collectIdentifiers(sourceFile); // 可选：开启会收集大量引用

    return {
      imports,
      exports,
      valueDependencies: Array.from(new Set(valueDependencies)),
      typeDependencies: Array.from(new Set(typeDependencies)),
      localReferences: Array.from(new Set(localReferences)),
      parseErrors: parseErrors.length > 0 ? parseErrors : undefined
    };
  } catch (error) {
    console.error(`[AST Parser] Fatal error in analyzeFullDependencies: ${error}`);
    return {
      ...emptyResult,
      parseErrors: [`Fatal error: ${error}`]
    };
  }
}

/**
 * 解析模块路径为绝对路径
 */
export function resolveModulePath(
  importPath: string, 
  currentFilePath: string,
  extensions: string[] = ['.ts', '.tsx', '.js', '.jsx', '']
): string {
  const dir = path.dirname(currentFilePath);
  const resolved = path.resolve(dir, importPath);
  
  // 如果已经有扩展名，直接返回
  if (extensions.some(ext => ext && importPath.endsWith(ext))) {
    return resolved;
  }
  
  // 尝试添加扩展名（在实际使用中需要检查文件是否存在）
  return resolved;
}

/**
 * 从代码中提取所有组件名（PascalCase 的函数/变量声明）
 */
export function extractComponentNames(code: string, filePath: string = 'file.tsx'): string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    code,
    ts.ScriptTarget.Latest,
    true
  );

  const components: string[] = [];
  const pascalCaseRegex = /^[A-Z][a-zA-Z0-9]*$/;

  function visit(node: ts.Node) {
    // const ComponentName = () => {} 或 const ComponentName = function() {}
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const name = node.name.text;
      if (pascalCaseRegex.test(name)) {
        // 检查是否是函数表达式或箭头函数
        const initializer = node.initializer;
        if (initializer && (
          ts.isArrowFunction(initializer) ||
          ts.isFunctionExpression(initializer) ||
          (ts.isCallExpression(initializer) && 
           ts.isIdentifier(initializer.expression) &&
           ['memo', 'forwardRef', 'React.memo', 'React.forwardRef'].includes(initializer.expression.text))
        )) {
          components.push(name);
        }
      }
    }
    // function ComponentName() {}
    else if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      if (pascalCaseRegex.test(name)) {
        components.push(name);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return components;
}

/**
 * 提取 JSX 中使用的组件（用于依赖分析）
 */
export function extractJSXComponents(code: string, filePath: string = 'file.tsx'): string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    code,
    ts.ScriptTarget.Latest,
    true
  );

  const usedComponents: Set<string> = new Set();
  const pascalCaseRegex = /^[A-Z]/;

  function visit(node: ts.Node) {
    // JSX Element: <ComponentName ...>
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName;
      if (ts.isIdentifier(tagName)) {
        const name = tagName.text;
        // 只收集 PascalCase（自定义组件），排除 HTML 标签
        if (pascalCaseRegex.test(name)) {
          usedComponents.add(name);
        }
      }
      // 处理 Member Expression: <Namespace.Component />
      else if (ts.isPropertyAccessExpression(tagName)) {
        if (ts.isIdentifier(tagName.expression)) {
          usedComponents.add(tagName.expression.text);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return Array.from(usedComponents);
}
