# Gemini 隐式缓存实现策略

## 概述
本项目已实现 Gemini API 的隐式缓存优化，可节省约 **90%** 的重复 token 成本。

参考文档：https://ai.google.dev/gemini-api/docs/caching?hl=zh-cn&lang=python#implicit-caching

## 🆕 多级缓存架构 (2025-12-14 新增)

### 缓存层级

```
┌─────────────────────────────────────────────────────────────────────┐
│  L1: 系统提示词缓存 (System Prompt Cache)                            │
│  ├── 范围: 跨所有用户共享                                            │
│  ├── TTL: 永久 (内存中)                                             │
│  ├── 内容: 意图分类器 Prompt / 代码生成器 Prompt                      │
│  └── 节省: ~2000-3000 tokens/请求                                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  L2: 项目骨架缓存 (Project Skeleton Cache)                           │
│  ├── 范围: 单个项目                                                  │
│  ├── TTL: 10 分钟                                                   │
│  ├── 内容: 组件签名 / 类型定义 / 常量列表                              │
│  └── 节省: ~500-2000 tokens/请求                                    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  L3: 会话上下文缓存 (Session Context Cache)                          │
│  ├── 范围: 单个用户会话                                              │
│  ├── TTL: 5 分钟                                                    │
│  ├── 内容: 当前代码完整内容                                          │
│  └── 节省: ~3000-10000 tokens/请求 (连续修改时)                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 核心文件

- `lib/prompt-cache.ts`: 多级缓存核心模块
- `lib/intent-classifier.ts`: L1 缓存集成 (系统提示词)
- `app/api/generate/route.ts`: 缓存统计日志

## 隐式缓存工作原理

Gemini 会自动缓存满足以下条件的内容：
1. **长度要求**：内容 > 1024 tokens
2. **重复使用**：相同内容在多次请求中出现
3. **位置要求**：放在 messages 数组的前面部分
4. **模型一致**：使用相同的 model 参数

缓存内容按 FIFO 策略管理，有效期约 5-60 分钟。

## 实现策略

### 1. 系统提示词优化（System Prompt）

**位置**：`app/create/page.tsx` 第 1151-1350 行

**设计原则**：
- 系统提示词保持 **稳定且足够长**（>1024 tokens）
- 包含完整的技术约束、示例、最佳实践
- 在所有请求中保持一致，不动态修改

**两种模式**：

1. **修改模式（Diff Mode）**：
   - 详细的代码修改指南
   - 包含 3 个完整示例
   - SEARCH/REPLACE 格式说明
   - 错误预防清单
   - 预计 ~2000 tokens

2. **创建模式（Full Generation）**：
   - React 18 + Tailwind 完整开发指南
   - CDN 库列表和用法
   - HTML 模板结构
   - ErrorBoundary 实现
   - 质量检查清单
   - 预计 ~2500 tokens

**优势**：
- 系统提示词在多次修改中完全一致
- Gemini 自动缓存后，每次请求节省 ~2000-2500 tokens 成本

### 2. User Prompt 结构优化

**位置**：`app/create/page.tsx` `constructPrompt` 函数（第 695-745 行）

**修改模式的 Prompt 结构**：
```
# EXISTING CODE (for context)
```html
[完整的现有代码 - 5000-30000 tokens]
```

# USER REQUEST
[用户的修改需求 - 50-200 tokens]

# TASK
[任务说明 - 100 tokens]
```

**关键设计**：
1. **现有代码放在前面**：
   - 在用户进行多次迭代修改时（如调整颜色、修改布局等）
   - 现有代码部分保持相对稳定
   - Gemini 会识别并缓存这部分内容

2. **用户请求放在后面**：
   - 每次修改的具体需求不同
   - 不会被缓存（也不需要缓存）

**缓存效果**：
- 第一次修改：无缓存，计费 ~7000 tokens（系统提示词 2000 + 代码 5000）
- 第二次修改：缓存命中，计费 ~200 tokens（仅用户请求）
- **节省率**：~97%（7000 → 200）

### 3. Edge Function API 调用

**位置**：`supabase/functions/generate-app-async/index.ts` 第 135-155 行

**实现细节**：
```typescript
const messages = [
    { role: 'system', content: finalSystemPrompt },  // 稳定，会被缓存
    { role: 'user', content: String(user_prompt) }   // 变化，不缓存
];

const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${googleApiKey}`
    },
    body: JSON.stringify({
        model: modelName,        // 保持一致，确保缓存命中
        max_tokens: 65536,
        messages: messages,
        stream: true
    })
});
```

**注意事项**：
- ✅ 使用固定的 `model` 参数（`gemini-3-pro-preview`）
- ✅ `system` message 在所有请求中保持一致
- ✅ `user` message 包含变化的内容（代码 + 请求）
- ❌ 不要动态修改系统提示词
- ❌ 不要频繁切换模型

### 4. 缓存监控

**位置**：`supabase/functions/generate-app-async/index.ts` 第 320-335 行

**监控代码**：
```typescript
if (data.usage_metadata) {
    const usage = data.usage_metadata;
    const cachedTokens = usage.cached_content_token_count || 0;
    const totalPromptTokens = usage.prompt_token_count || 0;
    const cacheHitRate = totalPromptTokens > 0 ? (cachedTokens / totalPromptTokens * 100).toFixed(1) : '0';
    
    console.log(`🚀 Implicit Cache Stats: ${cachedTokens}/${totalPromptTokens} tokens cached (${cacheHitRate}% hit rate)`);
    
    if (cachedTokens > 0) {
        console.log(`✅ Cache hit! Saved ${cachedTokens} tokens (~${(cachedTokens * 0.0001).toFixed(2)} credits)`);
    }
}
```

