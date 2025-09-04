import PainPointsClientPage from './ClientPage';

export const metadata = {
  title: 'Pain Points',
  description: 'A summary of the most significant model failures.',
};

export default function PainPointsPage() {
  return (
    <div className="container mx-auto p-4">
      <PainPointsClientPage />
    </div>
  );
}
