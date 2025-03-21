# OpenAPI Specification Filter 

A utility to filter OpenAPI specifications by tags/paths while
maintaining component integrity. Designed to work with OpenAPI Generator
and resolve common validation issues.

## Features

- **Tag/Path Filtering**: Retain only specified endpoints by tags or
  regex path patterns
- **Component Cleanup**: Automatically remove unused
  schemas/parameters/responses
- **Validation Fixes**:
  - Handle circular references
  - Remove duplicate parameters
  - Preserve required error schemas
  - Maintain security scheme definitions
- **Customizable Whitelisting**: Force-include critical components
- **Multi-format Support**: Works with JSON/YAML specs

## Prerequisites

- Node.js v16+
- [OpenAPI Generator](https://openapi-generator.tech/docs/installation)
- An Original OpenAPI specification file (`openapi.json`)

## Installation

1.  Copy `migrate.js` to your project directory
2.  Place your OpenAPI specification as `openapi.json` in the same
    directory

## Usage

### Basic Filtering {#basic_filtering}

    # Filter by tags and generate minimal spec
    node migrate.js

### Generate Client SDK {#generate_client_sdk}

    # Generate Python client from filtered spec
    openapi-generator-cli generate \
      -i oai-miniclient.json \
      -g python \
      -o ./client-sdk \
      --skip-validate-spec

### Validation

    # Validate filtered spec
    npx @apidevtools/swagger-cli validate oai-miniclient.json

## Configuration

Modify the filter options in `migrate.js`:

``` javascript
const filteredByTag = filterOpenAPI(openApiSpec, {
  tags: ['User', 'Project'],          // Array of tags to include
  pathPattern: '^/api/v1',            // Regex pattern for paths
  excludeInternalComponents: false,   // Remove x-internal components
  alwaysIncludeComponents: [          // Always keep these components
    'Error',
    'SortOrder',
    'PageRequest'
  ]
});
```

## Options Reference 

| Option                        | Type         | Default   | Description                                  |
|-------------------------------|--------------|-----------|----------------------------------------------|
| `tags`                        | string\[\]   | \[]       | Include operations with these tags (OR)      |
| `pathPattern`                 | string       | null      | Regex pattern to match paths                 |
| `excludeInternalComponents`   | boolean      | false     | Remove components marked with x-internal     |
| `alwaysIncludeComponents`     | string\[\]   | \[]       | Components to preserve regardless of usage   |

## Troubleshooting

### Common Errors

- **Missing Components**
  - Add missing schema names to `alwaysIncludeComponents`
  - Example: `alwaysIncludeComponents: ['MissingSchema']`
- **Validation Failures**

<!-- -->

    # Temporary workaround for generation
    openapi-generator-cli generate [...] --skip-validate-spec

- **Duplicate Parameters**
  - The script automatically removes duplicates using
    `param.in + param.name`

### Debugging Tips 

1.  Validate before generation:

<!-- -->

    npx @apidevtools/swagger-cli validate oai-miniclient.json

1.  Keep `excludeInternalComponents: false` initially
2.  Gradually add to `alwaysIncludeComponents` to find missing
    dependencies

## Limitations

- Requires manual inclusion of some error schemas
- May need adjustment for non-standard component structures
- First run recommended without `excludeInternalComponents`

