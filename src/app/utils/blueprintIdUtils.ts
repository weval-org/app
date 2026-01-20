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

/**
 * Validates that a blueprint ID doesn't use reserved patterns.
 * Currently checks that IDs don't end with '__' (reserved for directory listings).
 * @param id The blueprint ID to validate.
 * @throws Error if the ID uses a reserved pattern.
 */
export function validateBlueprintId(id: string): void {
    if (id.endsWith('__')) {
        throw new Error(
            `Blueprint ID '${id}' cannot end with '__' (reserved for directory listings). ` +
            `Rename your blueprint file to avoid a trailing underscore.`
        );
    }
}

/**
 * Breadcrumb item structure for config/directory breadcrumbs.
 */
export interface ConfigBreadcrumbItem {
    label: string;
    href: string;
}

/**
 * Builds breadcrumb items for a configId, expanding directory segments.
 * E.g., "disability__ableist-language-detection" becomes:
 *   - { label: "disability/", href: "/analysis/disability__" }
 *   - { label: "Ableist Language Detection", href: "/analysis/disability__ableist-language-detection" }
 *
 * @param configId The config ID (may contain __ for directory separators)
 * @param configTitle Optional display title for the final config item
 * @returns Array of breadcrumb items
 */
export function buildConfigBreadcrumbs(configId: string, configTitle?: string): ConfigBreadcrumbItem[] {
    const items: ConfigBreadcrumbItem[] = [];
    const parts = configId.split('__');

    if (parts.length === 1) {
        // No directory structure, just the config
        items.push({
            label: configTitle || configId,
            href: `/analysis/${configId}`,
        });
    } else {
        // Has directory structure
        let accumulated = '';
        for (let i = 0; i < parts.length - 1; i++) {
            accumulated += (i > 0 ? '__' : '') + parts[i];
            items.push({
                label: parts[i] + '/',
                href: `/analysis/${accumulated}__`,
            });
        }
        // Final part is the actual config name
        items.push({
            label: configTitle || parts[parts.length - 1],
            href: `/analysis/${configId}`,
        });
    }

    return items;
} 