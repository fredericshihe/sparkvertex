// ============================================
// SparkVertex CMS Publishing Service Template
// 本地内容发布到云端 CDN
// ============================================

export const CMS_PUBLISH_TEMPLATE = `
// ============================================
// SparkVertex CMS Publishing Service
// 从本地发布内容到云端公共 CDN
// ============================================

class SparkCMSPublish {
  constructor(appId) {
    this.appId = appId;
    this.apiBase = '{{API_BASE}}';
    this.publishedContent = new Map();
    this.isPublishing = false;
  }
  
  // 发布内容
  async publish(content, options = {}) {
    const {
      slug = null,          // 可选的自定义 slug
      version = null,       // 版本号
      metadata = {},        // 额外元数据
      overwrite = true      // 是否覆盖现有内容
    } = options;
    
    if (this.isPublishing) {
      throw new Error('Publishing in progress');
    }
    
    this.isPublishing = true;
    
    try {
      // 序列化内容
      const serialized = typeof content === 'string' 
        ? content 
        : JSON.stringify(content);
      
      const res = await fetch(\`\${this.apiBase}/api/cms/publish\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          app_id: this.appId,
          content: serialized,
          content_type: typeof content === 'string' ? 'text/html' : 'application/json',
          slug,
          version,
          metadata,
          overwrite
        })
      });
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || \`Publish failed: \${res.status}\`);
      }
      
      const result = await res.json();
      
      // 缓存发布信息
      this.publishedContent.set(slug || 'default', {
        url: result.url,
        version: result.version,
        published_at: result.published_at
      });
      
      console.log(\`📤 Content published: \${result.url}\`);
      
      // 触发事件
      window.dispatchEvent(new CustomEvent('spark:cms:published', {
        detail: result
      }));
      
      return result;
      
    } finally {
      this.isPublishing = false;
    }
  }
  
  // 发布 HTML 页面
  async publishPage(html, slug = 'index') {
    return this.publish(html, {
      slug,
      metadata: { type: 'page' }
    });
  }
  
  // 发布 JSON 数据
  async publishData(data, slug = 'data') {
    return this.publish(data, {
      slug,
      metadata: { type: 'data' }
    });
  }
  
  // 发布博客文章
  async publishPost(post) {
    const { title, content, slug, tags = [], author = '' } = post;
    
    return this.publish(content, {
      slug: slug || this._slugify(title),
      metadata: {
        type: 'post',
        title,
        tags,
        author
      }
    });
  }
  
  // 批量发布
  async publishBatch(items) {
    const results = [];
    
    for (const item of items) {
      try {
        const result = await this.publish(item.content, {
          slug: item.slug,
          metadata: item.metadata
        });
        results.push({ success: true, ...result });
      } catch (e) {
        results.push({ success: false, slug: item.slug, error: e.message });
      }
    }
    
    return results;
  }
  
  // 上传静态资源（图片、CSS、JS 等）
  async uploadAsset(file, path = null) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('app_id', this.appId);
    if (path) formData.append('path', path);
    
    const res = await fetch(\`\${this.apiBase}/api/cms/upload\`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || \`Upload failed: \${res.status}\`);
    }
    
    const result = await res.json();
    console.log(\`📎 Asset uploaded: \${result.url}\`);
    
    return result;
  }
  
  // 获取发布历史
  async getHistory(slug = null) {
    const params = new URLSearchParams({ app_id: this.appId });
    if (slug) params.append('slug', slug);
    
    const res = await fetch(
      \`\${this.apiBase}/api/cms/history?\${params}\`,
      { credentials: 'include' }
    );
    
    if (!res.ok) {
      throw new Error(\`Failed to get history: \${res.status}\`);
    }
    
    return res.json();
  }
  
  // 回滚到指定版本
  async rollback(historyId) {
    const res = await fetch(\`\${this.apiBase}/api/cms/history\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        history_id: historyId,
        app_id: this.appId
      })
    });
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || \`Rollback failed: \${res.status}\`);
    }
    
    const result = await res.json();
    console.log(\`⏪ Rolled back to version \${result.version}\`);
    
    return result;
  }
  
  // 获取已发布内容的 URL
  getPublicURL(slug = 'default') {
    const cached = this.publishedContent.get(slug);
    if (cached) return cached.url;
    
    // 构造默认 URL
    return \`\${this.apiBase}/api/cms/content/\${this.appId}\${slug !== 'default' ? '?slug=' + slug : ''}\`;
  }
  
  // 生成静态站点
  async generateStaticSite(pages) {
    const results = {
      success: [],
      failed: []
    };
    
    for (const page of pages) {
      try {
        // 处理页面中的资源引用
        let html = page.html;
        
        // 上传并替换图片
        for (const img of page.assets || []) {
          const uploaded = await this.uploadAsset(img.file, img.path);
          html = html.replace(img.placeholder, uploaded.url);
        }
        
        // 发布页面
        const result = await this.publishPage(html, page.slug);
        results.success.push({ slug: page.slug, url: result.url });
        
      } catch (e) {
        results.failed.push({ slug: page.slug, error: e.message });
      }
    }
    
    return results;
  }
  
  // 辅助：生成 slug
  _slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\\u4e00-\\u9fa5]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }
}

// 全局实例占位符
window.sparkCMS = null;
`;

export function generateCMSPublishCode(appId: string, apiBase: string): string {
  return CMS_PUBLISH_TEMPLATE
    .replace(/\{\{APP_ID\}\}/g, appId)
    .replace(/\{\{API_BASE\}\}/g, apiBase);
}
