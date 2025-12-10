// ============================================
// SparkVertex CMS Content Viewer Template
// 公开内容查看组件
// ============================================

export const CMS_VIEWER_TEMPLATE = `
// ============================================
// SparkVertex CMS Content Viewer
// 从云端获取并展示公开发布的内容
// ============================================

class SparkCMSViewer {
  constructor(apiBase = '') {
    this.apiBase = apiBase || window.location.origin;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 分钟缓存
  }
  
  // 获取公开内容
  async getContent(appId, slug = null, options = {}) {
    const { 
      useCache = true,
      format = 'auto' // 'auto' | 'json' | 'html' | 'text'
    } = options;
    
    const cacheKey = \`\${appId}:\${slug || 'default'}\`;
    
    // 检查缓存
    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }
    
    // 构造请求 URL
    const params = new URLSearchParams();
    if (slug) params.append('slug', slug);
    
    const url = \`\${this.apiBase}/api/cms/content/\${appId}\${params.toString() ? '?' + params : ''}\`;
    
    const res = await fetch(url);
    
    if (res.status === 404) {
      return null;
    }
    
    if (!res.ok) {
      throw new Error(\`Failed to fetch content: \${res.status}\`);
    }
    
    // 解析响应
    const contentType = res.headers.get('content-type') || '';
    let data;
    
    if (format === 'json' || (format === 'auto' && contentType.includes('application/json'))) {
      data = await res.json();
    } else if (format === 'text' || format === 'html') {
      data = await res.text();
    } else {
      // 自动检测
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    
    // 更新缓存
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
    
    return data;
  }
  
  // 获取 JSON 内容
  async getJSON(appId, slug = null) {
    return this.getContent(appId, slug, { format: 'json' });
  }
  
  // 获取 HTML 内容
  async getHTML(appId, slug = null) {
    return this.getContent(appId, slug, { format: 'html' });
  }
  
  // 渲染内容到 DOM 元素
  async render(appId, targetElement, options = {}) {
    const {
      slug = null,
      transform = null,
      loading = '<div class="loading">Loading...</div>',
      error = '<div class="error">Failed to load content</div>'
    } = options;
    
    // 显示加载状态
    if (typeof targetElement === 'string') {
      targetElement = document.querySelector(targetElement);
    }
    
    if (!targetElement) {
      throw new Error('Target element not found');
    }
    
    targetElement.innerHTML = loading;
    
    try {
      let content = await this.getContent(appId, slug);
      
      // 应用转换函数
      if (transform) {
        content = transform(content);
      }
      
      // 渲染内容
      if (typeof content === 'string') {
        targetElement.innerHTML = content;
      } else if (typeof content === 'object') {
        targetElement.innerHTML = this._renderObject(content);
      }
      
      return content;
      
    } catch (e) {
      console.error('Failed to render content:', e);
      targetElement.innerHTML = error;
      throw e;
    }
  }
  
  // 订阅内容更新（轮询）
  subscribe(appId, callback, options = {}) {
    const {
      slug = null,
      interval = 30000 // 30 秒
    } = options;
    
    let lastContent = null;
    let intervalId = null;
    
    const check = async () => {
      try {
        const content = await this.getContent(appId, slug, { useCache: false });
        
        // 检测变化
        const contentStr = JSON.stringify(content);
        if (lastContent !== null && contentStr !== lastContent) {
          callback(content, 'updated');
        } else if (lastContent === null) {
          callback(content, 'initial');
        }
        
        lastContent = contentStr;
      } catch (e) {
        callback(null, 'error', e);
      }
    };
    
    // 立即执行一次
    check();
    
    // 定时轮询
    intervalId = setInterval(check, interval);
    
    // 返回取消函数
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }
  
  // 清除缓存
  clearCache(appId = null, slug = null) {
    if (appId && slug) {
      this.cache.delete(\`\${appId}:\${slug}\`);
    } else if (appId) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(appId + ':')) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }
  
  // 预加载内容
  async preload(items) {
    const results = await Promise.allSettled(
      items.map(item => this.getContent(item.appId, item.slug))
    );
    
    return results.map((r, i) => ({
      ...items[i],
      success: r.status === 'fulfilled',
      data: r.status === 'fulfilled' ? r.value : null,
      error: r.status === 'rejected' ? r.reason.message : null
    }));
  }
  
  // 生成嵌入代码
  generateEmbed(appId, options = {}) {
    const {
      slug = null,
      style = 'width:100%;min-height:200px;border:none;',
      sandbox = 'allow-scripts allow-same-origin'
    } = options;
    
    const src = \`\${this.apiBase}/api/cms/content/\${appId}\${slug ? '?slug=' + slug : ''}\`;
    
    return \`<iframe src="\${src}" style="\${style}" sandbox="\${sandbox}"></iframe>\`;
  }
  
  // 辅助：渲染对象为 HTML
  _renderObject(obj) {
    if (Array.isArray(obj)) {
      return \`<ul>\${obj.map(item => \`<li>\${this._renderValue(item)}</li>\`).join('')}</ul>\`;
    }
    
    const rows = Object.entries(obj).map(([key, value]) => {
      return \`<tr><th>\${key}</th><td>\${this._renderValue(value)}</td></tr>\`;
    });
    
    return \`<table class="cms-data"><tbody>\${rows.join('')}</tbody></table>\`;
  }
  
  _renderValue(value) {
    if (value === null || value === undefined) return '<em>-</em>';
    if (typeof value === 'object') return this._renderObject(value);
    if (typeof value === 'boolean') return value ? '✓' : '✗';
    return String(value);
  }
}

// 全局实例
window.sparkCMSViewer = new SparkCMSViewer();

// 便捷函数
window.sparkLoadContent = async (appId, slug) => {
  return window.sparkCMSViewer.getContent(appId, slug);
};
`;

export function generateCMSViewerCode(apiBase: string = ''): string {
  return CMS_VIEWER_TEMPLATE.replace(/window\.location\.origin/g, 
    apiBase ? `'${apiBase}'` : 'window.location.origin');
}
