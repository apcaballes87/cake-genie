// Advanced image compression utilities adapted from Shopify implementation
// Reduces file sizes significantly while maintaining quality

export const IMAGE_CONFIG = {
  MAX_LONG_EDGE: 1800,
  TARGET_MAX_BYTES: 1_200_000, // 1.2MB target
  QUALITY_START: 0.85,
  QUALITY_MIN: 0.60
};

/**
 * Converts canvas to blob with fallback support
 */
function canvasToBlobAsync(canvas, type, quality) {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Decodes image to bitmap with fallback
 */
async function decodeToBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (_) {
      // Fall through to fallback
    }
  }
  
  // Fallback method
  const img = document.createElement('img');
  img.decoding = 'async';
  img.src = URL.createObjectURL(file);
  
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });
  
  return img;
}

/**
 * Encodes canvas with WebP support and JPEG fallback
 */
async function encodeWithFallback(canvas, quality) {
  // Try WebP first for better compression
  let blob = await canvasToBlobAsync(canvas, 'image/webp', quality);
  if (blob) {
    return { blob, ext: 'webp' };
  }
  
  // Fallback to JPEG with white background
  const ctx = canvas.getContext('2d');
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  blob = await canvasToBlobAsync(canvas, 'image/jpeg', quality);
  return { blob, ext: 'jpg' };
}

/**
 * Main compression function - reduces file size while maintaining quality
 */
export async function compressAndOptimizeImage(file) {
  try {
    // Skip compression for non-images or GIFs
    if (!file.type.startsWith('image/')) {
      return { 
        blob: file, 
        ext: (file.name.split('.').pop() || 'bin').toLowerCase(),
        compressionRatio: 1 
      };
    }
    
    if (file.type === 'image/gif') {
      return { 
        blob: file, 
        ext: 'gif',
        compressionRatio: 1 
      };
    }

    const originalSize = file.size;
    const bmp = await decodeToBitmap(file);
    const srcW = bmp.width;
    const srcH = bmp.height;
    const longEdge = Math.max(srcW, srcH);

    // If already small enough, return original
    if (longEdge <= IMAGE_CONFIG.MAX_LONG_EDGE && file.size <= IMAGE_CONFIG.TARGET_MAX_BYTES) {
      return { 
        blob: file, 
        ext: (file.name.split('.').pop() || 'jpg').toLowerCase(),
        compressionRatio: 1 
      };
    }

    // Calculate new dimensions
    const scale = Math.min(1, IMAGE_CONFIG.MAX_LONG_EDGE / longEdge);
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));

    // Create canvas (try OffscreenCanvas first for better performance)
    const canvas = ('OffscreenCanvas' in window) 
      ? new OffscreenCanvas(dstW, dstH)
      : Object.assign(document.createElement('canvas'), { width: dstW, height: dstH });

    const ctx = canvas.getContext('2d', { alpha: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, dstW, dstH);

    // Iteratively compress until target size is reached
    let quality = IMAGE_CONFIG.QUALITY_START;
    let result;
    let tries = 0;
    
    do {
      result = await encodeWithFallback(canvas, quality);
      
      if (result.blob.size <= IMAGE_CONFIG.TARGET_MAX_BYTES || quality <= IMAGE_CONFIG.QUALITY_MIN) {
        break;
      }
      
      quality = Math.max(IMAGE_CONFIG.QUALITY_MIN, quality - 0.1);
      tries++;
    } while (tries < 5);

    const compressionRatio = originalSize / result.blob.size;
    
    return {
      ...result,
      compressionRatio,
      originalSize,
      compressedSize: result.blob.size,
      dimensions: { width: dstW, height: dstH },
      originalDimensions: { width: srcW, height: srcH }
    };
    
  } catch (error) {
    console.warn('Image compression failed, using original:', error);
    return { 
      blob: file, 
      ext: (file.name.split('.').pop() || 'jpg').toLowerCase(),
      compressionRatio: 1,
      error: error.message 
    };
  }
}

/**
 * Helper to format file sizes for display
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}