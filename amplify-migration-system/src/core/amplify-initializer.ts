/**
 * Amplify Initializer for executing amplify init programmatically
 * Uses the e2e-core utilities for reliable amplify init execution
 */

import { ILogger, IAppInitializer, InitializeAppOptions, InitializeAppWithAllocationOptions } from '../interfaces';
import { AppConfiguration, LogContext, InitializationResult, AtmosphereAllocation } from '../types';
import { initJSProjectWithProfile, initProjectWithAccessKey } from '@aws-amplify/amplify-e2e-core';

export interface AmplifyInitSettings {
  name: string;
  envName: string;
  editor: string;
  framework: string;
  srcDir: string;
  distDir: string;
  buildCmd: string;
  startCmd: string;
  profileName?: string;
  disableAmplifyAppCreation?: boolean;
  includeGen2RecommendationPrompt?: boolean;
  includeUsageDataPrompt?: boolean;
}

export class AmplifyInitializer implements IAppInitializer {
  constructor(private readonly logger: ILogger) {}

  async initializeAppWithAllocation(options: InitializeAppWithAllocationOptions): Promise<InitializationResult> {
    const { appPath, config, deploymentName, allocation } = options;

    if (!allocation) {
      const context: LogContext = { appName: deploymentName, operation: 'initializeAppWithCredentials' };
      const errorMessage = 'Credentials are required when calling initializeAppWithCredentials';
      this.logger.error(errorMessage, new Error('Missing credentials'), context);
      return this.createFailureResult(deploymentName, appPath, 0, [errorMessage]);
    }

    return await this.initializeApp({ appPath, config, deploymentName, allocation });
  }

  async initializeApp(options: InitializeAppOptions & { allocation?: AtmosphereAllocation }): Promise<InitializationResult> {
    const { appPath, config, deploymentName, allocation } = options;

    const context: LogContext = { appName: deploymentName, operation: 'initializeApp' };
    const authMethod = allocation ? 'atmosphere' : 'profile';

    this.logger.info(`Starting amplify init for ${deploymentName} (config: ${config.app.name}) with ${authMethod}`, context);
    this.logger.debug(`App path: ${appPath}`, context);
    this.logger.debug(`Configuration: ${JSON.stringify(config, null, 2)}`, context);
    this.logger.debug(`Deployment name: ${deploymentName}`, context);

    // Validate inputs
    const validationResult = this.validateInitializationInputs(deploymentName, appPath, context);
    if (!validationResult.success) {
      return validationResult;
    }

    const startTime = Date.now();
    try {
      // Choose initialization strategy based on whether credentials are provided
      if (allocation) {
        this.logger.info(`Calling initProjectWithAccessKey...`, context);
        const { accessKeyId, secretAccessKey, region } = allocation;
        await initProjectWithAccessKey(appPath, { accessKeyId, secretAccessKey, region });
      } else {
        this.logger.info(`Calling initJSProjectWithProfile...`, context);
        const settings = this.buildInitSettings(config, deploymentName);
        this.logger.debug(`Init settings: ${JSON.stringify(settings, null, 2)}`, context);
        await initJSProjectWithProfile(appPath, settings);
      }

      const duration = Date.now() - startTime;
      this.logger.info(`Successfully initialized Amplify app with ${authMethod}: ${deploymentName} (took ${duration}ms)`, context);

      // Verify initialization and return result
      const result = this.createSuccessResult(deploymentName, appPath, duration);
      this.verifyAndWarnAboutDirectories(appPath, result, context);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = `Failed to initialize Amplify app with ${authMethod}: ${deploymentName} (failed after ${duration}ms)`;
      this.logger.error(errorMessage, error as Error, context);
      this.logErrorDetails(error as Error, context);

      return this.createFailureResult(deploymentName, appPath, duration, [errorMessage]);
    }
  }

