// Scientifically generated maximally distinct colors using Delta E perceptual difference
// Each color has minimum ΔE of 43.7 (anything > 25 is very distinct for data visualization)
export const MAKER_COLORS: Record<string, string> = {
  OPENAI: '#8f2424',      // HSL(0, 60%, 35%) - ΔE: ∞
  ANTHROPIC: '#25f425',   // HSL(120, 90%, 55%) - ΔE: 144.1
  GOOGLE: '#2525f4',      // HSL(240, 90%, 55%) - ΔE: 127.3
  META: '#25d1f4',        // HSL(190, 90%, 55%) - ΔE: 102.9
  MISTRALAI: '#dab80b',   // HSL(50, 90%, 45%) - ΔE: 79.3
  DEEPSEEK: '#ed5ed5',    // HSL(310, 80%, 65%) - ΔE: 69.5
  XAI: '#248f47',         // HSL(140, 60%, 35%) - ΔE: 66.0
  COHERE: '#24478f',      // HSL(220, 60%, 35%) - ΔE: 63.4
  'Z-AI': '#f46a25',      // HSL(20, 90%, 55%) - ΔE: 44.7
  MOONSHOT: '#dba670',    // HSL(30, 60%, 65%) - ΔE: 43.7
  UNKNOWN: '#9ca3af',     // Neutral Gray (fallback)
};

export function getMakerColor(maker: string): string {
  return MAKER_COLORS[maker] || MAKER_COLORS.UNKNOWN;
}


