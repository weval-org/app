import { ImageResponse } from 'next/og';
import { fromSafeTimestamp } from '@/lib/timestampUtils'; // Assuming this util is accessible

export const runtime = 'edge';

export const alt = 'Weval Analysis Result'; // Consider making this more dynamic if fetching titles
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Helper to format timestamp (simplified from your analysis page)
const formatDisplayTimestamp = (safeTimestamp: string): string => {
  try {
    const date = new Date(fromSafeTimestamp(safeTimestamp));
    return date.toLocaleDateString([], {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) {
    return safeTimestamp; // Fallback
  }
};

export default async function Image({ params }: { params: { configId: string, runLabel: string, timestamp: string } }) {
  const { configId, runLabel, timestamp } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:8888' : 'https://weval.org');

  // Fetch font data (ensure Geist TTF files are in public/fonts/)
  const geistRegularFontData = fetch(
    new URL('/fonts/Geist-Regular.ttf', appUrl) // Changed to .ttf
  ).then((res) => res.arrayBuffer());

  const geistBoldFontData = fetch(
    new URL('/fonts/Geist-Bold.ttf', appUrl) // Changed to .ttf
  ).then((res) => res.arrayBuffer());

  // In a real scenario, you might fetch the actual configTitle based on configId here
  // For this example, we'll just use the ID.
  // const runData = await getLightweightRunData(configId, runLabel, timestamp); // Example data fetching
  const displayConfigTitle = configId;
  const displayRunLabel = runLabel;
  const displayTimestamp = formatDisplayTimestamp(timestamp);

  const [geistRegular, geistBold] = await Promise.all([geistRegularFontData, geistBoldFontData]);

  return new ImageResponse(
    (
      <div // Outermost container
        style={{
          fontSize: 48,
          background: 'linear-gradient(to bottom right, #1A1A1A, #2C2C2C)',
          color: 'white',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between', // Changed to space-between
          fontFamily: 'GeistRegular',
          padding: '50px', // Padding for overall spacing
          textAlign: 'center',
        }}
      >
        {/* Main content block - first flex item */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: 32, color: '#A0A0A0', marginBottom: '20px', fontFamily: 'GeistRegular' }}>
            WEVAL ANALYSIS
          </div>
          <div style={{ fontSize: 60, fontWeight: 700, color: '#00A8FF', marginBottom: '25px', fontFamily: 'GeistBold', lineHeight: 1.2, maxWidth: '90%' }}>
            {displayConfigTitle}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', fontSize: 38, color: '#E0E0E0', marginBottom: '15px', fontFamily: 'GeistRegular' }}>
            Version: {displayRunLabel}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', fontSize: 32, color: '#B0B0B0', fontFamily: 'GeistRegular' }}>
            Executed: {displayTimestamp}
          </div>
        </div>

        {/* Footer block - second flex item, no absolute positioning */}
        <div style={{ fontSize: 24, color: '#A0A0A0', fontFamily: 'GeistRegular' }}>
          weval.org
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'GeistRegular',
          data: geistRegular,
          style: 'normal',
          weight: 400,
        },
        {
          name: 'GeistBold',
          data: geistBold,
          style: 'normal',
          weight: 700,
        },
      ],
    }
  );
} 