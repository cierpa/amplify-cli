# Amplify Migration System

Comprehensive automation system for migrating AWS Amplify Gen1 applications to Gen2 with support for multiple apps and all Amplify categories.

## Features

### In-progress
- **Multi-App Support**: Migrate multiple apps (app-1 through app-4) with unique configurations
- **Category Support**: Full support for API, Auth, Storage, Function, and Hosting categories
- **Supervisor Model**: Sequential or parallel processing of multiple apps
- **Comprehensive Logging**: Detailed logging with progress tracking and report generation
### Complete
- **Environment Detection**: Automatic detection of Atmosphere vs Local environments
- **Flexible Authentication**: Support for AWS profiles, access keys, and Atmosphere credentials
- **Configuration-Driven**: JSON-based configuration for each app with comprehensive API documentation

## Installation

```bash
cd amplify-migration-system
npm install
npm run build
```

## Usage

### Basic Usage

```bash
# Migrate all available apps
npm run dev

# Migrate specific apps
npm run dev -- --apps app-1

# Parallel processing
npm run dev -- --parallel

# Dry run (show what would be done)
npm run dev -- --dry-run
```

#### Configure for Atmosphere
```bash
./scripts/config-atmosphere.sh # run this script and paste the output into your terminal
```

### CLI Options

- `--apps, -a`: Specific apps to migrate (e.g., app-1 app-2)
- `--parallel, -p`: Process apps in parallel
- `--dry-run, -d`: Show what would be done without executing
- `--cleanup, -c`: Clean up resources after migration
- `--verbose, -v`: Enable verbose logging
- `--profile`: AWS profile to use
- `--region`: AWS region to use
- `--list-apps, -l`: List available apps and exit
- `--validate-apps`: Validate all apps and exit

### Examples

```bash
# List all available apps
npm run dev -- --list-apps

# Validate all apps
npm run dev -- --validate-apps

# Migrate specific apps with verbose logging
npm run dev -- --apps app-1 app-2 --verbose

# Dry run with cleanup
npm run dev -- --dry-run --cleanup
```

## Configuration

Each app directory should contain a `migration-config.json` file that defines the app's migration requirements. These configurations are manually created based on the comprehensive API documentation in `MIGRATION_CONFIG.md`.

### Configuration Structure

- App metadata (name, description)
- Category configurations (API, Auth, Storage, Function, Hosting)
- Migration settings (optional)
- Dependencies (optional)

For complete API documentation and examples, see `MIGRATION_CONFIG.md`.

Example configuration:

```json
{
  "app": {
    "name": "project-boards",
    "description": "Project board app with authentication",
  },
  "categories": {
    "api": {
      "type": "GraphQL",
      "schema": "schema.graphql",
      "authModes": ["API_KEY", "COGNITO_USER_POOLS"]
    },
    "auth": {
      "signInMethods": ["email"],
      "socialProviders": []
    },
    "storage": {
      "buckets": [
        {
          "name": "images",
          "access": ["auth", "guest"]
        }
      ]
    },
    "function": {
      "functions": [
        {
          "name": "quotegenerator",
          "runtime": "nodejs",
          "template": "hello-world"
        }
      ]
    },
    "hosting": {
      "type": "amplify-console"
    }
  }
}
```

## Architecture

The system follows a modular architecture with:

- **ConfigurationLoader**: Manages app-specific configurations
- **EnvironmentDetector**: Detects Atmosphere vs Local environments
- **AppSelector**: Handles app discovery and selection
- **Logger**: Comprehensive logging with file output
- **FileManager**: File system operations

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
npm run test:watch
npm run test:coverage
```

### Linting

```bash
npm run lint
npm run lint:fix
```

## Environment Configuration

### Environment Detection

The system automatically detects the environment type based on the presence of specific environment variables from `.gamma.env`:

**Atmosphere Environment Detection:**
- Only if ALL three variables are present: `ATMOSPHERE_ENDPOINT`, and `DEFAULT_POOL`
- Environment type: `atmosphere`
- Uses CDK Atmosphere client for integration tests

**Local Environment Detection:**
- If ANY of the three variables are missing or not set, defaults to `local`
- Environment type: `local`
- Uses standard AWS credential chain (profiles, access keys, IAM roles) in environment

### Configuration File: `.gamma.env`

Create a `.gamma.env` file in the project root to configure Atmosphere environment:

```bash
# Atmosphere endpoint configuration
# Example format
ATMOSPHERE_ENDPOINT=https://my.atmosphere.endpoint.dev
DEFAULT_POOL=__exp.my-amplify-cli-pool__
```

**Important Notes:**
- `.gamma.env` is git-ignored
- Tests automatically load this file if present
- All three variables must be present for Atmosphere environment detection
- Missing or incomplete configuration defaults to Local environment

## Environment Support

### Local Environment
- Uses AWS profiles or access keys
- Standard AWS SDK credential chain
- CDK Atmosphere client optional
- No `.gamma.env` file required

### Atmosphere Environment
- Requires complete `.gamma.env` configuration
- Automatic credential detection through CDK Atmosphere client
- Managed credential lifecycle with automatic cleanup
- Pool-based resource allocation

## Logging

Logs are written to both console and file:
- Console: Colored, formatted output with progress indicators
- File: Structured logs in `./logs/` directory
- Export: JSON export of all log entries

## Error Handling

Comprehensive error handling with:
- Environment-specific error messages
- Graceful degradation for optional features
- Detailed error reporting and troubleshooting guidance

## License

Apache-2.0
