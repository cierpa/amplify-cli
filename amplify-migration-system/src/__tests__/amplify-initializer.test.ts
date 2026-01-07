/**
 * Tests for AmplifyInitializer
 */

import { AmplifyInitializer } from '../core';
import { Logger } from '../utils/logger';
import { LogLevel } from '../types';

// Mock the e2e-core functions
jest.mock('@aws-amplify/amplify-e2e-core', () => ({
  initJSProjectWithProfile: jest.fn(),
  initProjectWithAccessKey: jest.fn(),
}));

describe('AmplifyInitializer', () => {
  let logger: Logger;
  let amplifyInitializer: AmplifyInitializer;

  beforeEach(() => {
    console.log('🧪 Setting up AmplifyInitializer unit test...');
    logger = new Logger(LogLevel.ERROR); // Use ERROR level to suppress logs during tests
    amplifyInitializer = new AmplifyInitializer(logger);
    jest.clearAllMocks();
    console.log('✅ Test setup complete');
  });

  describe('buildInitSettings', () => {
    it('should build correct settings for different app configurations', () => {
      console.log('🔧 Testing buildInitSettings method...');

      const config = {
        app: {
          name: 'customappname',
          description: 'Custom application',
        },
        categories: {
          api: {
            type: 'GraphQL' as const,
            authModes: ['COGNITO_USER_POOLS' as const],
          },
          auth: {
            signInMethods: ['email' as const],
            socialProviders: [],
          },
        },
        disableAmplifyAppCreation: true,
      };

      console.log(`📋 Input configuration:`, JSON.stringify(config, null, 2));

      const deploymentName = 'customAppDeployName';

      console.log(`📝 Deployment name: ${deploymentName}`);

      const profile = 'test-profile';
      console.log(`📝 Profile: ${profile}`);

      const settings = (amplifyInitializer as any).buildInitSettings({ config, deploymentName, profile });

      console.log(`⚙️  Generated settings:`, JSON.stringify(settings, null, 2));

      expect(settings.name).toBe(deploymentName);
      expect(settings.envName).toBe('dev');
      expect(settings.framework).toBe('react');
      expect(settings.editor).toBe('Visual Studio Code');
      expect(settings.srcDir).toBe('src');
      expect(settings.distDir).toBe('dist');
      expect(settings.buildCmd).toBe('npm run build');
      expect(settings.startCmd).toBe('npm run start');
      expect(settings.profileName).toBe('test-profile');
      expect(settings.disableAmplifyAppCreation).toBe(true);

      console.log('✅ All settings validation checks passed');
    });
  });

  describe('initializeApp', () => {
    it('should call initJSProjectWithProfile with correct settings', async () => {
      console.log('🚀 Testing initializeApp with mocked initJSProjectWithProfile...');

      const { initJSProjectWithProfile } = require('@aws-amplify/amplify-e2e-core');

      const config = {
        app: {
          name: 'mytestapp',
          description: 'Test application',
        },
        categories: {},
        disableAmplifyAppCreation: true,
      };

      const appPath = '/path/to/app';

      console.log('📋 Test config:', JSON.stringify(config, null, 2));
      console.log('📁 App path:', appPath);

      // Mock fs operations for path validation
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const deploymentName = 'mytestapp';
      const profile = 'test-profile';
      const startTime = Date.now();
      const result = await amplifyInitializer.initializeApp({
        appPath,
        config,
        deploymentName,
        profile,
      });
      const duration = Date.now() - startTime;

      console.log(`⏰ Test completed in ${duration}ms`);

      // Check the InitializationResult
      expect(result.success).toBe(true);
      expect(result.appName).toBe('mytestapp');
      expect(result.appPath).toBe(appPath);
      expect(result.errors).toHaveLength(0);
      expect(typeof result.duration).toBe('number');

      expect(initJSProjectWithProfile).toHaveBeenCalledWith(appPath, {
        name: 'mytestapp',
        envName: 'dev',
        editor: 'Visual Studio Code',
        framework: 'react',
        srcDir: 'src',
        distDir: 'dist',
        buildCmd: 'npm run build',
        startCmd: 'npm run start',
        profileName: 'test-profile',
        disableAmplifyAppCreation: true,
        includeGen2RecommendationPrompt: true,
        includeUsageDataPrompt: true,
      });

      console.log('✅ initializeApp test passed');
    });

    it('should handle errors from initJSProjectWithProfile', async () => {
      console.log('❌ Testing error handling in initializeApp...');

      const { initJSProjectWithProfile } = require('@aws-amplify/amplify-e2e-core');
      const error = new Error('Init failed');
      initJSProjectWithProfile.mockRejectedValue(error);

      const config = {
        app: {
          name: 'testapp',
          description: 'Test application',
        },
        categories: {},
        disableAmplifyAppCreation: true,
      };

      // Mock fs operations for path validation
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      console.log('🧪 Expecting initialization to fail...');
      const deploymentName = 'testapp';
      const result = await amplifyInitializer.initializeApp({ appPath: '/path/to/app', config, deploymentName });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to initialize Amplify app with profile: testapp');
      expect(result.appName).toBe('testapp');
      expect(result.appPath).toBe('/path/to/app');

      console.log('✅ Error handling test passed');
    });

    it('should validate app name constraints', async () => {
      console.log('🔍 Testing app name validation...');

      // Test invalid names
      const invalidNames = [
        { name: 'ap', expectedError: 'App name must be between 3-20 characters' },
        { name: 'verylongapplicationnamethatexceedslimit', expectedError: 'App name must be between 3-20 characters' },
        { name: 'my-app', expectedError: 'App name must contain only alphanumeric characters' },
        { name: 'my_app', expectedError: 'App name must contain only alphanumeric characters' },
        { name: 'app@123', expectedError: 'App name must contain only alphanumeric characters' },
        { name: '', expectedError: 'App name is required' },
      ];

      for (const { name, expectedError } of invalidNames) {
        const config = {
          app: { name, description: 'Test app' },
          categories: {},
          disableAmplifyAppCreation: true,
        };

        // Use the invalid name as the deploymentName to test validation
        const result = await amplifyInitializer.initializeApp({ appPath: '/valid/path', config, deploymentName: name });
        expect(result.success).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain(expectedError);
        console.log(`  ❌ Correctly rejected: "${name}"`);
      }
    });

    it('should call initProjectWithAccessKey when credentials are provided', async () => {
      console.log('🔑 Testing initializeApp with credentials...');

      const { initProjectWithAccessKey } = require('@aws-amplify/amplify-e2e-core');

      const config = {
        app: {
          name: 'mytestapp',
          description: 'Test application',
        },
        categories: {},
        disableAmplifyAppCreation: true,
      };

      const allocation = {
        accessKeyId: 'AKIA123456789',
        secretAccessKey: 'secret123',
        region: 'us-west-2',
      };

      const appPath = '/path/to/app';
      const deploymentName = 'mytestapp';

      // Mock fs operations for path validation
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      console.log('🧪 Testing with access key credentials...');
      const result = await amplifyInitializer.initializeApp({ appPath, config, deploymentName, allocation });

      expect(result.success).toBe(true);
      expect(result.appName).toBe('mytestapp');
      expect(result.appPath).toBe(appPath);
      expect(result.errors).toHaveLength(0);

      expect(initProjectWithAccessKey).toHaveBeenCalledWith(appPath, {
        accessKeyId: 'AKIA123456789',
        secretAccessKey: 'secret123',
        region: 'us-west-2',
        // name: 'mytestapp',
      });

      console.log('✅ initializeApp with credentials test passed');
    });

    it('should handle errors from initProjectWithAccessKey', async () => {
      console.log('❌ Testing error handling with access key credentials...');

      const { initProjectWithAccessKey } = require('@aws-amplify/amplify-e2e-core');
      const error = new Error('Access key init failed');
      initProjectWithAccessKey.mockRejectedValue(error);

      const config = {
        app: {
          name: 'testapp',
          description: 'Test application',
        },
        categories: {},
        disableAmplifyAppCreation: true,
      };

      const allocation = {
        accessKeyId: 'AKIA123456789',
        secretAccessKey: 'secret123',
        region: 'us-west-2',
        sessionToken: 'hsdjkflhdsjfhjklsdfjksf',
      };

      // Mock fs operations for path validation
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      console.log('🧪 Expecting access key initialization to fail...');
      const result = await amplifyInitializer.initializeApp({
        appPath: '/path/to/app',
        config,
        deploymentName: 'testapp',
        allocation,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to initialize Amplify app with atmosphere: testapp');
      expect(result.appName).toBe('testapp');
      expect(result.appPath).toBe('/path/to/app');

      console.log('✅ Access key error handling test passed');
    });
  });

  describe('initializeAppWithCredentials', () => {
    it('should fail when credentials are not provided', async () => {
      console.log('❌ Testing initializeAppWithCredentials without credentials...');

      const config = {
        app: {
          name: 'testapp',
          description: 'Test application',
        },
        categories: {},
        disableAmplifyAppCreation: true,
      };

      const result = await amplifyInitializer.initializeAppWithAllocation({
        appPath: '/path/to/app',
        config,
        deploymentName: 'testapp',
        allocation: undefined as any,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Credentials are required when calling initializeAppWithCredentials');
      expect(result.appName).toBe('testapp');
      expect(result.appPath).toBe('/path/to/app');

      console.log('✅ Missing credentials test passed');
    });
  });
});
