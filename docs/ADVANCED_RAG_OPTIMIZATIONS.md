# 🚀 Advanced RAG Optimizations

## 概述

本次更新实现了三个前沿的 RAG 优化方向：

| 优化方向 | 状态 | 效果 |
|---------|------|------|
| Semantic Cache (语义缓存) | ✅ 已实现 | 相同/相似请求复用结果，节省 DeepSeek 调用 |
| Program Slicing (程序切片) | ✅ 已实现 | 代码压缩率可达 1%，零噪声提取 |
| Reflection Agent (反思代理) | ✅ 已实现 | 自动检测语法/引用错误 |

---

## 1. Semantic Cache (语义缓存)

### 问题
之前的 L1 Cache 基于 Prompt 精确匹配。用户换个说法问同一个问题，缓存就失效了。

### 方案
基于 n-gram Jaccard 相似度的文本缓存，不需要 embedding API 调用。

### 实现
- **文件**: `lib/advanced-rag.ts`
- **集成点**: `lib/intent-classifier.ts` → `classifyIntentWithDeepSeek()`

### 工作流程
```
用户: "增加难度分级"
     ↓
[TextCache] 查询 n-gram 相似度
     ↓
用户: "添加 difficulty levels" (5分钟后)
     ↓
[TextCache] 🔍 Similarity hit (78.5%)
     ↓
直接返回缓存的 Intent + File List
```

### 配置
```typescript
TEXT_CACHE_CONFIG = {
    maxSize: 200,              // 最大缓存条目
    defaultTTL: 30 * 60 * 1000, // 30 分钟 TTL
    similarityThreshold: 0.75,  // 75% 相似度阈值
    ngramSize: 3               // 3-gram
}
```

---

## 2. Program Slicing (程序切片)

### 问题
即使 App.js 有 2000 行，只改 1 个函数，依然发送全量代码，浪费 Token。

### 方案
静态程序切片 (Static Program Slicing)：
- 构建数据流图 (Data Flow Graph)
- 计算 backward slice (影响目标的) 和 forward slice (被目标影响的)
- 只提取相关代码行

### 实现
- **文件**: `lib/advanced-rag.ts`
- **核心函数**:
  - `buildDataFlowGraph()` - 构建变量定义-使用关系图
  - `computeProgramSlice()` - 计算程序切片
  - `extractTargetFromRequest()` - 从用户请求提取目标变量

### 示例
```typescript
// 用户: "修复 mediumQuestions 变量"

const slice = computeProgramSlice(code, 'mediumQuestions', 'both');
// 返回:
// - targetVariable: 'mediumQuestions'
// - dependencies: ['allQuestions', 'difficultyLevels']
// - dependents: ['renderQuestion', 'scoreCalculator']
// - relevantLines: [23, 45, 67, 89, 120]
// - compressionRatio: 0.012 (1.2% of original!)
```

### 日志输出
```
[ProgramSlicing] 🔪 Computing slice for "mediumQuestions" (both)
[ProgramSlicing] ✅ Slice computed:
  - Target: mediumQuestions
  - Dependencies: allQuestions, difficultyLevels
  - Dependents: renderQuestion, scoreCalculator
  - Compression: 1.2% of original
```

---

## 3. Reflection Agent (反思代理)

### 问题
生成的代码可能有语法错误或引用未定义变量，但系统"瞎了"，无法检测。

### 方案
补丁应用后，自动运行静态检查：
1. **语法检查** - 使用 Babel 解析验证
2. **引用检查** - 检测未定义的变量

### 实现
- **文件**: `lib/advanced-rag.ts`
- **集成点**: `lib/self-repair.ts` → `applyPatchesWithSelfRepair()`

### 检查流程
```
补丁应用成功
     ↓
[Reflection] 🔍 Running checks...
     ↓
语法检查 (Babel Parse)
     ↓
引用检查 (Identifier Analysis)
     ↓
[Reflection] ✅ All checks passed
     或
[Reflection] ❌ Found 2 errors:
  - Line 45: 'mediumQuestions' is not defined
  - Line 67: Syntax error: Unexpected token
```

### 内置白名单
自动排除 React、浏览器 API、常用库的全局变量：
- React hooks: `useState`, `useEffect`, etc.
- Browser APIs: `window`, `document`, `fetch`, etc.
- Common libs: `axios`, `lodash`, `moment`, etc.

---

## 使用方式

### 1. 语义缓存（自动集成）
Intent Classifier 自动查询和存储缓存，无需手动调用。

### 2. 程序切片（按需调用）
```typescript
import { computeProgramSlice, extractTargetFromRequest } from '@/lib/advanced-rag';

// 从用户请求提取目标
const targets = extractTargetFromRequest("修复 mediumQuestions 变量");
// ['mediumQuestions']

// 计算切片
const slice = computeProgramSlice(fullCode, targets[0], 'both');
console.log(slice.code); // 只包含相关代码
console.log(slice.compressionRatio); // 压缩比
```

### 3. 反思检查（自动集成）
Self-Repair 流程自动在补丁成功后运行检查。

手动调用：
```typescript
import { runReflectionCheck } from '@/lib/advanced-rag';

const result = runReflectionCheck(generatedCode);
if (!result.passed) {
    console.log('Errors:', result.errors);
    console.log('Suggestions:', result.suggestions);
}
```

---

## 性能预期

| 指标 | 优化前 | 优化后 |
|-----|-------|-------|
| 相似请求延迟 | 6s (DeepSeek) | ~0ms (缓存) |
| 上下文压缩率 | 5.6% | 1-2% (切片) |
| 代码错误率 | 需手动检查 | 自动检测 |
| DeepSeek 调用 | 每次请求 | 缓存命中时跳过 |

---

## 后续优化方向

### 短期
1. **Speculative Routing** - 根据历史数据预测用户意图，预加载结果
2. **增量切片** - 只在代码变更时重新计算相关部分

### 中期
1. **GraphRAG 增强** - 结合依赖图扩展上下文
2. **多跳推理** - 自动追踪跨文件依赖

### 长期
1. **Tree-sitter 集成** - 更精确的 CFG/DFG 分析
2. **仓库级记忆** - 学习用户偏好，自动添加约束
