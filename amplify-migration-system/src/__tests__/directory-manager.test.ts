/**
 * Tests for DirectoryManager
 * **Feature: amplify-app-initialization, Property 2: Directory Management**
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { DirectoryManager } from '../utils/directory-manager';
import { Logger } from '../utils/logger';
import { LogLevel } from '../types';

describe('DirectoryManager', () => {
  let logger: Logger;
  let directoryManager: DirectoryManager;
  let tempDir: string;

  beforeEach(async () => {
    logger = new Logger(LogLevel.ERROR); // Suppress logs during tests
    directoryManager = new DirectoryManager(logger);

    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'directory-manager-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  describe('createAppDirectory', () => {
    it('should create a new directory successfully', async () => {
      const result = await directoryManager.createAppDirectory({
        basePath: tempDir,
        appName: 'testapp',
      });

      expect(result.success).toBe(true);
      expect(result.directoryPath).toBe(path.join(tempDir, 'testapp'));
      expect(result.existingCleaned).toBe(false);
      expect(result.uniqueNameGenerated).toBe(false);
      expect(result.errors).toHaveLength(0);

      // Verify directory exists
      expect(await fs.pathExists(result.directoryPath)).toBe(true);
      expect((await fs.stat(result.directoryPath)).isDirectory()).toBe(true);
    });

    it('should clean existing directory when cleanExisting is true', async () => {
      const appPath = path.join(tempDir, 'testapp');

      // Create existing directory with content
      await fs.ensureDir(appPath);
      await fs.writeFile(path.join(appPath, 'existing-file.txt'), 'content');

      const result = await directoryManager.createAppDirectory({
        basePath: tempDir,
        appName: 'testapp',
        cleanExisting: true,
      });

      expect(result.success).toBe(true);
      expect(result.existingCleaned).toBe(true);
      expect(result.directoryPath).toBe(appPath);

      // Verify directory exists but old content is gone
      expect(await fs.pathExists(appPath)).toBe(true);
      expect(await fs.pathExists(path.join(appPath, 'existing-file.txt'))).toBe(false);
    });

    it('should generate unique name when ensureUnique is true', async () => {
      const appPath = path.join(tempDir, 'testapp');

      // Create existing directory
      await fs.ensureDir(appPath);

      const result = await directoryManager.createAppDirectory({
        basePath: tempDir,
        appName: 'testapp',
        ensureUnique: true,
      });

      expect(result.success).toBe(true);
      expect(result.uniqueNameGenerated).toBe(true);
      expect(result.originalName).toBe('testapp');
      expect(result.directoryPath).toBe(path.join(tempDir, 'testapp1'));

      // Verify both directories exist
      expect(await fs.pathExists(appPath)).toBe(true);
      expect(await fs.pathExists(result.directoryPath)).toBe(true);
    });

    it('should fail when directory exists and no conflict resolution specified', async () => {
      const appPath = path.join(tempDir, 'testapp');

      // Create existing directory
      await fs.ensureDir(appPath);

      const result = await directoryManager.createAppDirectory({
        basePath: tempDir,
        appName: 'testapp',
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Directory already exists');
    });

    it('should fail when base path does not exist', async () => {
      const nonExistentPath = path.join(tempDir, 'non-existent');

      const result = await directoryManager.createAppDirectory({
        basePath: nonExistentPath,
        appName: 'testapp',
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Base path does not exist');
    });
  });

  describe('ensureUniqueDirectory', () => {
    it('should return original name when no conflict exists', async () => {
      const uniqueName = await directoryManager.ensureUniqueDirectory(tempDir, 'uniqueapp');
      expect(uniqueName).toBe('uniqueapp');
    });

    it('should generate incremental names when conflicts exist', async () => {
      // Create conflicting directories
      await fs.ensureDir(path.join(tempDir, 'testapp'));
      await fs.ensureDir(path.join(tempDir, 'testapp1'));
      await fs.ensureDir(path.join(tempDir, 'testapp2'));

      const uniqueName = await directoryManager.ensureUniqueDirectory(tempDir, 'testapp');
      expect(uniqueName).toBe('testapp3');
    });
  });

  describe('cleanupDirectory', () => {
    it('should remove directory and all contents', async () => {
      const testDir = path.join(tempDir, 'cleanup-test');

      // Create directory with nested content
      await fs.ensureDir(path.join(testDir, 'subdir'));
      await fs.writeFile(path.join(testDir, 'file.txt'), 'content');
      await fs.writeFile(path.join(testDir, 'subdir', 'nested.txt'), 'nested content');

      await directoryManager.cleanupDirectory(testDir);

      expect(await fs.pathExists(testDir)).toBe(false);
    });

    it('should handle non-existent directory gracefully', async () => {
      const nonExistentDir = path.join(tempDir, 'non-existent');

      // Should not throw
      await expect(directoryManager.cleanupDirectory(nonExistentDir)).resolves.toBeUndefined();
    });
  });

  describe('verifyDirectoryStructure', () => {
    it('should return true for valid directory', async () => {
      const testDir = path.join(tempDir, 'verify-test');
      await fs.ensureDir(testDir);

      const result = await directoryManager.verifyDirectoryStructure(testDir);
      expect(result).toBe(true);
    });

    it('should return false for non-existent path', async () => {
      const nonExistentDir = path.join(tempDir, 'non-existent');

      const result = await directoryManager.verifyDirectoryStructure(nonExistentDir);
      expect(result).toBe(false);
    });

    it('should return false for file path', async () => {
      const filePath = path.join(tempDir, 'test-file.txt');
      await fs.writeFile(filePath, 'content');

      const result = await directoryManager.verifyDirectoryStructure(filePath);
      expect(result).toBe(false);
    });
  });

  describe('copyDirectory', () => {
    it('should copy directory and all contents', async () => {
      const sourceDir = path.join(tempDir, 'source');
      const destDir = path.join(tempDir, 'destination');

      // Create source directory with content
      await fs.ensureDir(path.join(sourceDir, 'subdir'));
      await fs.writeFile(path.join(sourceDir, 'file.txt'), 'content');
      await fs.writeFile(path.join(sourceDir, 'subdir', 'nested.txt'), 'nested content');

      await directoryManager.copyDirectory(sourceDir, destDir);

      // Verify destination exists and has same content
      expect(await fs.pathExists(destDir)).toBe(true);
      expect(await fs.pathExists(path.join(destDir, 'file.txt'))).toBe(true);
      expect(await fs.pathExists(path.join(destDir, 'subdir', 'nested.txt'))).toBe(true);

      const copiedContent = await fs.readFile(path.join(destDir, 'file.txt'), 'utf-8');
      expect(copiedContent).toBe('content');
    });

    it('should fail when source does not exist', async () => {
      const nonExistentSource = path.join(tempDir, 'non-existent');
      const destDir = path.join(tempDir, 'destination');

      await expect(directoryManager.copyDirectory(nonExistentSource, destDir)).rejects.toThrow('Source directory does not exist');
    });
  });
});
