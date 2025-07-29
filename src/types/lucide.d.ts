declare module 'lucide-react/icons/*' {
  import type { FC, SVGAttributes } from 'react';

  // Re-creating the essence of LucideProps without a root import
  // to avoid breaking tree-shaking.
  
  interface LucideProps extends SVGAttributes<SVGSVGElement> {
    color?: string;
    size?: string | number;
    strokeWidth?: string | number;
    absoluteStrokeWidth?: boolean;
  }

  const Icon: FC<LucideProps>;

  export default Icon;
} 