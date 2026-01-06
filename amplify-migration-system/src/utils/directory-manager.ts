/**
 * Directory management utilities for Amplify app initialization
 * Handles app directory creation, uniqueness guarantees, conflict resolution, and cleanup
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { ILogger } from '../interfaces';
import { LogContext } from '../types';

export interface DirectoryCreationOptions {
  /** Base path where the app directory should be created */
  basePath: string;
  /** Name of the app directory to create */
  appName: string;
  /** Whether to clean existing directory if it exists */
  cleanExisting?: boolean;
  /** Whether to create a unique directory name if conflict exists */
  ensureUnique?: boolean;
  /** Permissions to set on the created directory */
  permissions?: string | number;
}

export interface DirectoryCreationResult {
  /** Whether the directory was created successfully */
  success: boolean;
  /** Full path to the created directory */
  directoryPath: string;
  /** Whether an existing directory was cleaned */
  existingCleaned: boolean;
  /** Whether a unique name was generated */
  uniqueNameGenerated: boolean;
  /** Original name if unique name was generated */
  originalName?: string;
  /** Any errors that occurred */
  errors: string[];
  /** Any warnings that occurred */
  warnings: string[];
}

export interface IDirectoryManager {
  createAppDirectory(options: DirectoryCreationOptions): Promise<DirectoryCreationResult>;
  ensureUniqueDirectory(basePath: string, preferredName: string): Promise<string>;
  cleanupDirectory(directoryPath: string): Promise<void>;
  verifyDirectoryStructure(directoryPath: string): Promise<boolean>;
  copyDirectory(source: string, destination: string): Promise<void>;
}

export class DirectoryManager implements IDirectoryManager {
  constructor(private readonly logger: ILogger) {}

  async createAppDirectory(options: DirectoryCreationOptions): Promise<DirectoryCreationResult> {
    const context: LogContext = {
      appName: options.appName,
      operation: 'createAppDirectory',
    };

    const result: DirectoryCreationResult = {
      success: false,
      directoryPath: '',
      existingCleaned: false,
      uniqueNameGenerated: false,
      errors: [],
      warnings: [],
    };

    try {
      this.logger.info(`Creating app directory for ${options.appName}`, context);
      this.logger.debug(`Base path: ${options.basePath}`, context);
      this.logger.debug(`Options: ${JSON.stringify(options, null, 2)}`, context);

      // Validate base path exists
      if (!(await fs.pathExists(options.basePath))) {
        throw new Error(`Base path does not exist: ${options.basePath}`);
      }

      const baseStat = await fs.stat(options.basePath);
      if (!baseStat.isDirectory()) {
        throw new Error(`Base path is not a directory: ${options.basePath}`);
      }

      // Determine the target directory path
      let targetPath = path.join(options.basePath, options.appName);

      // Check if directory already exists
      const exists = await fs.pathExists(targetPath);
      if (exists) {
        this.logger.debug(`Directory already exists: ${targetPath}`, context);

        if (options.cleanExisting) {
          this.logger.info(`Cleaning existing directory: ${targetPath}`, context);
          await this.cleanupDirectory(targetPath);
          result.existingCleaned = true;
        } else if (options.ensureUnique) {
          this.logger.info(`Generating unique directory name for: ${options.appName}`, context);
          const uniqueAppName = await this.ensureUniqueDirectory(options.basePath, options.appName);
          targetPath = path.join(options.basePath, uniqueAppName);
          result.uniqueNameGenerated = true;
          result.originalName = options.appName;
          this.logger.info(`Generated unique name: ${uniqueAppName}`, context);
        } else {
          throw new Error(`Directory already exists and no conflict resolution specified: ${targetPath}`);
        }
      }

      // Create the directory
      await fs.ensureDir(targetPath);
      this.logger.debug(`Directory created: ${targetPath}`, context);

      // Set permissions if specified
      if (options.permissions !== undefined) {
        await fs.chmod(targetPath, options.permissions);
        this.logger.debug(`Set permissions ${options.permissions} on: ${targetPath}`, context);
      }

      // Verify the directory was created successfully
      const verificationResult = await this.verifyDirectoryStructure(targetPath);
      if (!verificationResult) {
        throw new Error(`Directory verification failed: ${targetPath}`);
      }

      result.success = true;
      result.directoryPath = targetPath;

      this.logger.info(`Successfully created app directory: ${targetPath}`, context);
      return result;
    } catch (error) {
      const errorMessage = `Failed to create app directory: ${(error as Error).message}`;
      result.errors.push(errorMessage);
      this.logger.error(errorMessage, error as Error, context);
      return result;
    }
  }

