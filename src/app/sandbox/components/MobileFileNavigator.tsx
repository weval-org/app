'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BlueprintFile } from '../hooks/useWorkspace';
import { User } from '../hooks/useAuth';
import { MobileActionSheet } from './MobileBottomSheet';
import { useState } from 'react';
import Icon from '@/components/ui/icon';


interface MobileFileNavigatorProps {
  files: BlueprintFile[];
  activeFilePath: string | null;
  onSelectFile: (file: BlueprintFile) => void;
  onCreateNew: () => void;
  onAutoCreate: () => void;
  onRenameFile?: (file: BlueprintFile) => void;
  onDuplicateFile?: (file: BlueprintFile) => void;
  onDeleteFile?: (file: BlueprintFile) => void;
  isLoading: boolean;
  isSyncingWithGitHub: boolean;
  isCreating: boolean;
  user: User | null;
  forkName: string | null;
  onLogin: () => void;
  isLoggingInWithGitHub: boolean;
  onLogout: () => void;
  onRefresh: () => void;
}

export function MobileFileNavigator({
  files,
  activeFilePath,
  onSelectFile,
  onCreateNew,
  onAutoCreate,
  onRenameFile,
  onDuplicateFile,
  onDeleteFile,
  isLoading,
  isSyncingWithGitHub,
  isCreating,
  user,
  forkName,
  onLogin,
  isLoggingInWithGitHub,
  onLogout,
  onRefresh,
}: MobileFileNavigatorProps) {
  const isLoggedIn = user?.isLoggedIn ?? false;
  const [selectedFile, setSelectedFile] = useState<BlueprintFile | null>(null);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* User Status Card */}
      <Card className="p-4">
        {isLoggedIn ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Icon name="github" className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{user?.username}</p>
                {forkName && (
                  <p className="text-sm text-muted-foreground truncate">{forkName}</p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={onLogout}>
                <Icon name="log-out" className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
            {isSyncingWithGitHub && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon name="loader-2" className="w-4 h-4 animate-spin" />
                Syncing with GitHub...
              </div>
            )}
          </div>
        ) : (
          <div className="text-center space-y-3">
            <div className="space-y-2">
              <h3 className="font-medium">Connect to GitHub</h3>
              <p className="text-sm text-muted-foreground">
                Save your blueprints and collaborate with the community
              </p>
            </div>
            <Button 
              onClick={onLogin} 
              disabled={isLoggingInWithGitHub}
              className="w-full"
            >
              {isLoggingInWithGitHub ? (
                <><Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" /> Connecting...</>
              ) : (
                <><Icon name="log-in" className="w-4 h-4 mr-2" /> Connect GitHub</>
              )}
            </Button>
          </div>
        )}
      </Card>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 gap-3">
        <Button 
          onClick={onCreateNew} 
          disabled={isCreating}
          size="lg"
          className="h-14 text-left justify-start"
        >
          <Icon name="plus" className="w-5 h-5 mr-3 flex-shrink-0" />
          <div>
            <div className="font-medium">Create New Blueprint</div>
            <div className="text-xs opacity-80">Start from scratch</div>
          </div>
        </Button>
        
        <Button 
          onClick={onAutoCreate}
          variant="outline" 
          size="lg"
          className="h-14 text-left justify-start bg-exciting/5 border-exciting/20 hover:bg-exciting/10"
        >
          <Icon name="sparkles" className="w-5 h-5 mr-3 flex-shrink-0 text-exciting" />
          <div>
            <div className="font-medium">AI Generate Blueprint</div>
            <div className="text-xs opacity-80">Describe what you want to test</div>
          </div>
        </Button>

        <Button 
          onClick={onRefresh}
          variant="ghost" 
          size="sm"
          className="self-start"
        >
          <Icon name="refresh-cw" className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Files List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Your Blueprints</h3>
          <Badge variant="outline">{files.length}</Badge>
        </div>
        
        {files.length === 0 ? (
          <Card className="p-8 text-center">
            <Icon name="file-text" className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground mb-2">No blueprints yet</p>
            <p className="text-sm text-muted-foreground">Create your first blueprint to get started</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {files.map((file) => (
              <Card 
                key={file.path}
                className={`p-4 cursor-pointer transition-all active:scale-[0.98] ${
                  file.path === activeFilePath
                    ? 'ring-2 ring-primary bg-primary/5 border-primary/50'
                    : 'hover:bg-muted/50 active:bg-muted'
                }`}
                onClick={() => onSelectFile(file)}
              >
                <div className="flex items-center gap-3">
                  <Icon name="file-text" className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{file.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {!file.isLocal && (
                        <Badge variant="outline" className="text-xs">GitHub</Badge>
                      )}
                      {file.isLocal && (
                        <Badge variant="secondary" className="text-xs">Local</Badge>
                      )}
                      {file.prStatus?.state === 'open' && (
                        <Badge variant="default" className="text-xs">PR Open</Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(file);
                      setIsActionSheetOpen(true);
                    }}
                  >
                    <Icon name="more-horizontal" className="w-5 h-5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* File Actions Sheet */}
      <MobileActionSheet
        isOpen={isActionSheetOpen}
        onClose={() => setIsActionSheetOpen(false)}
        title={selectedFile?.name || "File Actions"}
        actions={[
          ...(onRenameFile && selectedFile ? [{
            label: "Rename",
            icon: <Icon name="pencil" className="w-5 h-5" />,
            onClick: () => onRenameFile(selectedFile),
            disabled: selectedFile.prStatus?.state === 'open'
          }] : []),
          ...(onDuplicateFile && selectedFile ? [{
            label: "Duplicate",
            icon: <Icon name="copy" className="w-5 h-5" />,
            onClick: () => onDuplicateFile(selectedFile)
          }] : []),
          ...(onDeleteFile && selectedFile ? [{
            label: "Delete",
            icon: <Icon name="trash" className="w-5 h-5" />,
            onClick: () => onDeleteFile(selectedFile),
            variant: 'destructive' as const,
            disabled: selectedFile.prStatus?.state === 'open'
          }] : [])
        ]}
      />
    </div>
  );
} 