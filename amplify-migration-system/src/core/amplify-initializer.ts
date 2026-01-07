/**
 * Amplify Initializer for executing amplify init programmatically
 * Uses the e2e-core utilities for reliable amplify init execution
 */

import { ILogger, IAppInitializer, InitializeAppOptions, InitializeAppWithAllocationOptions } from '../interfaces';
import { AppConfiguration, LogContext, AtmosphereAllocation } from '../types';
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

interface BuildInitSettingsOptions {
  config: AppConfiguration;
  deploymentName: string;
  profile?: string;
}

export class AmplifyInitializer implements IAppInitializer {
  constructor(private readonly logger: ILogger) {}

  async initializeAppWithAllocation(options: InitializeAppWithAllocationOptions): Promise<void> {
    const { appPath, config, deploymentName, allocation } = options;

    if (!allocation) {
      throw Error('An allocation is required when calling initializeAppWithAllocation.');
    }

    await this.initializeApp({ appPath, config, deploymentName, allocation });
  }

  async initializeApp(options: InitializeAppOptions & { allocation?: AtmosphereAllocation; profile?: string }): Promise<void> {
    const { appPath, config, deploymentName, allocation, profile } = options;

    const context: LogContext = { appName: deploymentName, operation: 'initializeApp' };
    const authMethod = allocation ? 'atmosphere' : 'profile';

    this.logger.info(`Starting amplify init for ${deploymentName} (config: ${config.app.name}) with ${authMethod}`, context);
    this.logger.debug(`App path: ${appPath}`, context);
    this.logger.debug(`Configuration: ${JSON.stringify(config, null, 2)}`, context);
    this.logger.debug(`Deployment name: ${deploymentName}`, context);

    // Validate app name
    const nameValidation = this.validateAppName(deploymentName);
    if (!nameValidation.valid) {
      throw Error(`Invalid app name: ${nameValidation.error}`);
    }

    const startTime = Date.now();
    try {
      // Choose initialization strategy based on whether credentials are provided
      if (allocation) {
        this.logger.info(`Calling initProjectWithAccessKey...`, context);
        const { accessKeyId, secretAccessKey, region } = allocation;
        // create a profile file and use the same function as profile
        await initProjectWithAccessKey(appPath, { accessKeyId, secretAccessKey, region });
      } else {
        this.logger.info(`Calling initJSProjectWithProfile...`, context);
        const settings = this.buildInitSettings({ config, deploymentName, profile });
        this.logger.debug(`Init settings: ${JSON.stringify(settings, null, 2)}`, context);
        await initJSProjectWithProfile(appPath, settings);
      }

      const duration = Date.now() - startTime;
      this.logger.info(
        `Successfully initialized Amplify app using ${authMethod} method in ${appPath}, ${deploymentName} (took ${duration}ms)`,
        context,
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logErrorDetails(error as Error, context);
      throw Error(`Failed to initialize Amplify app with ${authMethod}: ${deploymentName} (failed after ${duration}ms)`);
    }
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

  validateAppName(appName: string): { valid: boolean; error?: string } {
    // Amplify app names must be alphanumeric only, 3-20 characters
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

  private buildInitSettings(options: BuildInitSettingsOptions): Partial<AmplifyInitSettings> {
    const { config, deploymentName, profile } = options;
    const settings = {
      name: deploymentName,
      envName: 'main', // Default environment name
      editor: 'Visual Studio Code',
      framework: 'react', // parameterize this
      srcDir: 'src',
      distDir: 'dist',
      buildCmd: 'npm run build',
      startCmd: 'npm run start',
      profileName: profile,
      disableAmplifyAppCreation: false, // always create app in Amplify console
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
