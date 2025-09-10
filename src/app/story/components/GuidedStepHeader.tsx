import { cn } from '@/lib/utils';
import Icon, { type IconName } from '@/components/ui/icon';

interface GuidedStepProps {
  icon: IconName;
  title: string;
  description: string;
  isActive: boolean;
  isCompleted: boolean;
  stepNumber: number;
}

export function GuidedStepHeader({ icon, title, description, isActive, isCompleted, stepNumber }: GuidedStepProps) {
  return (
    <div className={cn(
      "flex items-center gap-4 p-4 rounded-lg border transition-all duration-300",
      isActive ? "bg-primary/10 border-primary/50 shadow-lg" : "bg-muted/50 border-transparent",
      isCompleted && !isActive && "bg-green-500/10 border-green-500/30"
    )}>
      <div className={cn(
        "flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300",
        isActive ? "bg-primary text-primary-foreground" : "bg-muted",
        isCompleted && !isActive && "bg-green-600 text-white"
      )}>
        <Icon name={icon} className="w-6 h-6" />
      </div>
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-primary">Step {stepNumber}</div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
