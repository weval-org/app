import { generateBlueprintIdFromPath, getBlueprintPathFromId } from '../blueprintIdUtils';

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