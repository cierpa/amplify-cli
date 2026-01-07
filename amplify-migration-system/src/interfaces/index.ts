/**
 * Core interfaces for the Amplify Migration System
 */

import {
  AppConfiguration,
  EnvironmentType,
  AtmosphereAllocation,
  AmplifyCredentials,
  ValidationResult,
  MigrationResult,
  LogLevel,
  LogContext,
  CLIOptions,
} from '../types';

// Configuration Management
export interface IConfigurationLoader {
  loadAppConfiguration(appName: string): Promise<AppConfiguration>;
  loadAllConfigurations(): Promise<Map<string, AppConfiguration>>;
  validateConfiguration(config: AppConfiguration): ValidationResult;
  saveConfiguration(appName: string, config: AppConfiguration): Promise<void>;
}

// Environment Detection and Authentication
export interface IEnvironmentDetector {
  detectEnvironment(): Promise<EnvironmentType>;
  isAtmosphereEnvironment(): Promise<boolean>;
  getEnvironmentVariables(): Record<string, string>;
}

// CDK Atmosphere Client Integration
export interface ICDKAtmosphereIntegration {
  isAtmosphereEnvironment(): Promise<boolean>;
  initializeForAtmosphere(): Promise<AtmosphereAllocation>;
  getCredentialsForAmplify(): Promise<AmplifyCredentials>;
  cleanup(): Promise<void>;
}

// App Selection and Management
export interface IAppSelector {
  discoverAvailableApps(): Promise<string[]>;
  validateAppExists(appName: string): Promise<boolean>;
  selectApp(options: CLIOptions): Promise<string>;
  getAppPath(appName: string): string;
}

export interface InitializeAppOptions {
  appPath: string;
  config: AppConfiguration;
  deploymentName: string;
}

export interface InitializeAppWithAllocationOptions {
  appPath: string;
  config: AppConfiguration;
  deploymentName: string;
  allocation?: AtmosphereAllocation;
}

export interface IAppInitializer {
  initializeApp(options: InitializeAppOptions): Promise<void>;
  initializeAppWithAllocation(options: InitializeAppWithAllocationOptions): Promise<void>;
  createAppDirectory(basePath: string, appName: string): Promise<string>;
}

// Logging System
export interface ILogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;

  startOperation(operationName: string, context?: LogContext): void;
  endOperation(operationName: string, success: boolean, context?: LogContext): void;

  logProgress(current: number, total: number, message?: string): void;
  logAppProgress(appName: string, step: string, progress: number): void;

  setLogLevel(level: LogLevel): void;
  enableFileLogging(filePath: string): void;
  disableFileLogging(): void;

  generateReport(result: MigrationResult): string;
  exportLogs(filePath: string): Promise<void>;
}

// Utility Interfaces
export interface IFileManager {
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  copyFile(source: string, destination: string): Promise<void>;
  deleteFile(filePath: string): Promise<void>;
  ensureDirectory(dirPath: string): Promise<void>;
  listFiles(dirPath: string, pattern?: string): Promise<string[]>;
  listDirectories(dirPath: string): Promise<string[]>;
  pathExists(filePath: string): Promise<boolean>;
  isDirectory(dirPath: string): Promise<boolean>;
  isFile(filePath: string): Promise<boolean>;
  readJsonFile<T = unknown>(filePath: string): Promise<T>;
}
