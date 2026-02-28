import TextRecognition from '@react-native-ml-kit/text-recognition';

/**
 * On-device OCR using ML Kit (iOS) / Google ML Kit (Android).
 * Works offline, free, no API key needed.
 * Requires a dev build (not Expo Go) since it uses native modules.
 */
export class DeviceOcrService {
  /**
   * Check if the native ML Kit module is available at runtime.
   * Returns false in Expo Go (graceful degradation to cloud OCR).
   */
  static isAvailable(): boolean {
    try {
      return TextRecognition != null && typeof TextRecognition.recognize === 'function';
    } catch {
      return false;
    }
  }

  /**
   * Extract text from a static image URI using on-device ML Kit.
   * Same contract as CloudVisionService.extractText() — returns raw text string.
   */
  static async extractText(imageUri: string): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('On-device OCR is not available. Native module missing (are you running in Expo Go?)');
    }

    console.log('📱 Starting on-device OCR...');

    const result = await TextRecognition.recognize(imageUri);

    if (!result || !result.text) {
      console.warn('📱 No text detected by on-device OCR');
      return '';
    }

    console.log(`📱 On-device OCR extracted ${result.text.length} characters`);
    return result.text;
  }
}
