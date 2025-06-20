import dynamic from 'next/dynamic';
import Link from 'next/link';

const AlertTriangle = dynamic(() => import('lucide-react').then(mod => mod.AlertTriangle));
const Info = dynamic(() => import('lucide-react').then(mod => mod.Info));

export interface PotentialDriftInfo {
  configId: string;
  configTitle: string;
  runLabel: string;
  modelId: string;
  minScore: number;
  maxScore: number;
  scoreRange: number;
  runsCount: number;
  oldestTimestamp: string;
  newestTimestamp: string;
}

interface ModelDriftIndicatorProps {
  driftInfo: PotentialDriftInfo | null;
}

const ModelDriftIndicator: React.FC<ModelDriftIndicatorProps> = ({ driftInfo }) => {
  if (!driftInfo || driftInfo.scoreRange === 0) {
    return (
      <div className="my-6 p-4 bg-card/70 dark:bg-slate-800/50 backdrop-blur-sm rounded-lg border border-border/60 dark:border-slate-700/40 flex items-start text-sm text-muted-foreground">
        {Info && <Info className="w-5 h-5 mr-3 text-sky-500 flex-shrink-0 mt-0.5" />}
        <div>
          <span>No significant performance variance detected for any model across identical test runs (same parameters, &gt;= 1 day apart). I.e. no model regressions detected.</span>
          <p className="text-xs text-muted-foreground/80 mt-1">This suggests model behavior, as measured by Hybrid Score, has remained consistent for repeated evaluations in your dataset. Note: it can be normal for model aliases to not point to the same underlying model, but it is fair to expect that the type of fundamental knowledge that Weval tests for should be consistent.</p>
        </div>
      </div>
    );
  }

  const displayDate = (timestamp: string) => {
    const dateObj = new Date(timestamp);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
    }
    return "N/A";
  }

  return (
    <div className="my-6 p-4 bg-amber-50/80 dark:bg-amber-900/30 backdrop-blur-sm rounded-lg border border-amber-400/70 dark:border-amber-600/50">
      <div className="flex items-start">
        {AlertTriangle && <AlertTriangle className="w-6 h-6 mr-3 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />}
        <div>
          <h3 className="text-md font-semibold text-amber-800 dark:text-amber-200 mb-1">Potential Model Performance Shift Detected</h3>
          <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
            The following model showed notable variance in Hybrid Scores across multiple executions of the exact same test parameters (identified by Run Label hash):
          </p>
          <div className="text-xs bg-card/50 dark:bg-slate-700/30 p-3 rounded-md space-y-1">
            <p><strong>Evaluation Config:</strong> <span className="font-medium">{driftInfo.configTitle} ({driftInfo.configId})</span></p>
            <p><strong>Test Parameters (Run Label):</strong> <span className="font-medium">{driftInfo.runLabel}</span></p>
            <p><strong>Model ID:</strong> <span className="font-medium text-red-600 dark:text-red-400">{driftInfo.modelId}</span></p>
            <p>
              <strong>Hybrid Score Range:</strong> 
              <span className="font-medium"> {(driftInfo.minScore * 100).toFixed(1)}%</span> to 
              <span className="font-medium"> {(driftInfo.maxScore * 100).toFixed(1)}%</span> 
              {' '}(Difference of <span className="font-bold">{(driftInfo.scoreRange * 100).toFixed(1)} pts</span>)
            </p>
            <p>
              Observed across <span className="font-medium">{driftInfo.runsCount}</span> runs between 
              <span className="font-medium"> {displayDate(driftInfo.oldestTimestamp)}</span> and 
              <span className="font-medium"> {displayDate(driftInfo.newestTimestamp)}</span>.
            </p>
          </div>
          <div className="mt-3 flex justify-start">
            <Link 
              href={`/analysis/${driftInfo.configId}/${encodeURIComponent(driftInfo.runLabel)}`}
              className="inline-flex items-center justify-center px-4 py-2 text-xs font-medium rounded-md text-amber-800 dark:text-amber-100 bg-amber-400/50 hover:bg-amber-400/80 dark:bg-amber-500/40 dark:hover:bg-amber-500/60 transition-colors border border-amber-500/50 dark:border-amber-500/70"
            >
              View Runs & Investigate
            </Link>
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 italic">
            This variance, observed between the oldest and newest runs in your dataset for these specific parameters, could indicate an unannounced change in the model's underlying behavior. While minor fluctuations can be normal, a larger shift warrants further investigation.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ModelDriftIndicator; 