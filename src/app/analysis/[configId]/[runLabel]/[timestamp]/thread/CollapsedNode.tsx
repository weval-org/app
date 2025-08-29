'use client';
import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Button } from '@/components/ui/button';

const CollapsedNode: React.FC<NodeProps> = ({ data }) => {
    const { count, onClick } = data;

    return (
        <>
            <Handle type="target" position={Position.Left} className="!w-2 !h-2" />
            <Button 
                variant="outline" 
                className="bg-card hover:bg-muted text-xs h-8 px-3 shadow-sm"
                onClick={onClick}
            >
                {count} message{count === 1 ? '' : 's'} collapsed...
            </Button>
            <Handle type="source" position={Position.Right} className="!w-2 !h-2" />
        </>
    );
};

export default CollapsedNode;