  async ensureUniqueDirectory(basePath: string, preferredName: string): Promise<string> {
    const context: LogContext = { operation: 'ensureUniqueDirectory' };

    try {
      this.logger.debug(`Ensuring unique directory name for: ${preferredName}`, context);

      let counter = 1;
      let candidateName = preferredName;
      let candidatePath = path.join(basePath, candidateName);

      // Keep trying until we find a unique name
      while (await fs.pathExists(candidatePath)) {
        candidateName = `${preferredName}${counter}`;
        candidatePath = path.join(basePath, candidateName);
        counter++;

        // Safety check to prevent infinite loops
        if (counter > 1000) {
          throw new Error(`Unable to generate unique directory name after 1000 attempts for: ${preferredName}`);
        }
      }

      this.logger.debug(`Generated unique directory name: ${candidateName}`, context);
      return candidateName;
    } catch (error) {
      this.logger.error(`Failed to ensure unique directory name for: ${preferredName}`, error as Error, context);
      throw error;
    }
  }

  async cleanupDirectory(directoryPath: string): Promise<void> {
    const context: LogContext = { operation: 'cleanupDirectory' };

    try {
      this.logger.debug(`Cleaning up directory: ${directoryPath}`, context);

      if (!(await fs.pathExists(directoryPath))) {
        this.logger.debug(`Directory does not exist, skipping cleanup: ${directoryPath}`, context);
        return;
      }

      const stat = await fs.stat(directoryPath);
      if (!stat.isDirectory()) {
        throw new Error(`Path is not a directory: ${directoryPath}`);
      }

      // Get directory contents for logging
      const contents = await fs.readdir(directoryPath);
      this.logger.debug(`Directory contains ${contents.length} items`, context);

      // Remove the directory and all its contents
      await fs.remove(directoryPath);
      this.logger.debug(`Successfully cleaned up directory: ${directoryPath}`, context);
    } catch (error) {
      this.logger.error(`Failed to cleanup directory: ${directoryPath}`, error as Error, context);
      throw error;
    }
  }

  async verifyDirectoryStructure(directoryPath: string): Promise<boolean> {
    const context: LogContext = { operation: 'verifyDirectoryStructure' };

    try {
      this.logger.debug(`Verifying directory structure: ${directoryPath}`, context);

      // Check if path exists
      if (!(await fs.pathExists(directoryPath))) {
        this.logger.debug(`Directory does not exist: ${directoryPath}`, context);
        return false;
      }

      // Check if it's actually a directory
      const stat = await fs.stat(directoryPath);
      if (!stat.isDirectory()) {
        this.logger.debug(`Path is not a directory: ${directoryPath}`, context);
        return false;
      }

      // Check if directory is readable and writable
      try {
        await fs.access(directoryPath, fs.constants.R_OK | fs.constants.W_OK);
      } catch (accessError) {
        this.logger.debug(`Directory is not readable/writable: ${directoryPath}`, context);
        return false;
      }

      // Test write permissions by creating and deleting a test file
      const testFilePath = path.join(directoryPath, '.directory-manager-test');
      try {
        await fs.writeFile(testFilePath, 'test');
        await fs.unlink(testFilePath);
      } catch (writeError) {
        this.logger.debug(`Cannot write to directory: ${directoryPath}`, context);
        return false;
      }

      this.logger.debug(`Directory structure verification passed: ${directoryPath}`, context);
      return true;
    } catch (error) {
      this.logger.debug(`Directory structure verification failed: ${directoryPath}`, context);
      return false;
    }
  }

  async copyDirectory(source: string, destination: string): Promise<void> {
    const context: LogContext = { operation: 'copyDirectory' };

    try {
      this.logger.info(`Copying directory: ${source} -> ${destination}`, context);

      // Validate source exists and is a directory
      if (!(await fs.pathExists(source))) {
        throw new Error(`Source directory does not exist: ${source}`);
      }

      const sourceStat = await fs.stat(source);
      if (!sourceStat.isDirectory()) {
        throw new Error(`Source path is not a directory: ${source}`);
      }

      // Ensure destination parent directory exists
      const destinationParent = path.dirname(destination);
      await fs.ensureDir(destinationParent);

      // Copy the directory
      await fs.copy(source, destination, {
        overwrite: false, // Don't overwrite existing files
        errorOnExist: true, // Throw error if destination exists
        preserveTimestamps: true, // Preserve file timestamps
      });

      // Verify the copy was successful
      const verificationResult = await this.verifyDirectoryStructure(destination);
      if (!verificationResult) {
        throw new Error(`Directory copy verification failed: ${destination}`);
      }

      this.logger.info(`Successfully copied directory: ${source} -> ${destination}`, context);
    } catch (error) {
      this.logger.error(`Failed to copy directory: ${source} -> ${destination}`, error as Error, context);
      throw error;
    }
  }
}
