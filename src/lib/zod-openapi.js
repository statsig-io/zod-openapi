"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSchema = exports.extendApi = void 0;
const ts_deepmerge_1 = require("ts-deepmerge");
const zod_1 = require("zod");
function extendApi(schema, schemaObject = {}) {
    const This = schema.constructor;
    const newSchema = new This(schema._def);
    newSchema.metaOpenApi = Object.assign({}, schema.metaOpenApi || {}, schemaObject);
    return newSchema;
}
exports.extendApi = extendApi;
function iterateZodObject({ zodRef, useOutput, hideDefinitions, openApiVersion, }) {
    const reduced = Object.keys(zodRef.shape)
        .filter((key) => (hideDefinitions === null || hideDefinitions === void 0 ? void 0 : hideDefinitions.includes(key)) === false)
        .reduce((carry, key) => (Object.assign(Object.assign({}, carry), { [key]: generateSchema(zodRef.shape[key], useOutput, openApiVersion) })), {});
    return reduced;
}
function typeFormat(type, openApiVersion) {
    return openApiVersion === '3.0' ? type : [type];
}
function parseTransformation({ zodRef, schemas, useOutput, openApiVersion, }) {
    const input = generateSchema(zodRef._def.schema, useOutput, openApiVersion);
    let output = 'undefined';
    if (useOutput && zodRef._def.effect) {
        const effect = zodRef._def.effect.type === 'transform' ? zodRef._def.effect : null;
        if (effect && 'transform' in effect) {
            try {
                const type = Array.isArray(input.type) ? input.type[0] : input.type;
                output = typeof effect.transform(['integer', 'number'].includes(`${type}`)
                    ? 0
                    : 'string' === type
                        ? ''
                        : 'boolean' === type
                            ? false
                            : 'object' === type
                                ? {}
                                : 'null' === type
                                    ? null
                                    : 'array' === type
                                        ? []
                                        : undefined, { addIssue: () => undefined, path: [] } // TODO: Discover if context is necessary here
                );
            }
            catch (e) {
                /**/
            }
        }
    }
    const outputType = output;
    return (0, ts_deepmerge_1.default)(Object.assign(Object.assign(Object.assign({}, (zodRef.description ? { description: zodRef.description } : {})), input), (['number', 'string', 'boolean', 'null'].includes(output)
        ? {
            type: typeFormat(outputType, openApiVersion),
        }
        : {})), ...schemas);
}
function parseString({ zodRef, schemas, openApiVersion, }) {
    const baseSchema = {
        type: typeFormat('string', openApiVersion),
    };
    const { checks = [] } = zodRef._def;
    checks.forEach((item) => {
        switch (item.kind) {
            case 'email':
                baseSchema.format = 'email';
                break;
            case 'uuid':
                baseSchema.format = 'uuid';
                break;
            case 'cuid':
                baseSchema.format = 'cuid';
                break;
            case 'url':
                baseSchema.format = 'uri';
                break;
            case 'datetime':
                baseSchema.format = 'date-time';
                break;
            case 'length':
                baseSchema.minLength = item.value;
                baseSchema.maxLength = item.value;
                break;
            case 'max':
                baseSchema.maxLength = item.value;
                break;
            case 'min':
                baseSchema.minLength = item.value;
                break;
            case 'regex':
                baseSchema.pattern = item.regex.source;
                break;
        }
    });
    return (0, ts_deepmerge_1.default)(baseSchema, zodRef.description ? { description: zodRef.description } : {}, ...schemas);
}
function parseNumber({ zodRef, schemas, openApiVersion, }) {
    const baseSchema = {
        type: typeFormat('number', openApiVersion),
    };
    const { checks = [] } = zodRef._def;
    checks.forEach((item) => {
        switch (item.kind) {
            case 'max':
                if (item.inclusive || openApiVersion === '3.0') {
                    baseSchema.maximum = item.value;
                }
                if (!item.inclusive) {
                    if (openApiVersion === '3.0') {
                        // exclusiveMaximum has conflicting types in oas31 and oas30
                        baseSchema.exclusiveMaximum = true;
                    }
                    else {
                        baseSchema.exclusiveMaximum = item.value;
                    }
                }
                break;
            case 'min':
                if (item.inclusive || openApiVersion === '3.0') {
                    baseSchema.minimum = item.value;
                }
                if (!item.inclusive) {
                    if (openApiVersion === '3.0') {
                        // exclusiveMinimum has conflicting types in oas31 and oas30
                        baseSchema.exclusiveMinimum = true;
                    }
                    else {
                        baseSchema.exclusiveMinimum = item.value;
                    }
                }
                break;
            case 'int':
                baseSchema.type = typeFormat('integer', openApiVersion);
                break;
            case 'multipleOf':
                baseSchema.multipleOf = item.value;
                break;
        }
    });
    return (0, ts_deepmerge_1.default)(baseSchema, zodRef.description ? { description: zodRef.description } : {}, ...schemas);
}
function getExcludedDefinitionsFromSchema(schemas) {
    const excludedDefinitions = [];
    for (const schema of schemas) {
        if (Array.isArray(schema.hideDefinitions)) {
            excludedDefinitions.push(...schema.hideDefinitions);
        }
    }
    return excludedDefinitions;
}
function parseObject({ zodRef, schemas, useOutput, hideDefinitions, openApiVersion, }) {
    var _a;
    let additionalProperties;
    // `catchall` obviates `strict`, `strip`, and `passthrough`
    if (!(zodRef._def.catchall instanceof zod_1.z.ZodNever ||
        ((_a = zodRef._def.catchall) === null || _a === void 0 ? void 0 : _a._def.typeName) === 'ZodNever'))
        additionalProperties = generateSchema(zodRef._def.catchall, useOutput, openApiVersion);
    else if (zodRef._def.unknownKeys === 'passthrough')
        additionalProperties = true;
    else if (zodRef._def.unknownKeys === 'strict')
        additionalProperties = false;
    // So that `undefined` values don't end up in the schema and be weird
    additionalProperties =
        additionalProperties != null ? { additionalProperties } : {};
    const requiredProperties = Object.keys(zodRef.shape).filter((key) => {
        const item = zodRef.shape[key];
        return (!(item.isOptional() ||
            item instanceof zod_1.z.ZodDefault ||
            item._def.typeName === 'ZodDefault') && !(item instanceof zod_1.z.ZodNever || item._def.typeName === 'ZodDefault'));
    });
    const required = requiredProperties.length > 0 ? { required: requiredProperties } : {};
    return (0, ts_deepmerge_1.default)(Object.assign(Object.assign(Object.assign({ type: typeFormat('object', openApiVersion), properties: iterateZodObject({
            zodRef: zodRef,
            schemas,
            useOutput,
            hideDefinitions: getExcludedDefinitionsFromSchema(schemas),
            openApiVersion,
        }) }, required), additionalProperties), hideDefinitions), zodRef.description ? { description: zodRef.description, hideDefinitions } : {}, ...schemas);
}
function parseRecord({ zodRef, schemas, useOutput, openApiVersion, }) {
    return (0, ts_deepmerge_1.default)({
        type: typeFormat('object', openApiVersion),
        additionalProperties: zodRef._def.valueType instanceof zod_1.z.ZodUnknown
            ? {}
            : generateSchema(zodRef._def.valueType, useOutput, openApiVersion),
    }, zodRef.description ? { description: zodRef.description } : {}, ...schemas);
}
function parseBigInt({ zodRef, schemas, openApiVersion, }) {
    return (0, ts_deepmerge_1.default)({
        type: typeFormat('integer', openApiVersion),
        format: 'int64'
    }, zodRef.description ? { description: zodRef.description } : {}, ...schemas);
}
function parseBoolean({ zodRef, schemas, openApiVersion, }) {
    return (0, ts_deepmerge_1.default)({ type: typeFormat('boolean', openApiVersion) }, zodRef.description ? { description: zodRef.description } : {}, ...schemas);
}
function parseDate({ zodRef, schemas, openApiVersion }) {
    return (0, ts_deepmerge_1.default)({
        type: typeFormat('string', openApiVersion),
        format: 'date-time'
    }, zodRef.description ? { description: zodRef.description } : {}, ...schemas);
}
function parseNull({ zodRef, schemas, openApiVersion }) {
    return (0, ts_deepmerge_1.default)(openApiVersion === '3.0' ? { type: 'null' } : {
        type: ['string', 'null'],
        enum: ['null'],
    }, zodRef.description ? { description: zodRef.description } : {}, ...schemas);
}
function parseOptional({ schemas, zodRef, useOutput, openApiVersion, }) {
    return (0, ts_deepmerge_1.default)(generateSchema(zodRef.unwrap(), useOutput, openApiVersion), zodRef.description ? { description: zodRef.description } : {}, ...schemas);
}
function parseNullable({ schemas, zodRef, useOutput, openApiVersion, }) {
    const schema = generateSchema(zodRef.unwrap(), useOutput, openApiVersion);
    return (0, ts_deepmerge_1.default)(schema, openApiVersion === '3.0'
        ? { nullable: true }
        : { type: typeFormat('null', openApiVersion) }, zodRef.description ? { description: zodRef.description } : {}, ...schemas);
}
function parseDefault({ schemas, zodRef, useOutput, openApiVersion, }) {
    return (0, ts_deepmerge_1.default)(Object.assign({ default: zodRef._def.defaultValue() }, generateSchema(zodRef._def.innerType, useOutput, openApiVersion)), zodRef.description ? { description: zodRef.description } : {}, ...schemas);
}
function parseArray({ schemas, zodRef, useOutput, openApiVersion, }) {
    const constraints = {};
    if (zodRef._def.exactLength != null) {
        constraints.minItems = zodRef._def.exactLength.value;
        constraints.maxItems = zodRef._def.exactLength.value;
    }
    if (zodRef._def.minLength != null)
        constraints.minItems = zodRef._def.minLength.value;
    if (zodRef._def.maxLength != null)
        constraints.maxItems = zodRef._def.maxLength.value;
    return (0, ts_deepmerge_1.default)(Object.assign({ type: typeFormat('array', openApiVersion), items: generateSchema(zodRef.element, useOutput, openApiVersion) }, constraints), zodRef.description ? { description: zodRef.description } : {}, ...schemas);
}
function parseLiteral({ schemas, zodRef, openApiVersion, }) {
    const type = typeof zodRef._def.value;
    return (0, ts_deepmerge_1.default)({
        type: typeFormat(type, openApiVersion),
        enum: [zodRef._def.value],
    }, zodRef.description ? { description: zodRef.description } : {}, ...schemas);
}
function parseEnum({ schemas, zodRef, openApiVersion, }) {
    const type = typeof Object.values(zodRef._def.values)[0];
    return (0, ts_deepmerge_1.default)({
        type: typeFormat(type, openApiVersion),
        enum: Object.values(zodRef._def.values),
    }, zodRef.description ? { description: zodRef.description } : {}, ...schemas);
}
function parseIntersection({ schemas, zodRef, useOutput, openApiVersion, }) {
    return (0, ts_deepmerge_1.default)({
        allOf: [
            generateSchema(zodRef._def.left, useOutput, openApiVersion),
            generateSchema(zodRef._def.right, useOutput, openApiVersion),
        ],
    }, zodRef.description ? { description: zodRef.description } : {}, ...schemas);
}
function parseUnion({ schemas, zodRef, useOutput, openApiVersion, }) {
    const contents = zodRef._def.options;
    if (contents.reduce((prev, content) => prev && content._def.typeName === 'ZodLiteral', true)) {
        // special case to transform unions of literals into enums
        const literals = contents;
        const type = literals.reduce((prev, content) => !prev || prev === typeof content._def.value
            ? typeof content._def.value
            : null, null);
        if (type) {
            return (0, ts_deepmerge_1.default)({
                type: typeFormat(type, openApiVersion),
                enum: literals.map((literal) => literal._def.value),
            }, zodRef.description ? { description: zodRef.description } : {}, ...schemas);
        }
    }
    const oneOfContents = openApiVersion === '3.0'
        ? contents.filter((content) => content._def.typeName !== 'ZodNull')
        : contents;
    const contentsHasNull = contents.length != oneOfContents.length;
    return (0, ts_deepmerge_1.default)({
        oneOf: oneOfContents.map((schema) => generateSchema(schema, useOutput, openApiVersion)),
    }, contentsHasNull ? { nullable: true } : {}, zodRef.description ? { description: zodRef.description } : {}, ...schemas);
}
function parseDiscriminatedUnion({ schemas, zodRef, useOutput, openApiVersion, }) {
    return (0, ts_deepmerge_1.default)({
        discriminator: {
            propertyName: zodRef._def.discriminator,
        },
        oneOf: Array.from(zodRef._def.options.values()).map((schema) => generateSchema(schema, useOutput, openApiVersion)),
    }, zodRef.description ? { description: zodRef.description } : {}, ...schemas);
}
function parseNever({ zodRef, schemas, }) {
    return (0, ts_deepmerge_1.default)({ readOnly: true }, zodRef.description ? { description: zodRef.description } : {}, ...schemas);
}
function parseBranded({ schemas, zodRef, useOutput, openApiVersion, }) {
    return (0, ts_deepmerge_1.default)(generateSchema(zodRef._def.type, useOutput, openApiVersion), ...schemas);
}
function catchAllParser({ zodRef, schemas, }) {
    return (0, ts_deepmerge_1.default)(zodRef.description ? { description: zodRef.description } : {}, ...schemas);
}
function parsePipeline({ schemas, zodRef, useOutput, openApiVersion, }) {
    return (0, ts_deepmerge_1.default)(generateSchema(useOutput ? zodRef._def.out : zodRef._def.in, useOutput, openApiVersion), ...schemas);
}
function parseReadonly({ zodRef, useOutput, schemas, openApiVersion, }) {
    return (0, ts_deepmerge_1.default)(generateSchema(zodRef._def.innerType, useOutput, openApiVersion), zodRef.description ? { description: zodRef.description } : {}, ...schemas);
}
const workerMap = {
    ZodObject: parseObject,
    ZodRecord: parseRecord,
    ZodString: parseString,
    ZodNumber: parseNumber,
    ZodBigInt: parseBigInt,
    ZodBoolean: parseBoolean,
    ZodDate: parseDate,
    ZodNull: parseNull,
    ZodOptional: parseOptional,
    ZodNullable: parseNullable,
    ZodDefault: parseDefault,
    ZodArray: parseArray,
    ZodLiteral: parseLiteral,
    ZodEnum: parseEnum,
    ZodNativeEnum: parseEnum,
    ZodTransformer: parseTransformation,
    ZodEffects: parseTransformation,
    ZodIntersection: parseIntersection,
    ZodUnion: parseUnion,
    ZodDiscriminatedUnion: parseDiscriminatedUnion,
    ZodNever: parseNever,
    ZodBranded: parseBranded,
    // TODO Transform the rest to schemas
    ZodUndefined: catchAllParser,
    // TODO: `prefixItems` is allowed in OpenAPI 3.1 which can be used to create tuples
    ZodTuple: catchAllParser,
    ZodMap: catchAllParser,
    ZodFunction: catchAllParser,
    ZodLazy: catchAllParser,
    ZodPromise: catchAllParser,
    ZodAny: catchAllParser,
    ZodUnknown: catchAllParser,
    ZodVoid: catchAllParser,
    ZodPipeline: parsePipeline,
    ZodReadonly: parseReadonly,
};
function generateSchema(zodRef, useOutput = false, openApiVersion = '3.1') {
    const { metaOpenApi = {} } = zodRef;
    const schemas = [
        ...(Array.isArray(metaOpenApi) ? metaOpenApi : [metaOpenApi]),
    ];
    try {
        const typeName = zodRef._def.typeName;
        if (typeName in workerMap) {
            return workerMap[typeName]({
                zodRef: zodRef,
                schemas,
                useOutput,
                openApiVersion,
            });
        }
        return catchAllParser({ zodRef, schemas, openApiVersion });
    }
    catch (err) {
        console.error(err);
        return catchAllParser({ zodRef, schemas, openApiVersion });
    }
}
exports.generateSchema = generateSchema;
//# sourceMappingURL=zod-openapi.js.map