**日志示例**：
```
🚀 Implicit Cache Stats: 2048/7234 tokens cached (28.3% hit rate)
✅ Cache hit! Saved 2048 tokens (~0.20 credits)
```

## 成本节省计算

### 场景 1：用户创建一个应用并进行 5 次修改

**无缓存情况**：
- 创建：3000 tokens × $0.0001 = $0.30
- 修改 1：7000 tokens × $0.0001 = $0.70
- 修改 2：7000 tokens × $0.0001 = $0.70
- 修改 3：7000 tokens × $0.0001 = $0.70
- 修改 4：7000 tokens × $0.0001 = $0.70
- 修改 5：7000 tokens × $0.0001 = $0.70
- **总计**：$3.80

**有缓存情况**：
- 创建：3000 tokens × $0.0001 = $0.30
- 修改 1：7000 tokens × $0.0001 = $0.70（建立缓存）
- 修改 2：200 tokens × $0.0001 = $0.02（缓存命中 97%）
- 修改 3：200 tokens × $0.0001 = $0.02
- 修改 4：200 tokens × $0.0001 = $0.02
- 修改 5：200 tokens × $0.0001 = $0.02
- **总计**：$1.08

**节省**：$2.72（**71% 成本降低**）

### 场景 2：10 个用户同时编辑不同项目

由于系统提示词在所有用户间共享且完全一致：
- 第一个用户的请求建立缓存
- 后续 9 个用户的系统提示词部分全部命中缓存
- **每个用户节省**：~2000 tokens
- **总节省**：18000 tokens ≈ $1.80

## 最佳实践

### ✅ DO（推荐）

1. **保持系统提示词稳定**
   - 不要基于用户输入动态修改
   - 不要添加时间戳或随机内容
   - 不要频繁更新提示词版本

2. **优化 User Prompt 结构**
   - 将稳定内容（代码）放在前面
   - 将变化内容（请求）放在后面
   - 使用清晰的分隔符

3. **使用固定模型**
   - 在生产环境锁定模型版本
   - 避免在 A/B 测试中频繁切换

4. **监控缓存效果**
   - 定期检查日志中的缓存命中率
   - 如果命中率 < 50%，检查提示词是否过于动态

### ❌ DON'T（避免）

1. **不要动态修改系统提示词**
   ```typescript
   // ❌ 错误示例
   const SYSTEM_PROMPT = `You are an AI. Current time: ${new Date()}`;
   
   // ✅ 正确示例
   const SYSTEM_PROMPT = `You are an AI assistant.`;
   ```

2. **不要在 User Prompt 前面添加频繁变化的内容**
   ```typescript
   // ❌ 错误示例
   const userPrompt = `Session ID: ${sessionId}\n\n${actualRequest}`;
   
   // ✅ 正确示例
   const userPrompt = `${actualRequest}\n\n(Session: ${sessionId})`;
   ```

3. **不要频繁切换模型**
   ```typescript
   // ❌ 错误示例
   const model = Math.random() > 0.5 ? 'gemini-3-pro-preview' : 'gemini-2.5-pro';
   
   // ✅ 正确示例
   const model = 'gemini-3-pro-preview'; // 固定
   ```

## 调试与验证

### 查看缓存命中情况

1. **查看 Supabase Edge Function 日志**：
   ```bash
   supabase functions logs generate-app-async
   ```

2. **关键日志指标**：
   - `🚀 Implicit Cache Stats`: 缓存统计
   - `✅ Cache hit!`: 缓存命中
   - `cached_content_token_count`: 缓存的 token 数量

### 验证缓存效果

1. **测试流程**：
   - 创建一个应用
   - 进行第一次修改（如改颜色）
   - 立即进行第二次修改（如改文字）
   - 检查第二次修改的日志

2. **预期结果**：
   - 第一次修改：`cached_content_token_count = 0`
   - 第二次修改：`cached_content_token_count > 2000`
   - 缓存命中率：> 80%

## 未来优化方向

1. **显式缓存（Explicit Caching）**
   - 对于超长代码（>30k tokens），可考虑使用显式缓存 API
   - 更精细的缓存控制和更长的缓存时间

2. **多级缓存策略**
   - 系统提示词（Level 1）：永久缓存
   - 代码模板（Level 2）：项目级缓存
   - 现有代码（Level 3）：会话级缓存

3. **缓存预热**
   - 在系统启动时预加载常用提示词
   - 为高频用户预建缓存

## 相关文件

- `app/create/page.tsx`: 系统提示词定义和 Prompt 构造
- `supabase/functions/generate-app-async/index.ts`: API 调用和缓存监控
- `lib/patch.ts`: Diff 模式的补丁应用逻辑

## 更新日志

- **2025-01-XX**: 进一步优化 User Prompt 缓存结构
  - 重新排序 User Prompt 内容，严格按稳定性递减排列：
    1. EXISTING CODE（最稳定，连续修改时不变）
    2. FIXED INSTRUCTIONS（固定模板）
    3. CONVERSATION HISTORY（增量增长）
    4. USER REQUEST（每次都变，放最后）
  - 将任务说明模板化，合并到 TASK INSTRUCTIONS 部分
  - 添加代码注释说明缓存优化策略

- **2025-12-04**: 初始实现隐式缓存策略
  - 重构系统提示词为长格式（>2000 tokens）
  - 优化 User Prompt 结构（代码在前，请求在后）
  - 添加缓存命中监控日志
