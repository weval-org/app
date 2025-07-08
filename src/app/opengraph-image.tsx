import { ImageResponse } from 'next/og';

// Route segment config
export const runtime = 'edge';

// Image metadata
export const alt = 'Weval - Measuring AI\'s fitness';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

// Image generation
export default async function Image() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:8888' : 'https://weval.org');

  const geistRegularFontData = fetch(
    new URL('/fonts/Geist-Regular.ttf', appUrl)
  ).then((res) => res.arrayBuffer());

  const geistBoldFontData = fetch(
    new URL('/fonts/Geist-Bold.ttf', appUrl)
  ).then((res) => res.arrayBuffer());

  const [geistRegular, geistBold] = await Promise.all([geistRegularFontData, geistBoldFontData]);

  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 64,
          background: 'linear-gradient(to bottom right, #0A0A0A, #1C1C1C)', // Dark gradient background
          color: 'white',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column', // Align items vertically
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '"GeistRegular"', // Use the specific name defined in fonts array
          padding: '40px',
          textAlign: 'center',
        }}
      >
        {/* You could add your logo here if you have it as an SVG or can fetch it */}
        {/* <img src={...logo_url} width="100" height="100" /> */}
        <div style={{ marginTop: 20, fontSize: 80, fontWeight: 700 /* Use numeric weight for bold */, fontFamily: '"GeistBold"' }}>
          Weval
        </div>
        <div style={{ marginTop: 30, fontSize: 42, color: '#E0E0E0', lineHeight: 1.4, fontFamily: '"GeistRegular"' }}>
          Open AI Evaluation Platform
        </div>
        <div style={{ position: 'absolute', bottom: 30, fontSize: 24, color: '#A0A0A0', fontFamily: '"GeistRegular"' }}>
          weval.org
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'GeistRegular', // Unique name for this font style/weight
          data: geistRegular,
          style: 'normal',
          weight: 400, // Regular weight
        },
        {
          name: 'GeistBold', // Unique name for this font style/weight
          data: geistBold,
          style: 'normal',
          weight: 700, // Bold weight
        },
      ],
    }
  );
} 