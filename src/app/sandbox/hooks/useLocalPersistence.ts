'use client';

import { useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from "@/components/ui/use-toast";
import { ActiveBlueprint, BlueprintFile } from './useWorkspace';

const LOCAL_STORAGE_BLUEPRINT_KEY = 'sandboxV2_blueprints';
const IMPORT_BLUEPRINT_KEY = 'weval_sandbox_import_v2';

export const DEFAULT_BLUEPRINT_CONTENT = `title: "Welcome to the Sandbox!"
description: "This is a blueprint for testing AI models. Edit this file or create your own to get started. Use the 'Run Evaluation' button to see how different models respond."
---
prompt: |
  Explain the concept of a 'large language model' to a 5-year-old.
  Include a simple analogy.
should:
  - "The explanation should be easy for a child to understand."
  - "It must use an analogy to illustrate the concept."
  - "The tone should be friendly and encouraging."`;

export function useLocalPersistence() {
  const { toast } = useToast();

  const loadFilesFromLocalStorage = useCallback(() => {
    try {
      const storedFiles = window.localStorage.getItem(LOCAL_STORAGE_BLUEPRINT_KEY);
      return storedFiles ? JSON.parse(storedFiles) : [];
    } catch (e) {
      console.error("Failed to load files from local storage", e);
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
    return { file: defaultFile, blueprint: defaultBlueprint };
  }, []);

  const saveToLocalStorage = useCallback((blueprint: ActiveBlueprint, currentFiles: BlueprintFile[]) => {
    try {
      const blueprintWithTimestamp = { ...blueprint, lastModified: new Date().toISOString() };
      window.localStorage.setItem(blueprint.path, JSON.stringify(blueprintWithTimestamp));
      
      const otherFiles = currentFiles.filter(f => f.path !== blueprint.path);
      const newFileEntry: BlueprintFile = { 
        name: blueprint.name, 
        path: blueprint.path, 
        sha: blueprint.sha,
        isLocal: true,
        lastModified: blueprintWithTimestamp.lastModified
      };
      const updatedLocalFiles = [newFileEntry, ...otherFiles.filter(f => f.isLocal)];
      
      const remoteFiles = currentFiles.filter(f => !f.isLocal);
      const allFiles = [...updatedLocalFiles, ...remoteFiles];

      window.localStorage.setItem(LOCAL_STORAGE_BLUEPRINT_KEY, JSON.stringify(allFiles));
      
      toast({ title: "Blueprint Saved", description: "Your changes have been saved locally." });
      return allFiles;
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error saving to Local Storage', description: e.message });
      return currentFiles; // Return original files on error
    }
  }, [toast]);

  const deleteFromLocalStorage = useCallback((blueprint: BlueprintFile, currentLocalFiles: BlueprintFile[]) => {
      try {
          window.localStorage.removeItem(blueprint.path);
          const updatedFiles = currentLocalFiles.filter((f: BlueprintFile) => f.path !== blueprint.path);
          window.localStorage.setItem(LOCAL_STORAGE_BLUEPRINT_KEY, JSON.stringify(updatedFiles));
          toast({ title: "Blueprint Deleted", description: `${blueprint.name} has been removed from your local drafts.` });
          return updatedFiles;
      } catch (e: any) {
          toast({ variant: 'destructive', title: 'Error deleting file', description: e.message });
          return currentLocalFiles;
      }
  }, [toast]);
  
  const renameInLocalStorage = useCallback((oldBlueprint: BlueprintFile, newName: string) => {
    try {
        const oldFileContentString = window.localStorage.getItem(oldBlueprint.path);
        if (!oldFileContentString) {
            throw new Error("Original file content not found in local storage.");
        }

        const blueprintContent = JSON.parse(oldFileContentString);
        
        // Create a new file with a new path
        const newPath = `local/${uuidv4()}.yml`;
        const newFile: BlueprintFile = {
            ...oldBlueprint,
            name: newName,
            path: newPath,
            lastModified: new Date().toISOString(),
        };

        const newActiveBlueprint: ActiveBlueprint = {
            ...blueprintContent,
            ...newFile,
        };

        // Save the new file
        window.localStorage.setItem(newPath, JSON.stringify(newActiveBlueprint));

        // Update the index
        const storedFiles = window.localStorage.getItem(LOCAL_STORAGE_BLUEPRINT_KEY);
        const files = storedFiles ? JSON.parse(storedFiles) : [];
        const updatedFiles = files.map((f: BlueprintFile) => f.path === oldBlueprint.path ? newFile : f);
        window.localStorage.setItem(LOCAL_STORAGE_BLUEPRINT_KEY, JSON.stringify(updatedFiles));

        // Delete the old file
        window.localStorage.removeItem(oldBlueprint.path);

        toast({ title: "Blueprint Renamed", description: `Renamed to ${newName}.` });
        return newFile;
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error renaming file', description: e.message });
        return null;
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
    loadFilesFromLocalStorage,
    initializeDefaultBlueprint,
    saveToLocalStorage,
    deleteFromLocalStorage,
    renameInLocalStorage,
    importBlueprint,
  };
} 