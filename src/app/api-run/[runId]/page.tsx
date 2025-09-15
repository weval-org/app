import ApiRunView from './ApiRunView';

export default async function ApiRunPage({ params }: { params: Promise<{ runId: string }> }) {
    const { runId } = await params;
    return <ApiRunView runId={runId} />;
}
