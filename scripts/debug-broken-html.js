const fs = require('fs');
const { parse } = require('@babel/parser');

const html = fs.readFileSync('/Users/shihe/Downloads/spark-app-1765366662511.html', 'utf8');

// 提取 Babel script 内容
const match = html.match(/<script[^>]*type=["']text\/babel["'][^>]*>([\s\S]*?)<\/script>/i);
if (!match) {
  console.log('No Babel script found');
  process.exit(1);
}

const code = match[1];
console.log('Code length:', code.length);

// 模拟 validateWholeFileOrThrow 行为
console.log('\n=== Testing validateWholeFileOrThrow simulation ===');
try {
  parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
    errorRecovery: false
  });
  console.log('✅ Syntax validation passed');
} catch (e) {
  console.log('❌ Syntax Error:', e.message);
  console.log('   Location: line', e.loc?.line, 'column', e.loc?.column);
  console.log('\n⚠️ This error would trigger safety net rollback in patch.ts');
  
  // 显示错误位置附近的代码
  const lines = code.split('\n');
  const errorLine = e.loc?.line || 1;
  console.log('\n=== ERROR CONTEXT ===');
  for (let i = Math.max(0, errorLine - 6); i < Math.min(lines.length, errorLine + 3); i++) {
    const marker = i === errorLine - 1 ? '>>> ' : '    ';
    console.log(`${marker}${i + 1}: ${lines[i]}`);
  }
}

try {
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['jsx'],
    errorRecovery: false  // Disable to see exact error
  });
  
  console.log('\n=== TOP LEVEL DECLARATIONS ===');
  const defs = [];
  for (const node of ast.program.body) {
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations) {
        if (decl.id?.name && /^[A-Z]/.test(decl.id.name)) {
          defs.push(decl.id.name);
        }
      }
    } else if (node.type === 'FunctionDeclaration' && node.id?.name) {
      defs.push(node.id.name);
    } else if (node.type === 'ClassDeclaration' && node.id?.name) {
      defs.push(node.id.name);
    }
  }
  console.log('Defined PascalCase:', defs);
  
  // 检查引用
  console.log('\n=== JSX REFERENCES ===');
  const refs = new Set();
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'JSXOpeningElement' && node.name?.type === 'JSXIdentifier') {
      const name = node.name.name;
      if (/^[A-Z]/.test(name)) refs.add(name);
    }
    for (const key in node) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === 'object' && child.type) walk(child);
    }
  }
  walk(ast);
  console.log('Referenced Components:', Array.from(refs));
  
  // 找出未定义的
  const builtins = new Set(['React', 'ReactDOM', 'ErrorBoundary']);
  const undefinedComps = Array.from(refs).filter(r => !defs.includes(r) && !builtins.has(r));
  console.log('\n🚨 UNDEFINED COMPONENTS:', undefinedComps);
  
  if (undefinedComps.length > 0) {
    console.log('\n⚠️ These components are REFERENCED but NOT DEFINED!');
    console.log('This is why the app shows a white screen.');
  }
  
} catch (e) {
  console.log('Parse error:', e.message);
  
  // 显示错误位置附近的代码
  if (e.loc) {
    const lines = code.split('\n');
    const errorLine = e.loc.line;
    console.log('\n=== ERROR CONTEXT (lines', Math.max(1, errorLine - 10), '-', Math.min(lines.length, errorLine + 5), ') ===');
    for (let i = Math.max(0, errorLine - 11); i < Math.min(lines.length, errorLine + 5); i++) {
      const marker = i === errorLine - 1 ? '>>> ' : '    ';
      console.log(`${marker}${i + 1}: ${lines[i]}`);
    }
  }
}
