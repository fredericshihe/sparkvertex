// ============================================
// SparkVertex Image Compression Template
// 浏览器端图片压缩工具
// ============================================

export const IMAGE_COMPRESS_TEMPLATE = `
// ============================================
// SparkVertex Image Compression
// 浏览器端图片压缩，减小上传大小
// ============================================

class SparkImageCompress {
  constructor(options = {}) {
    this.maxWidth = options.maxWidth || 1920;
    this.maxHeight = options.maxHeight || 1080;
    this.quality = options.quality || 0.8;
    this.mimeType = options.mimeType || 'image/jpeg';
  }
  
  // 压缩单张图片
  async compress(file, options = {}) {
    const {
      maxWidth = this.maxWidth,
      maxHeight = this.maxHeight,
      quality = this.quality,
      mimeType = this.mimeType,
      preserveExif = false
    } = options;
    
    // 验证是否为图片
    if (!file.type.startsWith('image/')) {
      throw new Error('Not an image file');
    }
    
    // 如果是 GIF 或已经很小，直接返回
    if (file.type === 'image/gif' || file.size < 50 * 1024) {
      return file;
    }
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = async () => {
        URL.revokeObjectURL(url);
        
        try {
          // 计算新尺寸
          let { width, height } = img;
          
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          
          // 创建 Canvas
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          
          // 白色背景（处理透明图片）
          if (mimeType === 'image/jpeg') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
          }
          
          // 绘制图片
          ctx.drawImage(img, 0, 0, width, height);
          
          // 转换为 Blob
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to compress image'));
                return;
              }
              
              // 如果压缩后更大，返回原图
              if (blob.size >= file.size) {
                resolve(file);
                return;
              }
              
              // 创建新文件
              const newFile = new File([blob], file.name, {
                type: mimeType,
                lastModified: Date.now()
              });
              
              console.log(\`🖼️ Compressed: \${file.name} (\${this._formatSize(file.size)} → \${this._formatSize(blob.size)})\`);
              
              resolve(newFile);
            },
            mimeType,
            quality
          );
          
        } catch (e) {
          reject(e);
        }
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };
      
      img.src = url;
    });
  }
  
  // 批量压缩
  async compressBatch(files, options = {}) {
    const {
      onProgress = null,
      ...compressOptions
    } = options;
    
    const results = [];
    let processed = 0;
    
    for (const file of files) {
      try {
        const compressed = await this.compress(file, compressOptions);
        results.push({
          original: file,
          compressed,
          success: true,
          savedBytes: file.size - compressed.size
        });
      } catch (e) {
        results.push({
          original: file,
          compressed: file,
          success: false,
          error: e.message
        });
      }
      
      processed++;
      onProgress?.({
        processed,
        total: files.length,
        progress: (processed / files.length) * 100
      });
    }
    
    return results;
  }
  
  // 压缩到指定大小以下
  async compressToSize(file, targetSize, options = {}) {
    const { minQuality = 0.3, step = 0.1 } = options;
    
    let quality = 0.9;
    let result = file;
    
    while (result.size > targetSize && quality >= minQuality) {
      result = await this.compress(file, { ...options, quality });
      quality -= step;
    }
    
    if (result.size > targetSize) {
      console.warn(\`Could not compress \${file.name} below \${this._formatSize(targetSize)}\`);
    }
    
    return result;
  }
  
  // 生成缩略图
  async thumbnail(file, options = {}) {
    const {
      width = 200,
      height = 200,
      fit = 'cover', // 'cover' | 'contain' | 'fill'
      quality = 0.7
    } = options;
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          
          let sx = 0, sy = 0, sw = img.width, sh = img.height;
          let dx = 0, dy = 0, dw = width, dh = height;
          
          if (fit === 'cover') {
            const imgRatio = img.width / img.height;
            const canvasRatio = width / height;
            
            if (imgRatio > canvasRatio) {
              sw = img.height * canvasRatio;
              sx = (img.width - sw) / 2;
            } else {
              sh = img.width / canvasRatio;
              sy = (img.height - sh) / 2;
            }
          } else if (fit === 'contain') {
            const imgRatio = img.width / img.height;
            const canvasRatio = width / height;
            
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            
            if (imgRatio > canvasRatio) {
              dh = width / imgRatio;
              dy = (height - dh) / 2;
            } else {
              dw = height * imgRatio;
              dx = (width - dw) / 2;
            }
          }
          
          ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
          
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to create thumbnail'));
                return;
              }
              
              const thumbFile = new File([blob], \`thumb_\${file.name}\`, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              
              resolve(thumbFile);
            },
            'image/jpeg',
            quality
          );
          
        } catch (e) {
          reject(e);
        }
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };
      
      img.src = url;
    });
  }
  
  // 获取图片信息
  async getInfo(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({
          width: img.width,
          height: img.height,
          aspectRatio: img.width / img.height,
          size: file.size,
          type: file.type,
          name: file.name
        });
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };
      
      img.src = url;
    });
  }
  
  // 转换格式
  async convert(file, targetType, quality = 0.9) {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    
    if (!validTypes.includes(targetType)) {
      throw new Error(\`Unsupported format: \${targetType}\`);
    }
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        
        if (targetType === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, img.width, img.height);
        }
        
        ctx.drawImage(img, 0, 0);
        
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Conversion failed'));
              return;
            }
            
            const ext = targetType.split('/')[1];
            const newName = file.name.replace(/\\.[^.]+$/, '.' + ext);
            
            resolve(new File([blob], newName, {
              type: targetType,
              lastModified: Date.now()
            }));
          },
          targetType,
          quality
        );
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };
      
      img.src = url;
    });
  }
  
  // 辅助：格式化文件大小
  _formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
}

// 全局实例
window.sparkImageCompress = new SparkImageCompress();
`;

export function generateImageCompressCode(options?: {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}): string {
  let code = IMAGE_COMPRESS_TEMPLATE;
  
  if (options) {
    if (options.maxWidth) {
      code = code.replace('maxWidth || 1920', `maxWidth || ${options.maxWidth}`);
    }
    if (options.maxHeight) {
      code = code.replace('maxHeight || 1080', `maxHeight || ${options.maxHeight}`);
    }
    if (options.quality) {
      code = code.replace('quality || 0.8', `quality || ${options.quality}`);
    }
  }
  
  return code;
}
