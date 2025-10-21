import { Metadata } from 'next';
import Client from './Client';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: 'Guess the Model — LLM Personality Analysis',
        description: 'Paste text and we\'ll guess which LLM model wrote it by analyzing writing patterns and embeddings.',
    };
}

export default function GuessPage() {
    return (
        <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
            <Client />
        </div>
    );
}
