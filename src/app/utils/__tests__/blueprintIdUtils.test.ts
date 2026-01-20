import { generateBlueprintIdFromPath, getBlueprintPathFromId, validateBlueprintId, buildConfigBreadcrumbs } from '../blueprintIdUtils';

describe('generateBlueprintIdFromPath', () => {
    it('should handle a simple yml file', () => {
        expect(generateBlueprintIdFromPath('my-test.yml')).toBe('my-test');
    });

    it('should handle a simple yaml file', () => {
        expect(generateBlueprintIdFromPath('another-test.yaml')).toBe('another-test');
    });

    it('should handle a simple json file', () => {
        expect(generateBlueprintIdFromPath('json-test.json')).toBe('json-test');
    });

    it('should handle a path with a single subdirectory', () => {
        expect(generateBlueprintIdFromPath('subdir/my-test.yml')).toBe('subdir__my-test');
    });

    it('should handle a path with multiple subdirectories', () => {
        expect(generateBlueprintIdFromPath('a/b/c/my-test.yml')).toBe('a__b__c__my-test');
    });

    it('should handle special .weval.yml extension', () => {
        expect(generateBlueprintIdFromPath('special.weval.yml')).toBe('special');
    });

    it('should handle special .civic.yaml extension', () => {
        expect(generateBlueprintIdFromPath('subdir/special.civic.yaml')).toBe('subdir__special');
    });

    it('should handle filenames with dots in them', () => {
        expect(generateBlueprintIdFromPath('v1.2.3/my.special-test.yml')).toBe('v1.2.3__my.special-test');
    });

    it('should handle an empty string input', () => {
        expect(generateBlueprintIdFromPath('')).toBe('');
    });

    it('should handle a path that is just a filename with no extension', () => {
        // This could happen if the input is already partially processed
        expect(generateBlueprintIdFromPath('no-extension')).toBe('no-extension');
    });
});

describe('getBlueprintPathFromId', () => {
    it('should convert a simple ID back to a path', () => {
        expect(getBlueprintPathFromId('my-test')).toBe('my-test');
    });

    it('should convert an ID with a single separator back to a path', () => {
        expect(getBlueprintPathFromId('subdir__my-test')).toBe('subdir/my-test');
    });

    it('should convert an ID with multiple separators back to a path', () => {
        expect(getBlueprintPathFromId('a__b__c__my-test')).toBe('a/b/c/my-test');
    });

    it('should handle IDs with dots in them', () => {
        expect(getBlueprintPathFromId('v1.2.3__my.special-test')).toBe('v1.2.3/my.special-test');
    });

    it('should handle an empty string', () => {
        expect(getBlueprintPathFromId('')).toBe('');
    });
});

describe('validateBlueprintId', () => {
    it('should not throw for a valid simple ID', () => {
        expect(() => validateBlueprintId('my-test')).not.toThrow();
    });

    it('should not throw for a valid ID with directories', () => {
        expect(() => validateBlueprintId('subdir__my-test')).not.toThrow();
    });

    it('should throw for an ID ending with __', () => {
        expect(() => validateBlueprintId('subdir__')).toThrow(/cannot end with '__'/);
    });

    it('should throw for a deeply nested ID ending with __', () => {
        expect(() => validateBlueprintId('a__b__c__')).toThrow(/cannot end with '__'/);
    });

    it('should not throw for an ID containing __ in the middle', () => {
        expect(() => validateBlueprintId('a__b__c')).not.toThrow();
    });
});

describe('buildConfigBreadcrumbs', () => {
    it('should handle a simple ID with no directories', () => {
        const result = buildConfigBreadcrumbs('my-test');
        expect(result).toEqual([
            { label: 'my-test', href: '/analysis/my-test' }
        ]);
    });

    it('should handle a simple ID with a custom title', () => {
        const result = buildConfigBreadcrumbs('my-test', 'My Test Blueprint');
        expect(result).toEqual([
            { label: 'My Test Blueprint', href: '/analysis/my-test' }
        ]);
    });

    it('should handle a single directory level', () => {
        const result = buildConfigBreadcrumbs('disability__ableist-language');
        expect(result).toEqual([
            { label: 'disability/', href: '/analysis/disability__' },
            { label: 'ableist-language', href: '/analysis/disability__ableist-language' }
        ]);
    });

    it('should handle a single directory level with custom title', () => {
        const result = buildConfigBreadcrumbs('disability__ableist-language', 'Ableist Language Detection');
        expect(result).toEqual([
            { label: 'disability/', href: '/analysis/disability__' },
            { label: 'Ableist Language Detection', href: '/analysis/disability__ableist-language' }
        ]);
    });

    it('should handle multiple directory levels', () => {
        const result = buildConfigBreadcrumbs('compass__personality__openness');
        expect(result).toEqual([
            { label: 'compass/', href: '/analysis/compass__' },
            { label: 'personality/', href: '/analysis/compass__personality__' },
            { label: 'openness', href: '/analysis/compass__personality__openness' }
        ]);
    });

    it('should handle multiple directory levels with custom title', () => {
        const result = buildConfigBreadcrumbs('compass__personality__openness', 'Openness to Experience');
        expect(result).toEqual([
            { label: 'compass/', href: '/analysis/compass__' },
            { label: 'personality/', href: '/analysis/compass__personality__' },
            { label: 'Openness to Experience', href: '/analysis/compass__personality__openness' }
        ]);
    });
}); 