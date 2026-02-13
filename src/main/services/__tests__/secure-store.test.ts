/**
 * Unit tests for SecureStoreService
 * Tests API key encryption, storage, and retrieval
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SecureStoreService } from '../secure-store';
import * as fs from 'fs';
import * as path from 'path';
import { safeStorage, app } from 'electron';

// Mock Electron modules
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((str: string) => Buffer.from(`encrypted_${str}`)),
    decryptString: vi.fn((buffer: Buffer) => {
      const str = buffer.toString();
      return str.replace('encrypted_', '');
    }),
  },
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') {
        return '/tmp/strat-monitor-test';
      }
      return '/tmp';
    }),
  },
}));

// Mock fs module
vi.mock('fs');

describe('SecureStoreService', () => {
  let secureStore: SecureStoreService;
  let mockFsData: Record<string, string> = {};

  beforeEach(() => {
    // Reset mocks
    mockFsData = {};
    vi.clearAllMocks();

    // Mock fs functions
    vi.mocked(fs.existsSync).mockImplementation((filePath: fs.PathLike) => {
      return mockFsData[filePath.toString()] !== undefined;
    });

    vi.mocked(fs.readFileSync).mockImplementation((filePath: fs.PathOrFileDescriptor) => {
      const data = mockFsData[filePath.toString()];
      if (!data) throw new Error('File not found');
      return data;
    });

    vi.mocked(fs.writeFileSync).mockImplementation(
      (filePath: fs.PathOrFileDescriptor, data) => {
        mockFsData[filePath.toString()] = data.toString();
      }
    );

    vi.mocked(fs.mkdirSync).mockImplementation(() => {
      return undefined;
    });

    // Create fresh instance
    secureStore = new SecureStoreService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setApiKey', () => {
    it('should encrypt and store API key', () => {
      const apiKey = 'sk-ant-test-key-123456789';

      secureStore.setApiKey(apiKey);

      expect(safeStorage.isEncryptionAvailable).toHaveBeenCalled();
      expect(safeStorage.encryptString).toHaveBeenCalledWith(apiKey);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should throw error if API key is empty', () => {
      expect(() => secureStore.setApiKey('')).toThrow('API key cannot be empty');
      expect(() => secureStore.setApiKey('   ')).toThrow('API key cannot be empty');
    });

    it('should throw error if encryption not available', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false);

      expect(() => secureStore.setApiKey('sk-ant-test')).toThrow(
        'Encryption not available on this system'
      );
    });
  });

  describe('getApiKey', () => {
    it('should return undefined if no API key stored', () => {
      const result = secureStore.getApiKey();
      expect(result).toBeUndefined();
    });

    it('should decrypt and return stored API key', () => {
      const apiKey = 'sk-ant-test-key-123456789';

      secureStore.setApiKey(apiKey);
      const retrieved = secureStore.getApiKey();

      expect(retrieved).toBe(apiKey);
      expect(safeStorage.decryptString).toHaveBeenCalled();
    });

    it('should return undefined if decryption fails', () => {
      secureStore.setApiKey('sk-ant-test');

      vi.mocked(safeStorage.decryptString).mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const result = secureStore.getApiKey();
      expect(result).toBeUndefined();
    });

    it('should throw error if encryption not available', () => {
      secureStore.setApiKey('sk-ant-test');

      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false);

      expect(() => secureStore.getApiKey()).toThrow('Encryption not available on this system');
    });
  });

  describe('hasApiKey', () => {
    it('should return false if no API key stored', () => {
      expect(secureStore.hasApiKey()).toBe(false);
    });

    it('should return true if API key stored', () => {
      secureStore.setApiKey('sk-ant-test-key');
      expect(secureStore.hasApiKey()).toBe(true);
    });
  });

  describe('clearApiKey', () => {
    it('should remove stored API key', () => {
      secureStore.setApiKey('sk-ant-test-key');
      expect(secureStore.hasApiKey()).toBe(true);

      secureStore.clearApiKey();
      expect(secureStore.hasApiKey()).toBe(false);
      expect(secureStore.getApiKey()).toBeUndefined();
    });

    it('should save changes to disk', () => {
      secureStore.setApiKey('sk-ant-test-key');
      const writeCallsBefore = vi.mocked(fs.writeFileSync).mock.calls.length;

      secureStore.clearApiKey();

      expect(vi.mocked(fs.writeFileSync).mock.calls.length).toBeGreaterThan(writeCallsBefore);
    });
  });

  describe('getApiKeyStatus', () => {
    it('should return no key if not stored', () => {
      const status = secureStore.getApiKeyStatus();
      expect(status).toEqual({ hasKey: false, isValid: false });
    });

    it('should return valid if key starts with sk- and is long enough', () => {
      secureStore.setApiKey('sk-ant-api-key-123456789');

      const status = secureStore.getApiKeyStatus();
      expect(status).toEqual({ hasKey: true, isValid: true });
    });

    it('should return invalid if key does not start with sk-', () => {
      // Mock getApiKey to return invalid format
      secureStore.setApiKey('sk-ant-test');
      vi.spyOn(secureStore, 'getApiKey').mockReturnValue('invalid-key');

      const status = secureStore.getApiKeyStatus();
      expect(status).toEqual({ hasKey: true, isValid: false });
    });

    it('should return invalid if key is too short', () => {
      secureStore.setApiKey('sk-ant-test');
      vi.spyOn(secureStore, 'getApiKey').mockReturnValue('sk-short');

      const status = secureStore.getApiKeyStatus();
      expect(status).toEqual({ hasKey: true, isValid: false });
    });

    it('should return invalid if decryption fails', () => {
      secureStore.setApiKey('sk-ant-test');
      vi.spyOn(secureStore, 'getApiKey').mockReturnValue(undefined);

      const status = secureStore.getApiKeyStatus();
      expect(status).toEqual({ hasKey: true, isValid: false });
    });
  });

  describe('persistence', () => {
    it('should load existing data on initialization', () => {
      // Simulate existing encrypted data
      const storePath = path.join(app.getPath('userData'), 'secure-store.json');
      mockFsData[storePath] = JSON.stringify({
        encryptedApiKey: Buffer.from('encrypted_sk-ant-test').toString('base64'),
      });

      // Create new instance (should load existing data)
      const newInstance = new SecureStoreService();

      expect(fs.existsSync).toHaveBeenCalledWith(storePath);
      expect(fs.readFileSync).toHaveBeenCalledWith(storePath, 'utf-8');
      expect(newInstance.hasApiKey()).toBe(true);
    });

    it('should handle missing store file gracefully', () => {
      // Create instance with no existing file
      const newInstance = new SecureStoreService();

      expect(newInstance.hasApiKey()).toBe(false);
      expect(newInstance.getApiKey()).toBeUndefined();
    });

    it('should handle corrupted store file gracefully', () => {
      const storePath = path.join(app.getPath('userData'), 'secure-store.json');
      mockFsData[storePath] = 'invalid json {{{';

      // Should not throw, just reset to empty state
      const newInstance = new SecureStoreService();
      expect(newInstance.hasApiKey()).toBe(false);
    });
  });
});
