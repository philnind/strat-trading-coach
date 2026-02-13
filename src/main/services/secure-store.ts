/**
 * Secure storage service for sensitive data like API keys
 * Uses Electron's safeStorage API for encryption at rest
 */

import { safeStorage, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

interface SecureStoreData {
  encryptedApiKey?: string;
}

export class SecureStoreService {
  private storePath: string;
  private data: SecureStoreData = {};

  constructor() {
    // Store encrypted data in userData directory
    this.storePath = path.join(app.getPath('userData'), 'secure-store.json');
    this.load();
  }

  /**
   * Load encrypted data from disk
   */
  private load(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf-8');
        this.data = JSON.parse(raw);
      }
    } catch (error) {
      console.error('[SecureStore] Failed to load:', error);
      this.data = {};
    }
  }

  /**
   * Save encrypted data to disk
   */
  private save(): void {
    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('[SecureStore] Failed to save:', error);
      throw new Error('Failed to save secure data', { cause: error });
    }
  }

  /**
   * Set API key (encrypted)
   */
  setApiKey(apiKey: string): void {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error('API key cannot be empty');
    }

    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption not available on this system');
    }

    // Encrypt the API key
    const buffer = safeStorage.encryptString(apiKey);
    this.data.encryptedApiKey = buffer.toString('base64');
    this.save();
  }

  /**
   * Get decrypted API key
   */
  getApiKey(): string | undefined {
    if (!this.data.encryptedApiKey) {
      return undefined;
    }

    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption not available on this system');
    }

    try {
      const buffer = Buffer.from(this.data.encryptedApiKey, 'base64');
      return safeStorage.decryptString(buffer);
    } catch (error) {
      console.error('[SecureStore] Failed to decrypt API key:', error);
      return undefined;
    }
  }

  /**
   * Check if API key exists
   */
  hasApiKey(): boolean {
    return !!this.data.encryptedApiKey;
  }

  /**
   * Clear API key
   */
  clearApiKey(): void {
    delete this.data.encryptedApiKey;
    this.save();
  }

  /**
   * Get API key status (without revealing the key)
   */
  getApiKeyStatus(): { hasKey: boolean; isValid: boolean } {
    const hasKey = this.hasApiKey();
    let isValid = false;

    if (hasKey) {
      try {
        const key = this.getApiKey();
        // Check if key looks valid (starts with sk- and has reasonable length)
        isValid = !!key && key.startsWith('sk-') && key.length > 20;
      } catch {
        isValid = false;
      }
    }

    return { hasKey, isValid };
  }
}
