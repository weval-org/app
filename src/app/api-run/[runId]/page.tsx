import ApiRunView from './ApiRunView';

export default function ApiRunPage({ params }: { params: { runId: string } }) {
    return <ApiRunView runId={params.runId} />;
}
