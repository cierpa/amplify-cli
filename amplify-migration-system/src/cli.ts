#!/usr/bin/env node

/**
 * CLI entry point for the Amplify Migration System
 */

import * as yargs from 'yargs';
import chalk from 'chalk';
import { Logger } from './utils/logger';
import { FileManager } from './utils/file-manager';
import { ConfigurationLoader } from './core/configuration-loader';
import { EnvironmentDetector } from './core/environment-detector';
import { AppSelector } from './core/app-selector';
import { AmplifyInitializer } from './core/amplify-initializer';
import { DirectoryManager } from './utils/directory-manager';
import { CDKAtmosphereIntegration } from './core/cdk-atmosphere-integration';
import { LogLevel, CLIOptions, AppConfiguration, InitializationResult, EnvironmentType, InitializeSingleAppParams, AtmosphereAllocation } from './types';
import { generateTimeBasedE2EAmplifyAppName } from './utils/math';

// Initialize core components
const logger = new Logger(LogLevel.INFO);
const fileManager = new FileManager(logger);
const configurationLoader = new ConfigurationLoader(logger, fileManager);
const environmentDetector = new EnvironmentDetector(logger);
const appSelector = new AppSelector(logger, fileManager);
const amplifyInitializer = new AmplifyInitializer(logger);
const directoryManager = new DirectoryManager(logger);
const cdkAtmosphereIntegration = new CDKAtmosphereIntegration(logger, environmentDetector);

// Default migration target directory
const MIGRATION_TARGET_DIR = './migration-output';

