const fs = require('fs');

// Read the OpenAPI file
const openApiSpec = JSON.parse(fs.readFileSync('openapi.json', 'utf-8'));

const COMPONENT_TYPES = [
    'schemas', 'responses', 'parameters', 'examples',
    'requestBodies', 'headers', 'securitySchemes'
];

function filterOpenAPI(spec, options = {}) {
    const {
        tags = [],
        pathPattern,
        excludeInternalComponents = false,
        alwaysIncludeComponents = []
    } = options;

    const filteredSpec = JSON.parse(JSON.stringify(spec));
    filteredSpec.paths = {};

    const usedTags = new Set();
    const pathRegex = pathPattern ? new RegExp(pathPattern) : null;
    const usedComponents = COMPONENT_TYPES.reduce((acc, type) => {
        acc[type] = new Set(alwaysIncludeComponents);
        return acc;
    }, { securitySchemes: new Set() });

    const seenObjects = new WeakSet();

    // Enhanced reference tracking
    function trackComponent(type, name) {
        if (!usedComponents[type].has(name)) {
            usedComponents[type].add(name);
            const component = spec.components?.[type]?.[name];
            if (component) collectReferences(component);
        }
    }

    function collectReferences(obj) {
        if (!obj || typeof obj !== 'object' || seenObjects.has(obj)) return;
        seenObjects.add(obj);

        // Handle $ref
        if (obj.$ref) {
            try {
                const refUrl = new URL(obj.$ref, 'file:///');
                if (refUrl.pathname === '/components') {
                    const [, , type, name] = refUrl.hash.split('/');
                    if (COMPONENT_TYPES.includes(type)) {
                        trackComponent(type, name);
                    }
                }
            } catch (e) {
                console.warn(`Invalid $ref: ${obj.$ref}`);
            }
        }

        // Handle schema composition
        ['allOf', 'anyOf', 'oneOf'].forEach(prop => {
            if (Array.isArray(obj[prop])) {
                obj[prop].forEach(s => collectReferences(s));
            }
        });

        // Handle schema properties
        if (obj.properties) Object.values(obj.properties).forEach(collectReferences);
        if (obj.items) collectReferences(obj.items);
        if (obj.additionalProperties) collectReferences(obj.additionalProperties);

        // Handle parameters
        if (obj.parameters) {
            obj.parameters.forEach(param => {
                if (param.$ref) collectReferences(param);
                if (param.schema) collectReferences(param.schema);
            });
        }

        // Handle content/schemas
        if (obj.content) {
            Object.values(obj.content).forEach(content => {
                if (content.schema) collectReferences(content.schema);
            });
        }

        // Handle security schemes
        if (obj.security) {
            obj.security.forEach(secReq => {
                Object.keys(secReq || {}).forEach(schemeName => {
                    usedComponents.securitySchemes.add(schemeName);
                });
            });
        }

        // Handle DTO patterns
        if (obj['x-responseDTO']) {
            trackComponent('schemas', obj['x-responseDTO']);
        }

        // Recursive collection
        for (const value of Object.values(obj)) {
            if (Array.isArray(value)) {
                value.forEach(item => collectReferences(item));
            } else if (typeof value === 'object') {
                collectReferences(value);
            }
        }
    }

    // Process paths and operations
    Object.entries(spec.paths || {}).forEach(([path, pathItem]) => {
        if (pathRegex && !pathRegex.test(path)) return;

        const filteredPathItem = {};
        let hasOperations = false;

        // Process path-level parameters
        if (pathItem.parameters) {
            collectReferences({ parameters: pathItem.parameters });
        }

        Object.entries(pathItem).forEach(([method, operation]) => {
            if (!['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'].includes(method)) {
                filteredPathItem[method] = operation;
                return;
            }

            // Tag filtering
            const operationTags = operation.tags || [];
            const shouldInclude = tags.length === 0 ||
                operationTags.some(tag => tags.includes(tag));

            if (!shouldInclude) return;

            operationTags.forEach(tag => usedTags.add(tag));
            filteredPathItem[method] = operation;
            hasOperations = true;

            // Deduplicate parameters
            if (operation.parameters) {
                const uniqueParams = [];
                const seenParams = new Set();
                operation.parameters.forEach(param => {
                    const key = `${param.in}.${param.name}`;
                    if (!seenParams.has(key)) {
                        seenParams.add(key);
                        uniqueParams.push(param);
                    }
                });
                operation.parameters = uniqueParams;
            }

            collectReferences(operation);
        });

        if (hasOperations) {
            filteredSpec.paths[path] = filteredPathItem;
            collectReferences(pathItem);
        }
    });

    // Process root-level security
    if (filteredSpec.security) {
        collectReferences({ security: filteredSpec.security });
    }

    // Force include common error components
    ['Error', 'Failure', 'ValidationError', 'AccessDeniedError', 'AuthzError'].forEach(name => {
        if (spec.components?.schemas?.[name]) {
            usedComponents.schemas.add(name);
            collectReferences(spec.components.schemas[name]);
        }
    });

    // Recursive component resolution
    let hasChanges;
    do {
        hasChanges = false;
        COMPONENT_TYPES.forEach(type => {
            Array.from(usedComponents[type]).forEach(name => {
                const component = spec.components?.[type]?.[name];
                if (component) {
                    const before = usedComponents[type].size;
                    collectReferences(component);
                    if (usedComponents[type].size > before) hasChanges = true;
                }
            });
        });
    } while (hasChanges);

    // Filter components
    if (spec.components) {
        filteredSpec.components = {};
        COMPONENT_TYPES.forEach(type => {
            if (spec.components[type]) {
                filteredSpec.components[type] = Object.fromEntries(
                    Object.entries(spec.components[type])
                        .filter(([name]) => usedComponents[type].has(name) &&
                            (!excludeInternalComponents || !spec.components[type][name]['x-internal']))
                );
                if (Object.keys(filteredSpec.components[type]).length === 0) {
                    delete filteredSpec.components[type];
                }
            }
        });
    }

    // Preserve security schemes
    if (spec.securitySchemes) {
        filteredSpec.securitySchemes = spec.securitySchemes;
    }

    // Filter tags
    filteredSpec.tags = (spec.tags || []).filter(tag =>
        usedTags.has(tag.name) &&
        (!excludeInternalComponents || !tag['x-internal'])
    );

    // Clean empty fields
    ['components', 'security', 'tags'].forEach(field => {
        if (filteredSpec[field] && Object.keys(filteredSpec[field]).length === 0) {
            delete filteredSpec[field];
        }
    });

    return filteredSpec;
}

// Updated usage with critical components always included
const filteredByTag = filterOpenAPI(openApiSpec, {
    tags: ['User', 'User Group', 'Service Account', 'Project', 'Token', 'Role Assignments', 'API Keys'],
    alwaysIncludeComponents: [
        'Error',
        'Failure',
        'SortOrder',
        'PageRequest',
        'ResponseDTO',
        'RestResponse',
        'ACLAggregateFilter',
        'UserGroupRequestV2',
        'RoleAssignmentFilter'
    ]
});

fs.writeFileSync('oai-miniclient.json', JSON.stringify(filteredByTag, null, 2));

console.log('Filtered OpenAPI spec generated successfully!');
