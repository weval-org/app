import { renderHook, act } from '@testing-library/react';
import { useLocalPersistence, DEFAULT_BLUEPRINT_CONTENT } from './useLocalPersistence';
import { ActiveBlueprint, BlueprintFile } from './useWorkspace';

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

  test('loadFilesFromLocalStorage should return files from storage', () => {
    const { result } = renderHook(() => useLocalPersistence());
    
    // Should be empty initially
    let files = result.current.loadFilesFromLocalStorage();
    expect(files).toEqual([]);

    // Should return stored files
    const mockFiles = [{ name: 'test.yml', path: 'local/test.yml' }];
    localStorageMock['sandboxV2_blueprints'] = JSON.stringify(mockFiles);
    
    files = result.current.loadFilesFromLocalStorage();
    expect(files).toEqual(mockFiles);
  });

  test('initializeDefaultBlueprint should create and save a default blueprint', () => {
    const { result } = renderHook(() => useLocalPersistence());

    let newBlueprint: any;
    act(() => {
      const { blueprint } = result.current.initializeDefaultBlueprint();
      newBlueprint = blueprint;
    });

    expect(newBlueprint.name).toBe('local-draft.yml');
    expect(newBlueprint.content).toBe(DEFAULT_BLUEPRINT_CONTENT);

    // Check if it was saved to localStorage
    const storedIndex = JSON.parse(localStorageMock['sandboxV2_blueprints']);
    expect(storedIndex).toHaveLength(1);
    expect(storedIndex[0].name).toBe('local-draft.yml');

    const storedBlueprint = JSON.parse(localStorageMock[storedIndex[0].path]);
    expect(storedBlueprint.content).toBe(DEFAULT_BLUEPRINT_CONTENT);
  });

  test('saveToLocalStorage should save a blueprint and return the updated file list', () => {
    const { result } = renderHook(() => useLocalPersistence());

    const initialFile: BlueprintFile = { path: 'local/initial.yml', name: 'initial.yml', sha: '1', isLocal: true, lastModified: '2023-01-01T00:00:00.000Z' };
    
    const newBlueprint: ActiveBlueprint = {
      path: 'local/new-test.yml',
      name: 'new-test.yml',
      sha: 'new-sha',
      isLocal: true,
      content: 'title: New Test',
      lastModified: '2023-01-01T00:00:00.000Z',
    };

    let updatedFiles: BlueprintFile[] = [];
    act(() => {
      updatedFiles = result.current.saveToLocalStorage(newBlueprint, [initialFile]);
    });

    // Should return the updated list of files
    expect(updatedFiles).toHaveLength(2);
    expect(updatedFiles.find(f => f.name === 'new-test.yml')).toBeDefined();
    expect(updatedFiles.find(f => f.name === 'initial.yml')).toBeDefined();

    // Check localStorage
    const storedIndex = JSON.parse(localStorageMock['sandboxV2_blueprints']);
    expect(storedIndex).toHaveLength(2);

    const storedBlueprint = JSON.parse(localStorageMock['local/new-test.yml']);
    expect(storedBlueprint.content).toBe('title: New Test');
    expect(storedBlueprint.lastModified).toBeDefined();
    expect(mockToast).toHaveBeenCalledWith({
      title: "Blueprint Saved",
      description: "Your changes have been saved locally.",
    });
  });

  test('deleteFromLocalStorage should remove a blueprint and return the updated list', () => {
    const { result } = renderHook(() => useLocalPersistence());

    const file1: BlueprintFile = { name: 'file1.yml', path: 'local/file1.yml', sha: '1', isLocal: true, lastModified: '2023-01-01T00:00:00.000Z' };
    const file2: BlueprintFile = { name: 'file2.yml', path: 'local/file2.yml', sha: '2', isLocal: true, lastModified: '2023-01-01T00:00:00.000Z' };
    const initialFiles = [file1, file2];
    localStorageMock[file1.path] = JSON.stringify(file1);
    localStorageMock[file2.path] = JSON.stringify(file2);
    localStorageMock['sandboxV2_blueprints'] = JSON.stringify(initialFiles);
    
    let updatedFiles: BlueprintFile[] = [];
    act(() => {
      updatedFiles = result.current.deleteFromLocalStorage(file1, initialFiles);
    });

    // Assert that the blueprint was removed from the returned list
    expect(updatedFiles).toHaveLength(1);
    expect(updatedFiles[0].name).toBe('file2.yml');
    
    // Assert that localStorage was updated
    expect(localStorageMock['sandboxV2_blueprints']).toBe(JSON.stringify([file2]));
    expect(localStorageMock[file1.path]).toBeUndefined();
    expect(mockToast).toHaveBeenCalledWith({
        title: "Blueprint Deleted",
        description: `file1.yml has been removed from your local drafts.`,
    });
  });

  test('renameInLocalStorage should successfully rename a blueprint', () => {
    const { result } = renderHook(() => useLocalPersistence());

    let initialFile: BlueprintFile;
    act(() => {
      // Use initializeDefaultBlueprint to set up the initial state in localStorageMock
      const { file } = result.current.initializeDefaultBlueprint();
      initialFile = file;
    });

    const originalPath = initialFile!.path;

    let renamedFile: any;
    act(() => {
      renamedFile = result.current.renameInLocalStorage(initialFile, 'renamed-blueprint.yml');
    });

    expect(renamedFile).not.toBeNull();
    expect(renamedFile.name).toBe('renamed-blueprint.yml');
    expect(renamedFile.path).not.toBe(originalPath);
    expect(renamedFile.path).toMatch(/^local\/[a-f0-9-]+\.yml$/);

    const storedIndex = JSON.parse(localStorageMock['sandboxV2_blueprints']);
    expect(storedIndex).toHaveLength(1);
    expect(storedIndex[0].name).toBe('renamed-blueprint.yml');
    
    const newFileContent = JSON.parse(localStorageMock[renamedFile.path]);
    expect(newFileContent.name).toBe('renamed-blueprint.yml');

    expect(localStorageMock[originalPath]).toBeUndefined();
    
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

    let renamedFile: any;
    act(() => {
      renamedFile = result.current.renameInLocalStorage(nonExistentFile, 'new-name.yml');
    });

    expect(renamedFile).toBeNull();
    expect(mockToast).toHaveBeenCalledWith({
      variant: 'destructive',
      title: 'Error renaming file',
      description: 'Original file content not found in local storage.',
    });
  });

  test('renameInLocalStorage should preserve file content and metadata', () => {
    const { result } = renderHook(() => useLocalPersistence());

    const customBlueprint: ActiveBlueprint = {
      path: 'local/custom-test.yml',
      name: 'custom-test.yml',
      sha: 'custom-sha',
      isLocal: true,
      content: 'title: "Custom Blueprint"\ndescription: "Test content"',
      lastModified: '2023-01-01T00:00:00.000Z',
    };

    localStorageMock['sandboxV2_blueprints'] = JSON.stringify([customBlueprint]);
    localStorageMock[customBlueprint.path] = JSON.stringify(customBlueprint);

    let renamedFile: any;
    act(() => {
      renamedFile = result.current.renameInLocalStorage(customBlueprint, 'renamed-custom.yml');
    });

    expect(renamedFile).not.toBeNull();
    expect(renamedFile.name).toBe('renamed-custom.yml');
    expect(renamedFile.sha).toBe('custom-sha');
    expect(renamedFile.isLocal).toBe(true);

    const newFileContent = JSON.parse(localStorageMock[renamedFile.path]);
    expect(newFileContent.content).toBe('title: "Custom Blueprint"\ndescription: "Test content"');
    expect(newFileContent.sha).toBe('custom-sha');
    expect(new Date(newFileContent.lastModified).getTime()).toBeGreaterThan(new Date('2023-01-01T00:00:00.000Z').getTime());
  });
}); 