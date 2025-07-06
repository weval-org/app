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
}); 