async function main(): Promise<void> {
  try {
    const argv = await yargs
      .scriptName('amplify-migrate')
      .usage('$0 [options]')
      .option('apps', {
        alias: 'a',
        type: 'array',
        description: 'Specific apps to migrate (e.g., app-1 app-2)',
        string: true,
      })
      .option('parallel', {
        alias: 'p',
        type: 'boolean',
        description: 'Process apps in parallel',
        default: false,
      })
      .option('dry-run', {
        alias: 'd',
        type: 'boolean',
        description: 'Show what would be done without executing',
        default: false,
      })
      .option('cleanup', {
        alias: 'c',
        type: 'boolean',
        description: 'Clean up resources after migration',
        default: false,
      })
      .option('verbose', {
        alias: 'v',
        type: 'boolean',
        description: 'Enable verbose logging',
        default: false,
      })
      .option('config', {
        type: 'string',
        description: 'Path to custom configuration file',
      })
      .option('profile', {
        type: 'string',
        description: 'AWS profile to use',
      })
      .option('region', {
        type: 'string',
        description: 'AWS region to use',
      })
      .option('list-apps', {
        alias: 'l',
        type: 'boolean',
        description: 'List available apps and exit',
        default: false,
      })
      .option('validate-apps', {
        type: 'boolean',
        description: 'Validate all apps and exit',
        default: false,
      })
      .option('create-amplify-app', {
        type: 'boolean',
        description: 'Create Amplify app in the cloud during init',
        default: true,
      })
      .help()
      .alias('help', 'h')
      .version()
      .alias('version', 'V')
      .example('$0', 'Migrate all available apps')
      .example('$0 -a app-1 app-2', 'Migrate specific apps')
      .example('$0 --parallel', 'Migrate all apps in parallel')
      .example('$0 --dry-run', 'Show what would be done')
      .example('$0 --list-apps', 'List all available apps').argv;

    // Set log level based on verbose flag
    if (argv.verbose) {
      logger.setLogLevel(LogLevel.DEBUG);
    }

    // Enable file logging
    const logDir = './logs';
    const logFile = `${logDir}/amplify-migration-${new Date().toISOString().split('T')[0]}.log`;
    logger.enableFileLogging(logFile);

    // Print banner
    printBanner();

    // Handle special commands
    if (argv['list-apps']) {
      await handleListApps();
      return;
    }

    if (argv['validate-apps']) {
      await handleValidateApps();
      return;
    }

    // Build CLI options
    const options: CLIOptions = {
      apps: argv.apps as string[],
      parallel: argv.parallel,
      dryRun: argv['dry-run'],
      cleanup: argv.cleanup,
      verbose: argv.verbose,
      config: argv.config,
      profile: argv.profile,
      region: argv.region,
      createAmplifyApp: argv['create-amplify-app'] as boolean,
    };

    // Detect environment and get credentials if needed
    logger.info('Detecting execution environment...');
    const environment = await environmentDetector.detectEnvironment();
    const environmentSummary = environmentDetector.getEnvironmentSummary();

    logger.info(`Environment: ${environment}`);
    logger.debug('Environment details:', environmentSummary);

    // Get appropriate credentials based on environment
    let atmosphereCredentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string; region: string } | undefined;

    if (environment === EnvironmentType.ATMOSPHERE) {
      logger.info('Atmosphere environment detected - obtaining atmosphere credentials...');

      try {
        const amplifyCredentials = await cdkAtmosphereIntegration.getCredentialsForAmplify();

        if (amplifyCredentials.method === 'atmosphere' && amplifyCredentials.accessKeyId && amplifyCredentials.secretAccessKey) {
          atmosphereCredentials = {
            accessKeyId: amplifyCredentials.accessKeyId,
            secretAccessKey: amplifyCredentials.secretAccessKey,
            sessionToken: amplifyCredentials.sessionToken,
            region: amplifyCredentials.region,
          };
          logger.info(`Successfully obtained atmosphere credentials for region ${amplifyCredentials.region}`);
        } else {
          throw new Error('Atmosphere credentials not available or invalid format');
        }
      } catch (atmosphereError) {
        logger.error(`Failed to get atmosphere credentials: ${(atmosphereError as Error).message}`);
        logger.error('Cannot proceed without atmosphere credentials in atmosphere environment');
        throw new Error(`Atmosphere environment detected but credentials unavailable: ${(atmosphereError as Error).message}`);
      }
    } else {
      logger.info('Local environment detected - will use CLI options or AWS profile for credentials');
    }

    // Select apps to process
    logger.info('Selecting apps for migration...');
    const selectedApps = await appSelector.selectApps(options);

    if (selectedApps.length === 0) {
      logger.warn('No apps selected for migration');
      return;
    }

    logger.info(`Selected ${selectedApps.length} apps: ${selectedApps.join(', ')}`);

    // Load configurations for selected apps
    logger.info('Loading app configurations...');
    const configurations = new Map<string, AppConfiguration>();

    for (const appName of selectedApps) {
      try {
        const config = await configurationLoader.loadAppConfiguration(appName);
        // Apply CLI override for createAmplifyApp option
        // CLI --no-create-amplify-app flag sets createAmplifyApp to false
        config.disableAmplifyAppCreation = !options.createAmplifyApp;
        configurations.set(appName, config);
        logger.info(`Loaded configuration for ${appName}`);
        logger.info(`disableAmplifyAppCreation: ${config.disableAmplifyAppCreation}`, { appName });
      } catch (error) {
        logger.error(`Failed to load configuration for ${appName}`, error as Error);
        if (!options.dryRun) {
          throw error;
        }
      }
    }

    if (options.dryRun) {
      logger.info('Dry run mode - showing what would be done:');
      await showDryRunSummary(selectedApps, configurations, options);
      return;
    }

    // Initialize apps sequentially
    logger.info('Starting app initialization...');
    const initializationResults = await initializeAppsSequentially(selectedApps, configurations, options, atmosphereCredentials);

    // Report initialization results
    reportInitializationResults(initializationResults);

    // Handle cleanup if requested
    if (options.cleanup) {
      logger.info('Cleanup flag set - cleaning up initialized apps...');
      await cleanupInitializedApps(initializationResults);
    }

    // Check if any initialization failed
    const failedApps = initializationResults.filter((r) => !r.success);
    if (failedApps.length > 0) {
      logger.warn(`${failedApps.length} app(s) failed to initialize`);
      process.exit(1);
    }

    logger.info('App initialization completed successfully');
    logger.info('Stopping before category processing as per current implementation scope');
  } catch (error) {
    logger.error('Migration failed', error as Error);
    process.exit(1);
  }
}

