import { PointFunction } from './types';
import { contains } from './contains';
import { matches } from './matches';

export const pointFunctions: Record<string, PointFunction> = {
    contains,
    matches,
}; 