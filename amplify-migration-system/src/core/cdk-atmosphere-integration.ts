/**
 * CDK Atmosphere Client Integration
 * Handles detection and integration with Atmosphere environments while supporting local AWS configurations
 */

import { ICDKAtmosphereIntegration, ILogger, IEnvironmentDetector } from '../interfaces';
import { AmplifyCredentials, EnvironmentType, LogContext, AtmosphereAllocation } from '../types';
import { AtmosphereClient } from '@cdklabs/cdk-atmosphere-client';

export class CDKAtmosphereIntegration implements ICDKAtmosphereIntegration {
  private atmosphereClient?: any;
  private isInitialized = false;
  private cachedAllocation?: AtmosphereAllocation;
  private allocationId?: string;

  constructor(private readonly logger: ILogger, private readonly environmentDetector: IEnvironmentDetector) {}

  async isAtmosphereEnvironment(): Promise<boolean> {
    const context: LogContext = { operation: 'isAtmosphereEnvironment' };

    try {
      const envType = await this.environmentDetector.detectEnvironment();
      const isAtmosphere = envType === EnvironmentType.ATMOSPHERE;

      this.logger.debug(`Environment type detected: ${envType}`, context);
      return isAtmosphere;
    } catch (error) {
      this.logger.error('Failed to detect environment type', error as Error, context);
      return false;
    }
  }

  async initializeForAtmosphere(): Promise<AtmosphereAllocation> {
    const context: LogContext = { operation: 'initializeForAtmosphere' };
    this.logger.info('Initializing CDK Atmosphere client for Atmosphere environment', context);

    if (this.cachedAllocation) {
      this.logger.debug('Using cached Atmosphere credentials', context);
      return this.cachedAllocation;
    }

    // try {
    const atmosphereEndpoint = process.env.ATMOSPHERE_ENDPOINT;
    if (!atmosphereEndpoint) {
      throw Error('ATMOSPHERE_ENDPOINT must be configured as an env variable.');
    }
    this.atmosphereClient = new AtmosphereClient(atmosphereEndpoint, {
      // Optional: change logStream if needed for debugging
      logStream: process.stdout,
    });

    this.logger.debug(`Initialized Atmosphere client with endpoint: ${atmosphereEndpoint}`, context);

    // Get allocation from Atmosphere
    const allocation = await this.getAtmosphereCredentials();

    this.cachedAllocation = allocation;
    this.isInitialized = true;

    this.logger.info('Successfully initialized CDK Atmosphere client', context);
    return allocation;
  }

  async getCredentialsForAmplify(): Promise<AmplifyCredentials> {
    const context: LogContext = { operation: 'getCredentialsForAmplify' };

    const isAtmosphere = await this.isAtmosphereEnvironment();

    if (isAtmosphere) {
      try {
        const allocation = await this.initializeForAtmosphere();

        const amplifyCredentials: AmplifyCredentials = {
          method: 'atmosphere',
          accessKeyId: allocation.accessKeyId,
          secretAccessKey: allocation.secretAccessKey,
          sessionToken: allocation.sessionToken,
          region: allocation.region,
        };

        this.logger.debug('Converted Atmosphere credentials to Amplify format', context);
        return amplifyCredentials;
      } catch (atmosphereError) {
        throw Error(`Atmosphere credentials failed: ${(atmosphereError as Error).message}`);
      }
    } else {
      throw Error('Must use Atmosphere for this method');
    }
  }

  async cleanup(): Promise<void> {
    const context: LogContext = { operation: 'cleanup' };
    const isAtmosphere = await this.isAtmosphereEnvironment();

    if (!isAtmosphere) {
      this.logger.debug('Not in Atmosphere environment, skipping Atmosphere cleanup.');
      return;
    }

    this.logger.debug('Cleaning up CDK Atmosphere client', context);

    try {
      // Release the Atmosphere allocation if we have one
      if (this.atmosphereClient && this.allocationId) {
        this.logger.debug(`Releasing Atmosphere allocation: ${this.allocationId}`, context);
        await this.atmosphereClient.release(this.allocationId, 'success');
        this.allocationId = undefined;
      }

      // Clean up client reference
      this.atmosphereClient = undefined;
      this.cachedAllocation = undefined;
      this.isInitialized = false;

      this.logger.debug('Successfully cleaned up CDK Atmosphere client', context);
    } catch (error) {
      this.logger.error('Failed to cleanup CDK Atmosphere client', error as Error, context);
      throw error;
    }
  }

  private async getAtmosphereCredentials(): Promise<AtmosphereAllocation> {
    const context: LogContext = { operation: 'getAtmosphereCredentials' };

    try {
      if (!this.atmosphereClient) {
        throw Error('Atmosphere client not initialized');
      }

      if (!process.env.DEFAULT_POOL) {
        throw Error('DEFAULT_POOL must be present in env vars');
      }

      // Use the correct acquire pattern from CDK team implementation
      this.logger.debug('Using acquire() method to get Atmosphere environment allocation', context);

      // Get pool and requester from environment variables or use defaults
      const poolName = process.env.DEFAULT_POOL;
      const requesterName = process.env.USER || process.env.USERNAME || 'amplify-migration-system';

      // Avoid logging potentially sensitive requester identity derived from environment variables
      this.logger.debug(`Acquiring environment allocation from pool: ${poolName}`, context);

      const allocation = await this.atmosphereClient.acquire({
        pool: poolName,
        requester: requesterName,
        timeoutSeconds: 60 * 30, // 30 minutes timeout (as per working example)
      });

      this.logger.debug('Successfully acquired environment allocation from Atmosphere', context);

      // Extract credentials from the allocation using the correct structure
      if (!allocation) {
        throw new Error('No allocation returned from Atmosphere');
      }

      if (!allocation.credentials) {
        throw new Error('No credentials found in Atmosphere allocation');
      }

      if (!allocation.environment) {
        throw new Error('No environment found in Atmosphere allocation');
      }

      const { credentials, environment } = allocation;

      if (!credentials.accessKeyId || !credentials.secretAccessKey) {
        throw new Error('Invalid credentials format from Atmosphere allocation');
      }

      // Store the allocation ID for later release
      this.allocationId = allocation.id;

      const atmosphereAllocation: AtmosphereAllocation = {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken || '',
        region: environment.region,
      };

      this.logger.info(`Successfully extracted credentials from Atmosphere allocation ${allocation.id}`, context);
      this.logger.debug(`Account: ${environment.account}, Region: ${environment.region}`, context);

      return atmosphereAllocation;
    } catch (error) {
      this.logger.error('Failed to get Atmosphere credentials', error as Error, context);
      throw error;
    }
  }

  // Utility methods for testing and debugging
  getInitializationStatus(): boolean {
    return this.isInitialized;
  }

  hasValidCredentials(): boolean {
    return !!this.cachedAllocation && !!this.cachedAllocation.accessKeyId && !!this.cachedAllocation.secretAccessKey;
  }

  getCredentialsSummary(): Record<string, unknown> {
    if (!this.cachedAllocation) {
      return { status: 'no-credentials' };
    }

    return {
      status: 'credentials-available',
      region: this.cachedAllocation.region,
      hasAccessKey: !!this.cachedAllocation.accessKeyId,
      hasSecretKey: !!this.cachedAllocation.secretAccessKey,
      hasSessionToken: !!this.cachedAllocation.sessionToken,
    };
  }
}
