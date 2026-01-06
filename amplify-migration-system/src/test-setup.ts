/**
 * Jest Test Setup
 * Automatically loads environment variables from .gamma.env for all tests
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .gamma.env file
const envPath = path.join(__dirname, '..', '.gamma.env');
dotenv.config({ path: envPath });

// Log loaded environment variables for debugging
console.log('Test Environment Configuration:');
console.log('- ATMOSPHERE_ENDPOINT:', process.env.ATMOSPHERE_ENDPOINT || 'not set');
console.log('- DEFAULT_POOL:', process.env.DEFAULT_POOL || 'not set');
