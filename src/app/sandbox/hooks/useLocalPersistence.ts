'use client';

import { useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from "@/components/ui/use-toast";
import { ActiveBlueprint, BlueprintFile } from './useWorkspace';

const LOCAL_STORAGE_BLUEPRINT_KEY = 'sandboxV2_blueprints';
const IMPORT_BLUEPRINT_KEY = 'weval_sandbox_import_v2';

export const DEFAULT_BLUEPRINT_CONTENT = `title: "My First Blueprint"
description: "A test to see how different models respond to my prompts."
---
- prompt: "Your first prompt here."
  should:
    - "An expectation for the response."`;

export function useLocalPersistence() {
  const { toast } = useToast();
  const [localFiles, setLocalFiles] = useState<BlueprintFile[]>([]);

  const loadFilesFromLocalStorage = useCallback(() => {
    try {
      const storedFiles = window.localStorage.getItem(LOCAL_STORAGE_BLUEPRINT_KEY);
      const files = storedFiles ? JSON.parse(storedFiles) : [];
      setLocalFiles(files);
      return files;
    } catch (e) {
      console.error("Failed to load files from local storage", e);
      setLocalFiles([]);
      return [];
    }
  }, []);

  const initializeDefaultBlueprint = useCallback(() => {
    const defaultFile: BlueprintFile = {
      path: `local/${uuidv4()}.yml`,
      name: 'local-draft.yml',
      sha: uuidv4(),
      isLocal: true,
      lastModified: new Date().toISOString(),
    };
    const defaultBlueprint: ActiveBlueprint = {
      ...defaultFile,
      content: DEFAULT_BLUEPRINT_CONTENT,
    };
    window.localStorage.setItem(LOCAL_STORAGE_BLUEPRINT_KEY, JSON.stringify([defaultFile]));
    window.localStorage.setItem(defaultFile.path, JSON.stringify(defaultBlueprint));
    setLocalFiles([defaultFile]);
    return { file: defaultFile, blueprint: defaultBlueprint };
  }, []);

  const saveToLocalStorage = useCallback((blueprint: ActiveBlueprint) => {
    try {
      const blueprintWithTimestamp = { ...blueprint, lastModified: new Date().toISOString() };
      window.localStorage.setItem(blueprint.path, JSON.stringify(blueprintWithTimestamp));
      
      setLocalFiles(currentFiles => {
        const otherFiles = currentFiles.filter(f => f.path !== blueprint.path);
        const newFileEntry: BlueprintFile = { 
          name: blueprint.name, 
          path: blueprint.path, 
          sha: blueprint.sha,
          isLocal: true,
          lastModified: blueprintWithTimestamp.lastModified
        };
        const updatedLocalFiles = [...otherFiles, newFileEntry];
        window.localStorage.setItem(LOCAL_STORAGE_BLUEPRINT_KEY, JSON.stringify(updatedLocalFiles));
        return updatedLocalFiles;
      });
      toast({ title: "Blueprint Saved", description: "Your changes have been saved locally." });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error saving to Local Storage', description: e.message });
    }
  }, [toast]);

  const deleteFromLocalStorage = useCallback((blueprint: BlueprintFile, currentLocalFiles: BlueprintFile[]) => {
      try {
          window.localStorage.removeItem(blueprint.path);
          const updatedFiles = currentLocalFiles.filter((f: BlueprintFile) => f.path !== blueprint.path);
          window.localStorage.setItem(LOCAL_STORAGE_BLUEPRINT_KEY, JSON.stringify(updatedFiles));
          setLocalFiles(updatedFiles);
          toast({ title: "Blueprint Deleted", description: `${blueprint.name} has been removed from your local drafts.` });
          return updatedFiles;
      } catch (e: any) {
          toast({ variant: 'destructive', title: 'Error deleting file', description: e.message });
          return currentLocalFiles;
      }
  }, [toast]);
  
  const importBlueprint = useCallback(() => {
      try {
          const importDataString = window.localStorage.getItem(IMPORT_BLUEPRINT_KEY);
          if (importDataString) {
              window.localStorage.removeItem(IMPORT_BLUEPRINT_KEY); // Clear immediately
              const importData = JSON.parse(importDataString);

              if (importData.name && importData.content) {
                  const newBlueprint: ActiveBlueprint = {
                      path: `local/${uuidv4()}-${importData.name}`,
                      name: importData.name,
                      sha: uuidv4(),
                      isLocal: true,
                      lastModified: new Date().toISOString(),
                      content: importData.content,
                  };
                  
                  toast({
                      title: 'Blueprint Imported!',
                      description: `Loaded "${importData.name}" into your local drafts.`
                  });

                  return newBlueprint;
              }
          }
      } catch (e) {
          console.error("Failed to import blueprint from local storage", e);
          toast({
              variant: 'destructive',
              title: 'Import Failed',
              description: 'Could not import the blueprint from the results page.',
          });
      }
      return null;
  }, [toast]);

  return {
    localFiles,
    loadFilesFromLocalStorage,
    initializeDefaultBlueprint,
    saveToLocalStorage,
    deleteFromLocalStorage,
    importBlueprint,
    setLocalFiles,
  };
} 