function printBanner(): void {
  console.log(
    chalk.cyan(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║           AWS Amplify Gen1 to Gen2 Migration System          ║
║                                                              ║
║  Automation for migrating Amplify applications from          ║
║           Gen1 to Gen2                                       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`),
  );
}

async function handleListApps(): Promise<void> {
  logger.info('Listing available apps...');

  try {
    const availableApps = await appSelector.discoverAvailableApps();
    const metadata = await appSelector.getAllAppMetadata();

    if (availableApps.length === 0) {
      console.log(chalk.yellow('No apps found in the apps directory'));
      return;
    }

    console.log(chalk.green(`\nFound ${availableApps.length} available apps:\n`));

    for (const appName of availableApps) {
      const appMetadata = metadata.get(appName);
      const description = (appMetadata?.description as string) || 'No description';
      const hasConfig = appMetadata?.hasConfig as boolean;
      const configStatus = hasConfig ? chalk.green('✓') : chalk.red('✗');

      console.log(`  ${chalk.cyan(appName.padEnd(10))} ${configStatus} ${description}`);
    }

    console.log(chalk.gray('\n  ✓ = Has migration config    ✗ = Missing migration config\n'));
  } catch (error) {
    logger.error('Failed to list apps', error as Error);
    process.exit(1);
  }
}

async function handleValidateApps(): Promise<void> {
  logger.info('Validating all apps...');

  try {
    const validationResults = await appSelector.validateAllApps();
    const metadata = await appSelector.getAllAppMetadata();

    console.log(chalk.green('\nApp Validation Results:\n'));

    for (const [appName, isValid] of validationResults) {
      const status = isValid ? chalk.green('✓ VALID') : chalk.red('✗ INVALID');
      const appMetadata = metadata.get(appName);
      const hasReadme = appMetadata?.hasReadme as boolean;
      const hasConfig = appMetadata?.hasConfig as boolean;

      console.log(`  ${appName.padEnd(10)} ${status}`);
      console.log(`    README: ${hasReadme ? chalk.green('✓') : chalk.red('✗')}`);
      console.log(`    Config: ${hasConfig ? chalk.green('✓') : chalk.red('✗')}`);
      console.log('');
    }
  } catch (error) {
    logger.error('Failed to validate apps', error as Error);
    process.exit(1);
  }
}

async function showDryRunSummary(
  selectedApps: string[],
  configurations: Map<string, AppConfiguration>,
  options: CLIOptions,
): Promise<void> {
  console.log(chalk.yellow('\n=== DRY RUN SUMMARY ===\n'));

  console.log(`Apps to process: ${selectedApps.length}`);
  console.log(`Processing mode: ${options.parallel ? 'Parallel' : 'Sequential'}`);
  console.log(`Cleanup after migration: ${options.cleanup ? 'Yes' : 'No'}`);
  console.log('');

  console.log(chalk.cyan('Initialization Actions:'));
  console.log(`  Migration target directory: ${MIGRATION_TARGET_DIR}`);
  console.log(
    `  Deployment names: Generated uniquely at runtime (e.g., e2e${new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(2, 17)})`,
  );
  console.log('');

  for (const appName of selectedApps) {
    const config = configurations.get(appName);
    console.log(chalk.cyan(`${appName}:`));

    if (config) {
      const appConfig = config as AppConfiguration;
      const categories = Object.keys(appConfig.categories || {});
      const sourceDir = appSelector.getAppPath(appName);

      console.log(`  Config app name: ${appConfig.app.name}`);
      console.log(`  Source directory: ${sourceDir}`);
      console.log(`  Would copy to: ${MIGRATION_TARGET_DIR}/<generated-deployment-name>`);
      console.log(`  Would run: amplify init with generated deployment name`);
      console.log(`  Categories: ${categories.join(', ') || 'None'}`);
    } else {
      console.log(chalk.red('  Configuration not loaded'));
    }
    console.log('');
  }

  console.log(chalk.yellow('=== END DRY RUN SUMMARY ===\n'));
}

/**
 * Initialize apps sequentially
 * Processes each app one at a time, copying the source directory and running amplify init
 */
async function initializeAppsSequentially(
  selectedApps: string[],
  configurations: Map<string, AppConfiguration>,
  options: CLIOptions,
  atmosphereAllocation?: AtmosphereAllocation,
): Promise<InitializationResult[]> {
  const results: InitializationResult[] = [];
  const fs = require('fs-extra');
  const path = require('path');

  // Ensure migration target directory exists
  const migrationTargetPath = path.resolve(process.cwd(), MIGRATION_TARGET_DIR);
  await fs.ensureDir(migrationTargetPath);
  logger.info(`Migration target directory: ${migrationTargetPath}`);

  for (let i = 0; i < selectedApps.length; i++) {
    const appName = selectedApps[i];
    const config = configurations.get(appName);

    logger.info(`Processing app ${i + 1}/${selectedApps.length}: ${appName}`);

    if (!config) {
      logger.error(`No configuration found for ${appName}`);
      results.push({
        success: false,
        appName,
        appPath: '',
        duration: 0,
        errors: [`No configuration found for ${appName}`],
        warnings: [],
      });
      continue;
    }

    try {
      const result = await initializeSingleApp({
        appName,
        config,
        migrationTargetPath,
        options,
        atmosphereAllocation,
      });
      results.push(result);

      if (result.success) {
        logger.info(`Successfully initialized ${appName}`);
      } else {
        logger.error(`Failed to initialize ${appName}: ${result.errors.join(', ')}`);
      }
    } catch (error) {
      logger.error(`Error initializing ${appName}`, error as Error);
      results.push({
        success: false,
        appName,
        appPath: '',
        duration: 0,
        errors: [(error as Error).message],
        warnings: [],
      });
    }
  }

  return results;
}

/**
 * Initialize a single app
 * Copies the source directory to the migration target and runs amplify init
 */
async function initializeSingleApp(params: InitializeSingleAppParams): Promise<InitializationResult> {
  const { appName, config, migrationTargetPath, atmosphereAllocation } = params;
  const startTime = Date.now();
  const context = { appName, operation: 'initializeSingleApp' };

  // Generate a unique deployment name for this initialization
  const deploymentName = generateTimeBasedE2EAmplifyAppName();
  logger.info(`Starting initialization for ${appName} with deployment name: ${deploymentName}`, context);

  // Get source app path
  const sourceAppPath = appSelector.getAppPath(appName);
  logger.debug(`Source app path: ${sourceAppPath}`, context);

  // Use the generated deployment name for the target directory
  const targetAppPath = `${migrationTargetPath}/${deploymentName}`;

  logger.debug(`Target app path: ${targetAppPath}`, context);
  logger.debug(`Config app name: ${config.app.name}`, context);

  try {
    // Create the target directory with conflict resolution
    const dirResult = await directoryManager.createAppDirectory({
      basePath: migrationTargetPath,
      appName: deploymentName,
      cleanExisting: true, // Clean existing directory if it exists
      ensureUnique: false,
    });

    if (!dirResult.success) {
      return {
        success: false,
        appName: deploymentName,
        appPath: targetAppPath,
        duration: Date.now() - startTime,
        errors: dirResult.errors,
        warnings: dirResult.warnings,
      };
    }

    logger.info(`Created target directory: ${dirResult.directoryPath}`, context);

    // Copy source directory to target
    logger.info(`Copying source directory to target...`, context);
    await directoryManager.copyDirectory(sourceAppPath, dirResult.directoryPath);
    logger.info(`Successfully copied source directory`, context);

    // Run amplify init in the copied directory
    logger.info(`Running amplify init in ${dirResult.directoryPath}`, context);

    // Choose the appropriate initialization method based on whether we have credentials
    let initResult: InitializationResult;
    if (atmosphereAllocation) {
      // Use initializeAppWithAllocation for atmosphere environment (with validation)
      logger.info('Using atmosphere credentials for Amplify initialization', context);

      initResult = await amplifyInitializer.initializeAppWithAllocation({
        appPath: dirResult.directoryPath,
        config,
        deploymentName,
        allocation: atmosphereAllocation,
      });
    } else {
      // Use initializeApp for local deployment
      logger.info('Using local credentials (CLI options or AWS profile) for Amplify initialization', context);
      initResult = await amplifyInitializer.initializeApp({
        appPath: dirResult.directoryPath,
        config,
        deploymentName,
      });
    }

    // Combine results
    return {
      success: initResult.success,
      appName: deploymentName,
      appPath: dirResult.directoryPath,
      duration: Date.now() - startTime,
      amplifyVersion: initResult.amplifyVersion,
      errors: [...dirResult.errors, ...initResult.errors],
      warnings: [...dirResult.warnings, ...initResult.warnings],
    };
  } catch (error) {
    logger.error(`Failed to initialize ${appName}`, error as Error, context);
    return {
      success: false,
      appName: deploymentName,
      appPath: targetAppPath,
      duration: Date.now() - startTime,
      errors: [(error as Error).message],
      warnings: [],
    };
  }
}

/**
 * Report initialization results to the console
 */
function reportInitializationResults(results: InitializationResult[]): void {
  console.log(chalk.cyan('\n=== INITIALIZATION RESULTS ===\n'));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`Total apps processed: ${results.length}`);
  console.log(`Successful: ${chalk.green(successful.length.toString())}`);
  console.log(`Failed: ${chalk.red(failed.length.toString())}`);
  console.log('');

  for (const result of results) {
    const status = result.success ? chalk.green('✓ SUCCESS') : chalk.red('✗ FAILED');
    const duration = `${(result.duration / 1000).toFixed(2)}s`;

    console.log(`${result.appName}: ${status} (${duration})`);
    console.log(`  Path: ${result.appPath}`);

    if (result.errors.length > 0) {
      console.log(`  Errors:`);
      for (const error of result.errors) {
        console.log(`    - ${chalk.red(error)}`);
      }
    }

    if (result.warnings.length > 0) {
      console.log(`  Warnings:`);
      for (const warning of result.warnings) {
        console.log(`    - ${chalk.yellow(warning)}`);
      }
    }

    console.log('');
  }

  console.log(chalk.cyan('=== END INITIALIZATION RESULTS ===\n'));
}

/**
 * Clean up initialized apps
 * Removes the migration target directories for all initialized apps
 */
async function cleanupInitializedApps(results: InitializationResult[]): Promise<void> {
  logger.info('Cleaning up initialized apps...');

  for (const result of results) {
    if (result.appPath) {
      try {
        logger.info(`Cleaning up: ${result.appPath}`);
        await directoryManager.cleanupDirectory(result.appPath);
        logger.info(`Successfully cleaned up: ${result.appPath}`);
      } catch (error) {
        logger.error(`Failed to cleanup ${result.appPath}`, error as Error);
      }
    }
  }

  logger.info('Cleanup completed');
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason as Error);
  process.exit(1);
});

// Run the CLI
if (require.main === module) {
  main().catch((error) => {
    console.error(chalk.red('Fatal error:'), error.message);
    process.exit(1);
  });
}
