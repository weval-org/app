/**
 * Generates a canonical, URL-safe blueprint ID from a file path.
 * This is the single source of truth for blueprint ID generation.
 *
 * @param blueprintPath The file path of the blueprint, relative to the blueprints directory.
 * @returns The normalized blueprint ID.
 *
 * @example
 * // returns 'my-test'
 * generateBlueprintIdFromPath('my-test.yml')
 *
 * @example
 * // returns 'subdir__my-test'
 * generateBlueprintIdFromPath('subdir/my-test.weval.yaml')
 */
export function generateBlueprintIdFromPath(blueprintPath: string): string {
    return blueprintPath
        .replace(/\.civic\.ya?ml$/, '')
        .replace(/\.weval\.ya?ml$/, '')
        .replace(/\.ya?ml$/, '')
        .replace(/\.json$/, '')
        .replace(/\//g, '__'); // Replace slashes with a safe separator.
}

/**
 * Converts a canonical blueprint ID back into a relative file path.
 * This is the inverse of generateBlueprintIdFromPath, but does not restore the extension.
 * @param id The canonical blueprint ID.
 * @returns The relative file path structure.
 *
 * @example
 * // returns 'subdir/my-test'
 * getBlueprintPathFromId('subdir__my-test')
 */
export function getBlueprintPathFromId(id: string): string {
    return id.replace(/__/g, '/');
} 