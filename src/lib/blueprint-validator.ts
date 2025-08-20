import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { BlueprintAuthoringSchema } from './blueprint-authoring.schema';
import { BlueprintCanonicalSchema } from './blueprint-canonical.schema';

export type SchemaKind = 'authoring' | 'canonical';

function getAjv(): Ajv2020 {
    const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
    try { addFormats(ajv as any); } catch {}
    return ajv;
}

export function validateBlueprintSchema(data: unknown, kind: SchemaKind = 'authoring') {
    const ajv = getAjv();
    const schema = kind === 'authoring' ? BlueprintAuthoringSchema : BlueprintCanonicalSchema;
    const validate = ajv.compile(schema as any);
    const valid = validate(data);
    return { valid: !!valid, errors: validate.errors ?? null };
}


