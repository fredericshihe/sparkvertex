/**
 * 图片压缩优化工具
 * 
 * 在上传前压缩图片，将大 PNG 转为 WebP 格式
 * 典型压缩比: 724KB PNG → ~50KB WebP
 */

/**
 * 压缩图片文件
 * @param file 原始图片文件
 * @param options 压缩选项
 * @returns 压缩后的 File 对象
 */
export async function compressImage(
  file: File,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    format?: 'webp' | 'jpeg' | 'png';
  } = {}
): Promise<File> {
  const {
    maxWidth = 512,    // 图标最大 512px
    maxHeight = 512,
    quality = 0.85,    // 85% 质量
    format = 'webp'    // WebP 格式最佳压缩
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      // 计算缩放尺寸
      let { width, height } = img;
      
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;

      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      // 绘制图片
      ctx.drawImage(img, 0, 0, width, height);

      // 转换格式
      const mimeType = format === 'webp' ? 'image/webp' 
                     : format === 'jpeg' ? 'image/jpeg' 
                     : 'image/png';

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to compress image'));
            return;
          }

          // 生成新文件名
          const originalName = file.name.replace(/\.[^.]+$/, '');
          const newFileName = `${originalName}.${format}`;

          const compressedFile = new File([blob], newFileName, {
            type: mimeType,
            lastModified: Date.now(),
          });

          console.log('[Image Compress]', {
            original: `${file.name} (${(file.size / 1024).toFixed(1)}KB)`,
            compressed: `${newFileName} (${(compressedFile.size / 1024).toFixed(1)}KB)`,
            ratio: `${((1 - compressedFile.size / file.size) * 100).toFixed(1)}% saved`
          });

          resolve(compressedFile);
        },
        mimeType,
        quality
      );
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    // 加载图片
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * 检查是否需要压缩
 * @param file 图片文件
 * @param maxSizeKB 最大允许大小 (KB)
 */
export function needsCompression(file: File, maxSizeKB: number = 100): boolean {
  return file.size > maxSizeKB * 1024;
}

/**
 * 智能压缩：只在需要时压缩
 */
export async function smartCompressImage(
  file: File,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    format?: 'webp' | 'jpeg' | 'png';
    maxSizeKB?: number;
  } = {}
): Promise<File> {
  const { maxSizeKB = 100, ...compressOptions } = options;

  // 如果文件已经很小，不压缩
  if (!needsCompression(file, maxSizeKB)) {
    console.log('[Image Compress] Skipped, file already small:', 
      `${(file.size / 1024).toFixed(1)}KB`);
    return file;
  }

  // 如果是 SVG，不压缩
  if (file.type === 'image/svg+xml') {
    console.log('[Image Compress] Skipped SVG file');
    return file;
  }

  return compressImage(file, compressOptions);
}
