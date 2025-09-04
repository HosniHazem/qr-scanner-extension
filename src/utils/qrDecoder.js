// QR Code decoder utility using ZXing
import { BrowserQRCodeReader } from '@zxing/browser';

export async function decodeQRWithZXing(canvas) {
  try {
    const codeReader = new BrowserQRCodeReader();
    const result = await codeReader.decodeFromCanvas(canvas);
    
    if (result && result.text) {
      console.log('[qrDecoder] ZXing decoded:', result.text);
      return result.text;
    }
    return null;
  } catch (e) {
    console.log('[qrDecoder] ZXing decode failed:', e.message);
    return null;
  }
}

export async function decodeQRFromImageData(imageData, width, height) {
  try {
    // Create canvas from image data
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Create ImageData and put it on canvas
    const imgData = new ImageData(new Uint8ClampedArray(imageData), width, height);
    ctx.putImageData(imgData, 0, 0);
    
    // Try ZXing QR decoder
    const result = await decodeQRWithZXing(canvas);
    if (result) {
      return result;
    }
    
    // Fallback to pattern analysis
    let blackPixels = 0;
    let whitePixels = 0;
    
    for (let i = 0; i < imageData.length; i += 4) {
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      const gray = (r + g + b) / 3;
      
      if (gray < 128) blackPixels++;
      else whitePixels++;
    }
    
    const totalPixels = blackPixels + whitePixels;
    const blackRatio = blackPixels / totalPixels;
    
    console.log('[qrDecoder] QR analysis:', { 
      blackPixels, 
      whitePixels, 
      blackRatio: blackRatio.toFixed(3),
      width, 
      height 
    });
    
    // QR codes typically have ~50% black pixels
    if (blackRatio > 0.3 && blackRatio < 0.7) {
      // Try to extract some basic patterns
      const patterns = findQRPatterns(imageData, width, height);
      if (patterns.length > 0) {
        console.log('[qrDecoder] QR patterns found:', patterns.length);
        return `QR Code detected - Patterns: ${patterns.length}, Size: ${width}x${height}`;
      }
      
      return `QR-like image detected - Black ratio: ${(blackRatio * 100).toFixed(1)}%`;
    }
    
    return null;
  } catch (e) {
    console.warn('[qrDecoder] image data analysis failed', e);
    return null;
  }
}

// Find QR code patterns
function findQRPatterns(imageData, width, height) {
  const patterns = [];
  
  // Convert to binary
  const binary = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = imageData[idx];
      const g = imageData[idx + 1];
      const b = imageData[idx + 2];
      const gray = (r + g + b) / 3;
      binary[y * width + x] = gray < 128 ? 1 : 0;
    }
  }
  
  // Look for finder patterns
  const finderPattern = [1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1];
  
  for (let y = 0; y < height - finderPattern.length; y++) {
    for (let x = 0; x < width - finderPattern.length; x++) {
      let match = true;
      for (let i = 0; i < finderPattern.length; i++) {
        if (binary[y * width + x + i] !== finderPattern[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        patterns.push({ x, y });
      }
    }
  }
  
  return patterns;
}
