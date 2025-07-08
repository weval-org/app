import { renderHook, act } from '@testing-library/react';
import { useLocalPersistence, DEFAULT_BLUEPRINT_CONTENT } from './useLocalPersistence';

// Mocking useToast
const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

describe('useLocalPersistence', () => {
  let localStorageMock: { [key: string]: string } = {};

  beforeEach(() => {
    localStorageMock = {};
    mockToast.mockClear();

    // Mock localStorage
    jest.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(((key: string) => localStorageMock[key]) as any);
    jest.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(((key: string, value: string) => {
      localStorageMock[key] = value;
    }) as any);
    jest.spyOn(window.localStorage.__proto__, 'removeItem').mockImplementation(((key: string) => {
      delete localStorageMock[key];
    }) as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should initialize with no files and then load them', () => {
    const { result } = renderHook(() => useLocalPersistence());
    expect(result.current.localFiles).toEqual([]);

    act(() => {
      result.current.loadFilesFromLocalStorage();
    });

    expect(result.current.localFiles).toEqual([]);
  });

  test('initializeDefaultBlueprint should create and save a default blueprint', () => {
    const { result } = renderHook(() => useLocalPersistence());

    let newBlueprint: any;
    act(() => {
      const { blueprint } = result.current.initializeDefaultBlueprint();
      newBlueprint = blueprint;
    });

    expect(result.current.localFiles).toHaveLength(1);
    expect(result.current.localFiles[0].name).toBe('local-draft.yml');
    expect(newBlueprint.content).toBe(DEFAULT_BLUEPRINT_CONTENT);

    // Check if it was saved to localStorage
    const storedFiles = JSON.parse(localStorageMock['sandboxV2_blueprints']);
    expect(storedFiles).toHaveLength(1);
    expect(storedFiles[0].name).toBe('local-draft.yml');

    const storedBlueprint = JSON.parse(localStorageMock[result.current.localFiles[0].path]);
    expect(storedBlueprint.content).toBe(DEFAULT_BLUEPRINT_CONTENT);
  });

  test('saveToLocalStorage should save a new blueprint and update the file list', () => {
    const { result } = renderHook(() => useLocalPersistence());

    const newBlueprint = {
      path: 'local/new-test.yml',
      name: 'new-test.yml',
      sha: 'new-sha',
      isLocal: true,
      content: 'title: New Test',
      lastModified: '2023-01-01T00:00:00.000Z',
    };

    act(() => {
      result.current.saveToLocalStorage(newBlueprint);
    });

    expect(result.current.localFiles).toHaveLength(1);
    expect(result.current.localFiles[0].name).toBe('new-test.yml');

    const storedFiles = JSON.parse(localStorageMock['sandboxV2_blueprints']);
    expect(storedFiles[0].name).toBe('new-test.yml');

    const storedBlueprint = JSON.parse(localStorageMock['local/new-test.yml']);
    expect(storedBlueprint.content).toBe('title: New Test');
    expect(storedBlueprint.lastModified).toBeDefined();
    expect(mockToast).toHaveBeenCalledWith({
      title: "Blueprint Saved",
      description: "Your changes have been saved locally.",
    });
  });

  test('deleteFromLocalStorage should remove a blueprint', () => {
    const { result } = renderHook(() => useLocalPersistence());

    // First, add a blueprint to delete
    let initialFiles: { file: any; blueprint: any; } | undefined;
    act(() => {
      initialFiles = result.current.initializeDefaultBlueprint();
    });

    // Assert that the blueprint was added
    expect(result.current.localFiles).toHaveLength(1);
    if (!initialFiles) {
        throw new Error("Test setup failed: initialFiles was not initialized.");
    }
    
    // Now, delete the blueprint
    act(() => {
      result.current.deleteFromLocalStorage(initialFiles!.file, result.current.localFiles);
    });

    // Assert that the blueprint was removed
    expect(result.current.localFiles).toHaveLength(0);
    expect(localStorageMock['sandboxV2_blueprints']).toBe('[]');
    expect(localStorageMock[initialFiles!.file.path]).toBeUndefined();
    expect(mockToast).toHaveBeenCalledWith({
        title: "Blueprint Deleted",
        description: `${initialFiles!.file.name} has been removed from your local drafts.`,
    });
  });

  test('renameInLocalStorage should successfully rename a blueprint', () => {
    const { result } = renderHook(() => useLocalPersistence());

    // First, create a blueprint to rename
    let initialFiles: { file: any; blueprint: any; } | undefined;
    act(() => {
      initialFiles = result.current.initializeDefaultBlueprint();
    });

    expect(result.current.localFiles).toHaveLength(1);
    if (!initialFiles) {
        throw new Error("Test setup failed: initialFiles was not initialized.");
    }

    const originalFile = initialFiles.file;
    const originalPath = originalFile.path;

    // Rename the blueprint
    let renamedFile: any;
    act(() => {
      renamedFile = result.current.renameInLocalStorage(originalFile, 'renamed-blueprint.yml');
    });

    // Assert that the rename was successful
    expect(renamedFile).not.toBeNull();
    expect(renamedFile.name).toBe('renamed-blueprint.yml');
    expect(renamedFile.path).not.toBe(originalPath); // Should have a new path
    expect(renamedFile.path).toMatch(/^local\/[a-f0-9-]+\.yml$/); // Should be a new UUID path

    // Check that the local files state was updated
    expect(result.current.localFiles).toHaveLength(1);
    expect(result.current.localFiles[0].name).toBe('renamed-blueprint.yml');
    expect(result.current.localFiles[0].path).toBe(renamedFile.path);

    // Check that localStorage was updated correctly
    const storedFiles = JSON.parse(localStorageMock['sandboxV2_blueprints']);
    expect(storedFiles).toHaveLength(1);
    expect(storedFiles[0].name).toBe('renamed-blueprint.yml');
    expect(storedFiles[0].path).toBe(renamedFile.path);

    // Check that the new file content exists in localStorage
    const newFileContent = JSON.parse(localStorageMock[renamedFile.path]);
    expect(newFileContent.name).toBe('renamed-blueprint.yml');
    expect(newFileContent.content).toBe(DEFAULT_BLUEPRINT_CONTENT);

    // Check that the old file was removed from localStorage
    expect(localStorageMock[originalPath]).toBeUndefined();

    // Check that success toast was shown
    expect(mockToast).toHaveBeenCalledWith({
      title: "Blueprint Renamed",
      description: "Renamed to renamed-blueprint.yml.",
    });
  });

  test('renameInLocalStorage should handle missing file content gracefully', () => {
    const { result } = renderHook(() => useLocalPersistence());

    const nonExistentFile = {
      path: 'local/non-existent.yml',
      name: 'non-existent.yml',
      sha: 'fake-sha',
      isLocal: true,
      lastModified: '2023-01-01T00:00:00.000Z',
    };

    // Try to rename a file that doesn't exist in localStorage
    let renamedFile: any;
    act(() => {
      renamedFile = result.current.renameInLocalStorage(nonExistentFile, 'new-name.yml');
    });

    // Should return null and show error toast
    expect(renamedFile).toBeNull();
    expect(mockToast).toHaveBeenCalledWith({
      variant: 'destructive',
      title: 'Error renaming file',
      description: 'Original file content not found in local storage.',
    });
  });

  test('renameInLocalStorage should preserve file content and metadata', () => {
    const { result } = renderHook(() => useLocalPersistence());

    // Create a blueprint with custom content
    const customBlueprint = {
      path: 'local/custom-test.yml',
      name: 'custom-test.yml',
      sha: 'custom-sha',
      isLocal: true,
      content: 'title: "Custom Blueprint"\ndescription: "Test content"',
      lastModified: '2023-01-01T00:00:00.000Z',
    };

    // Manually set up the file in localStorage
    localStorageMock['sandboxV2_blueprints'] = JSON.stringify([customBlueprint]);
    localStorageMock[customBlueprint.path] = JSON.stringify(customBlueprint);

    act(() => {
      result.current.loadFilesFromLocalStorage();
    });

    expect(result.current.localFiles).toHaveLength(1);

    // Rename the blueprint
    let renamedFile: any;
    act(() => {
      renamedFile = result.current.renameInLocalStorage(customBlueprint, 'renamed-custom.yml');
    });

    expect(renamedFile).not.toBeNull();
    expect(renamedFile.name).toBe('renamed-custom.yml');
    expect(renamedFile.sha).toBe('custom-sha'); // Should preserve SHA
    expect(renamedFile.isLocal).toBe(true);

    // Check that content was preserved
    const newFileContent = JSON.parse(localStorageMock[renamedFile.path]);
    expect(newFileContent.content).toBe('title: "Custom Blueprint"\ndescription: "Test content"');
    expect(newFileContent.sha).toBe('custom-sha');
    expect(newFileContent.lastModified).toBeDefined();
    expect(new Date(newFileContent.lastModified).getTime()).toBeGreaterThan(new Date('2023-01-01T00:00:00.000Z').getTime());
  });
}); 