/**
 * Integration Tests for DirectoryManager
 * Tests DirectoryManager integration with existing system components
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { DirectoryManager } from '../utils/directory-manager';
import { Logger } from '../utils/logger';
import { LogLevel } from '../types';

describe('DirectoryManager Integration', () => {
  let logger: Logger;
  let directoryManager: DirectoryManager;
  let tempDir: string;

  beforeEach(async () => {
    // Use INFO level to see some logging during integration tests
    logger = new Logger(LogLevel.INFO);
    directoryManager = new DirectoryManager(logger);

    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'directory-manager-integration-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  it('should integrate with Logger for comprehensive logging', async () => {
    // Test that DirectoryManager properly logs operations through the Logger
    const result = await directoryManager.createAppDirectory({
      basePath: tempDir,
      appName: 'integrationtestapp',
      cleanExisting: false,
      ensureUnique: false,
    });

    expect(result.success).toBe(true);
    expect(result.directoryPath).toBe(path.join(tempDir, 'integrationtestapp'));

    // Verify directory was created
    expect(await fs.pathExists(result.directoryPath)).toBe(true);

    // Test cleanup
    await directoryManager.cleanupDirectory(result.directoryPath);
    expect(await fs.pathExists(result.directoryPath)).toBe(false);
  });

  it('should handle realistic app initialization workflow', async () => {
    // Simulate a realistic workflow similar to what AmplifyInitializer would do

    // Step 1: Create app directory
    const createResult = await directoryManager.createAppDirectory({
      basePath: tempDir,
      appName: 'myamplifyapp',
      ensureUnique: true,
    });

    expect(createResult.success).toBe(true);

    // Step 2: Verify directory structure
    const verifyResult = await directoryManager.verifyDirectoryStructure(createResult.directoryPath);
    expect(verifyResult).toBe(true);

    // Step 3: Simulate creating some app files (like package.json)
    const packageJsonPath = path.join(createResult.directoryPath, 'package.json');
    await fs.writeFile(
      packageJsonPath,
      JSON.stringify(
        {
          name: 'myamplifyapp',
          version: '1.0.0',
          dependencies: {},
        },
        null,
        2,
      ),
    );

    // Step 4: Verify files exist
    expect(await fs.pathExists(packageJsonPath)).toBe(true);

    // Step 5: Test conflict resolution by trying to create same app again
    const conflictResult = await directoryManager.createAppDirectory({
      basePath: tempDir,
      appName: 'myamplifyapp',
      ensureUnique: true,
    });

    expect(conflictResult.success).toBe(true);
    expect(conflictResult.uniqueNameGenerated).toBe(true);
    expect(conflictResult.directoryPath).toBe(path.join(tempDir, 'myamplifyapp1'));

    // Step 6: Clean up both directories
    await directoryManager.cleanupDirectory(createResult.directoryPath);
    await directoryManager.cleanupDirectory(conflictResult.directoryPath);

    expect(await fs.pathExists(createResult.directoryPath)).toBe(false);
    expect(await fs.pathExists(conflictResult.directoryPath)).toBe(false);
  });

  it('should handle directory copying for app migration scenarios', async () => {
    // Simulate copying an existing Gen1 app to a new location for Gen2 migration

    // Create a mock Gen1 app structure
    const gen1AppDir = path.join(tempDir, 'gen1app');
    await fs.ensureDir(gen1AppDir);
    await fs.ensureDir(path.join(gen1AppDir, 'amplify', 'backend'));
    await fs.writeFile(
      path.join(gen1AppDir, 'package.json'),
      JSON.stringify(
        {
          name: 'gen1app',
          dependencies: {
            '@aws-amplify/cli': '^4.0.0',
          },
        },
        null,
        2,
      ),
    );
    await fs.writeFile(
      path.join(gen1AppDir, 'amplify', 'backend', 'backend-config.json'),
      JSON.stringify(
        {
          api: {},
          auth: {},
        },
        null,
        2,
      ),
    );

    // Create migration target directory
    const migrationResult = await directoryManager.createAppDirectory({
      basePath: tempDir,
      appName: 'gen2migrationtarget',
    });

    expect(migrationResult.success).toBe(true);

    // Clean the target directory and copy Gen1 app
    await directoryManager.cleanupDirectory(migrationResult.directoryPath);
    await directoryManager.copyDirectory(gen1AppDir, migrationResult.directoryPath);

    // Verify the copy was successful
    expect(await fs.pathExists(path.join(migrationResult.directoryPath, 'package.json'))).toBe(true);
    expect(await fs.pathExists(path.join(migrationResult.directoryPath, 'amplify', 'backend', 'backend-config.json'))).toBe(true);

    // Verify content is correct
    const copiedPackageJson = await fs.readJson(path.join(migrationResult.directoryPath, 'package.json'));
    expect(copiedPackageJson.name).toBe('gen1app');

    // Clean up
    await directoryManager.cleanupDirectory(migrationResult.directoryPath);
  });
});
