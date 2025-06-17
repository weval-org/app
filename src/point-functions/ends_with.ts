import { PointFunction, PointFunctionContext, PointFunctionReturn } from './types';

export const ends_with: PointFunction = (
  llmResponseText: string,
  args: any,
  context: PointFunctionContext,
): PointFunctionReturn => {
  if (typeof args !== 'string') {
    return { error: "Invalid arguments for 'ends_with'. Expected a string suffix." };
  }
  if (typeof llmResponseText !== 'string') {
    return false;
  }
  return llmResponseText.endsWith(args);
}; 