  private validateInitializationInputs(deploymentName: string, appPath: string, context: LogContext): InitializationResult {
    // Validate app name
    const nameValidation = this.validateAppName(deploymentName);
    if (!nameValidation.valid) {
      const errorMessage = `Invalid app name: ${nameValidation.error}`;
      this.logger.error(errorMessage, new Error('Invalid app name'), context);
      return this.createFailureResult(deploymentName, appPath, 0, [errorMessage]);
    }

    // Check if the app path exists and is writable
    try {
      const fs = require('fs');
      if (!fs.existsSync(appPath)) {
        const errorMessage = `App path does not exist: ${appPath}`;
        this.logger.error(errorMessage, new Error('Path not found'), context);
        return this.createFailureResult(deploymentName, appPath, 0, [errorMessage]);
      }

      // Test write permissions
      const testFile = require('path').join(appPath, '.amplify-init-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      this.logger.debug(`App path is writable: ${appPath}`, context);
    } catch (error) {
      const errorMessage = `App path is not accessible or writable: ${appPath}`;
      this.logger.error(errorMessage, error as Error, context);
      return this.createFailureResult(deploymentName, appPath, 0, [errorMessage]);
    }

    // Return success indicator (not a real result)
    return { success: true } as InitializationResult;
  }

  private verifyAndWarnAboutDirectories(appPath: string, result: InitializationResult, context: LogContext): void {
    const fs = require('fs');
    const path = require('path');
    const amplifyDir = path.join(appPath, 'amplify');
    const backendDir = path.join(appPath, 'amplify', 'backend');

    if (fs.existsSync(amplifyDir)) {
      this.logger.debug(`Amplify directory created: ${amplifyDir}`, context);
      if (fs.existsSync(backendDir)) {
        this.logger.debug(`Backend directory created: ${backendDir}`, context);
      } else {
        result.warnings.push(`Backend directory not found: ${backendDir}`);
        this.logger.warn(`Backend directory not found: ${backendDir}`, context);
      }
    } else {
      result.warnings.push(`Amplify directory not found: ${amplifyDir}`);
      this.logger.warn(`Amplify directory not found: ${amplifyDir}`, context);
    }
  }

  private createSuccessResult(appName: string, appPath: string, duration: number): InitializationResult {
    return {
      success: true,
      appName,
      appPath,
      duration,
      errors: [],
      warnings: [],
    };
  }

  private createFailureResult(appName: string, appPath: string, duration: number, errors: string[]): InitializationResult {
    return {
      success: false,
      appName,
      appPath,
      duration,
      errors,
      warnings: [],
    };
  }

  private logErrorDetails(error: Error, context: LogContext): void {
    this.logger.debug(`Error details:`, context);
    this.logger.debug(`- Error name: ${error.name}`, context);
    this.logger.debug(`- Error message: ${error.message}`, context);
    this.logger.debug(`- Error stack: ${error.stack}`, context);
  }

  async createAppDirectory(basePath: string, appName: string): Promise<string> {
    const context: LogContext = { appName, operation: 'createAppDirectory' };
    this.logger.info(`Creating app directory for ${appName}`, context);

    const path = require('path');
    const fs = require('fs');

    const appPath = path.join(basePath, appName);

    try {
      // Ensure the directory exists
      await fs.promises.mkdir(appPath, { recursive: true });
      this.logger.debug(`Created app directory: ${appPath}`, context);
      return appPath;
    } catch (error) {
      this.logger.error(`Failed to create app directory: ${appPath}`, error as Error, context);
      throw error;
    }
  }

  async verifyInitialization(appPath: string): Promise<boolean> {
    const context: LogContext = { operation: 'verifyInitialization' };
    this.logger.debug(`Verifying initialization for: ${appPath}`, context);

    try {
      const fs = require('fs');
      const path = require('path');

      // Check for amplify directory
      const amplifyDir = path.join(appPath, 'amplify');
      if (!fs.existsSync(amplifyDir)) {
        this.logger.debug(`Amplify directory not found: ${amplifyDir}`, context);
        return false;
      }

      // Check for backend directory
      const backendDir = path.join(amplifyDir, 'backend');
      if (!fs.existsSync(backendDir)) {
        this.logger.debug(`Backend directory not found: ${backendDir}`, context);
        return false;
      }

      this.logger.debug(`Initialization verification passed for: ${appPath}`, context);
      return true;
    } catch (error) {
      this.logger.debug(`Initialization verification failed for: ${appPath}`, context);
      return false;
    }
  }

  private validateAppName(appName: string): { valid: boolean; error?: string } {
    // Amplify app names must be alphanumeric only, 5-20 characters
    if (!appName) {
      return { valid: false, error: 'App name is required' };
    }

    if (appName.length < 3 || appName.length > 20) {
      return { valid: false, error: 'App name must be between 3-20 characters' };
    }

    // Check for alphanumeric only (no dashes, underscores, or special characters)
    const alphanumericRegex = /^[a-zA-Z0-9]+$/;
    if (!alphanumericRegex.test(appName)) {
      return {
        valid: false,
        error: 'App name must contain only alphanumeric characters (a-z, A-Z, 0-9). No dashes, underscores, or special characters allowed',
      };
    }

    return { valid: true };
  }

  private buildInitSettings(config: AppConfiguration, deploymentName: string): Partial<AmplifyInitSettings> {
    const settings = {
      name: deploymentName,
      envName: 'dev', // Default environment name
      editor: 'Visual Studio Code',
      framework: 'react',
      srcDir: 'src',
      distDir: 'dist',
      buildCmd: 'npm run build',
      startCmd: 'npm run start',
      profileName: 'default', // Use default AWS profile
      disableAmplifyAppCreation: config.disableAmplifyAppCreation,
      includeGen2RecommendationPrompt: true, // Handle Gen2 recommendation prompt
      includeUsageDataPrompt: true, // Handle usage data sharing prompt
    };

    // Log the settings being used
    const context: LogContext = { appName: deploymentName, operation: 'buildInitSettings' };
    this.logger.debug(`Built init settings for ${deploymentName} (config: ${config.app.name}):`, context);
    this.logger.debug(`- Name: ${settings.name}`, context);
    this.logger.debug(`- Environment: ${settings.envName}`, context);
    this.logger.debug(`- Using default selections for editor, framework, etc.`, context);
    this.logger.debug(`- Disable app creation: ${settings.disableAmplifyAppCreation}`, context);

    return settings;
  }
}
