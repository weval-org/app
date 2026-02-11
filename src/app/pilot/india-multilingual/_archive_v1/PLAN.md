# India Multilingual Pilot v2 - Design Plan

## Philosophy

**One story, told beautifully.** Not a data dashboard, but a narrative experience that teaches through interaction.

The core insight: "When native speakers of 7 Indian languages compared AI responses side-by-side, they preferred Opus 63% of the time."

Everything else supports, contextualizes, or nuances this finding.

---

## Page Structure

### Section 1: The Hero (Above the fold)

**Goal:** Immediate impact. One number. Total clarity.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                           63%                                   │
│                                                                 │
│            Native speakers preferred Opus 4.5                   │
│                                                                 │
│     10,629 head-to-head comparisons · 7 languages · 119 workers │
│                                                                 │
│                      [Explore the data ↓]                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Design notes:**
- "63%" in massive, elegant serif (Source Serif 4, 120px+)
- Subtle gradient or texture behind the number
- Languages shown as small script samples: हिंदी বাংলা తెలుగు ಕನ್ನಡ മലയാളം অসমীয়া मराठी
- Smooth scroll hint animation

---

### Section 2: The Context (Why this matters)

**Goal:** Frame the significance before diving into data.

```
┌─────────────────────────────────────────────────────────────────┐
│  THE EXPERIMENT                                                 │
│                                                                 │
│  AI models are benchmarked on English. But what about the      │
│  languages spoken by over a billion people?                     │
│                                                                 │
│  We partnered with Karya to ask native speakers across India   │
│  to compare Claude Opus 4.5 and Sonnet 4.5 on questions that   │
│  matter to them: tenant rights, crop disease, labor law,       │
│  irrigation subsidies.                                          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    [MAP OF INDIA]                        │   │
│  │     with 7 regions highlighted, language labels          │   │
│  │     Hindi (North), Bengali (East), Telugu (South),       │   │
│  │     etc.                                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Same question. Same worker. Two anonymous responses.           │
│  Which one did they trust?                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Design notes:**
- Clean prose, not bullet points
- SVG map of India with hover states per language region
- Warm, human tone

---

### Section 3: Try It Yourself (Interactive comparison)

**Goal:** Build intuition through participation. The user becomes an evaluator.

```
┌─────────────────────────────────────────────────────────────────┐
│  SEE FOR YOURSELF                                               │
│                                                                 │
│  Here's an actual question a farmer in Karnataka asked.         │
│  Read both responses and pick which you think is better.        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  QUESTION (Kannada)                                      │   │
│  │  ನಮ್ಮ ಹೊಲದಲ್ಲಿ ಭತ್ತಕ್ಕೆ ಕೀಟಬಾಧೆ ಬಂದಿದೆ...              │   │
│  │                                                          │   │
│  │  [Show English translation]                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────┐    ┌──────────────────────┐          │
│  │     RESPONSE A       │    │     RESPONSE B       │          │
│  │                      │    │                      │          │
│  │  ಭತ್ತದ ಕೀಟಬಾಧೆಗೆ...   │    │  ನಿಮ್ಮ ಸಮಸ್ಯೆಗೆ...     │          │
│  │  [truncated]         │    │  [truncated]         │          │
│  │                      │    │                      │          │
│  │  [Expand to read]    │    │  [Expand to read]    │          │
│  │                      │    │                      │          │
│  │  ┌──────────────┐    │    │  ┌──────────────┐    │          │
│  │  │ I prefer A   │    │    │  │ I prefer B   │    │          │
│  │  └──────────────┘    │    │  └──────────────┘    │          │
│  └──────────────────────┘    └──────────────────────┘          │
│                                                                 │
│              [They're equally good]  [They're equally bad]      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

After selection:

┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  The native speaker chose: RESPONSE A (Opus 4.5) ✓             │
│                                                                 │
│  You agreed! / You disagreed - interesting!                    │
│                                                                 │
│  Response A was Claude Opus 4.5                                │
│  Response B was Claude Sonnet 4.5                              │
│                                                                 │
│                    [Try another comparison]                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Design notes:**
- Random selection from the 10,629 comparisons
- Show native script by default, English translation on demand
- Track user's agreement rate for fun ("You agreed with native speakers 4/5 times")
- Subtle reveal animation

---

### Section 4: The Breakdown (By Language)

**Goal:** Show the pattern across all languages. Visual, scannable.

```
┌─────────────────────────────────────────────────────────────────┐
│  BY LANGUAGE                                                    │
│                                                                 │
│  Opus was preferred across all 7 languages, but the margin     │
│  varied significantly.                                          │
│                                                                 │
│  Hindi      ████████████████████████████████░░░░░░░░  71%       │
│             1,417 comparisons                      +21pp        │
│                                                                 │
│  Telugu     ██████████████████████████████░░░░░░░░░░  67%       │
│             1,410 comparisons                      +17pp        │
│                                                                 │
│  Bengali    █████████████████████████████░░░░░░░░░░░  66%       │
│             1,066 comparisons                      +16pp        │
│                                                                 │
│  Malayalam  ███████████████████████████░░░░░░░░░░░░░  61%       │
│             1,325 comparisons                      +11pp        │
│                                                                 │
│  Marathi    ███████████████████████████░░░░░░░░░░░░░  61%       │
│             481 comparisons                        +11pp        │
│                                                                 │
│  Assamese   █████████████████████████░░░░░░░░░░░░░░░  57%       │
│             1,214 comparisons                       +7pp        │
│                                                                 │
│  Kannada    ████████████████████████░░░░░░░░░░░░░░░░  55%       │
│             967 comparisons                         +5pp        │
│                                                                 │
│  ───────────────────────────────────────────────────────────── │
│           ◄ Sonnet wins                    Opus wins ►          │
│                         50% = no preference                     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 💡 Hindi speakers showed the strongest Opus preference.  │   │
│  │    Kannada was closest to even.                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Design notes:**
- Bars centered on 50%, extending left (Sonnet) or right (Opus)
- Subtle animation as bars fill on scroll
- "+pp" = percentage points above 50%
- Click a language to filter the comparison explorer to that language

---

### Section 5: The Equal Verdicts

**Goal:** Acknowledge the 25% where workers said "both are good"

```
┌─────────────────────────────────────────────────────────────────┐
│  NOT ALWAYS A CLEAR WINNER                                      │
│                                                                 │
│  In 25% of comparisons, native speakers said both responses    │
│  were equally good. Only 0.4% said both were equally bad.      │
│                                                                 │
│     ┌────────────────────────────────────────────────────┐     │
│     │  ████████████████████  Opus preferred (47%)        │     │
│     │  ████████████         Sonnet preferred (27%)       │     │
│     │  ████████             Equally good (25%)           │     │
│     │  ░                    Equally bad (0.4%)           │     │
│     └────────────────────────────────────────────────────┘     │
│                                                                 │
│  This suggests both models are capable - Opus just edges       │
│  ahead more often when there's a difference.                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Section 6: Meet the Evaluators (Curated Profiles)

**Goal:** Humanize the data. These are real people with patterns.

```
┌─────────────────────────────────────────────────────────────────┐
│  THE EVALUATORS                                                 │
│                                                                 │
│  119 native speakers participated. Here are some notable        │
│  patterns we observed.                                          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  THE OPUS ADVOCATE                                       │   │
│  │  Worker #5721 · Telugu · 140 comparisons                 │   │
│  │                                                          │   │
│  │  Chose Opus 94% of the time (131 vs 9)                   │   │
│  │  Never said "equally good" - always picked a winner      │   │
│  │                                                          │   │
│  │  Sample: "ఇంటి యజమాని వేధింపులు ఎక్కడ ఫిర్యాదు చేయాలి?"   │   │
│  │          → Chose Opus                                    │   │
│  │                                                          │   │
│  │  [See their comparisons →]                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  THE SONNET ADVOCATE                                     │   │
│  │  Worker #9673 · Telugu · 140 comparisons                 │   │
│  │                                                          │   │
│  │  Chose Sonnet 59% of the time (76 vs 53)                 │   │
│  │  One of the few workers who consistently preferred Sonnet│   │
│  │                                                          │   │
│  │  [See their comparisons →]                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  THE DIPLOMAT                                            │   │
│  │  Worker #13976 · Telugu · 139 comparisons                │   │
│  │                                                          │   │
│  │  Said "equally good" 50% of the time (69 cases)          │   │
│  │  When forced to pick: 77% Opus                           │   │
│  │                                                          │   │
│  │  [See their comparisons →]                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  THE POLYGLOT                                            │   │
│  │  Worker #10045 · Hindi & Marathi · 158 comparisons       │   │
│  │                                                          │   │
│  │  Evaluated in two languages                              │   │
│  │  Consistent 77% Opus preference across both              │   │
│  │                                                          │   │
│  │  [See their comparisons →]                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Design notes:**
- Not sorted by volume, sorted by interestingness
- Each profile tells a micro-story
- Expandable to see actual comparisons they made

---

### Section 7: The Nuances (Methodology notes)

**Goal:** Honest about limitations. Builds trust.

```
┌─────────────────────────────────────────────────────────────────┐
│  THINGS TO KNOW                                                 │
│                                                                 │
│  ┌─ Position Bias ─────────────────────────────────────────┐   │
│  │  Workers slightly favored whichever response was shown  │   │
│  │  second. We randomized positions to control for this.   │   │
│  │  The effect was small (6.5pp) but varied by language.   │   │
│  │                                                [expand] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ Non-Expert Evaluators ─────────────────────────────────┐   │
│  │  Workers were native speakers, not lawyers or agronomists.│  │
│  │  They judged fluency, clarity, and perceived             │   │
│  │  trustworthiness - not technical accuracy.      [expand] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ Single-Rater Design ───────────────────────────────────┐   │
│  │  Each comparison was rated by one person. We validated  │   │
│  │  with worker reliability scoring.              [expand] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ Independent Questions ─────────────────────────────────┐   │
│  │  Each language had its own question set (not            │   │
│  │  translations). Cross-language comparison of specific   │   │
│  │  questions isn't possible.                     [expand] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Section 8: Deep Dive - LLM Judge Calibration (Collapsible/Tab)

**Goal:** Secondary analysis for those interested. Don't clutter the main story.

```
┌─────────────────────────────────────────────────────────────────┐
│  ▼ BONUS: CAN AI JUDGE AI?                                      │
│                                                                 │
│  We also had LLM judges (GPT-4o, Qwen, etc.) rate the same     │
│  responses on trust, fluency, complexity, and code-switching.  │
│                                                                 │
│  How well did they agree with native speakers?                 │
│                                                                 │
│  [Detailed analysis of agreement rates, notable disagreements] │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Section 9: Explore All Data (Optional deep-dive)

**Goal:** For power users who want to dig in.

```
┌─────────────────────────────────────────────────────────────────┐
│  EXPLORE THE DATA                                               │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Search: [                                            ] │    │
│  │ Language: [All ▼]  Domain: [All ▼]  Outcome: [All ▼]  │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  Showing 25 of 10,629 comparisons                              │
│                                                                 │
│  [Table with: Question preview | Language | Domain | Winner]   │
│                                                                 │
│  Click any row to see full comparison...                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Section 10: Footer

```
┌─────────────────────────────────────────────────────────────────┐
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Data collected by Karya · Analysis by Anthropic               │
│  February 2026                                                  │
│                                                                 │
│  [Download raw data] · [Methodology details] · [Contact]       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Structure

```
src/app/pilot/india-multilingual/v2/
├── page.tsx                      # Server component, data loading
├── V2Client.tsx                  # Main client component
├── components/
│   ├── HeroStat.tsx              # The big 63%
│   ├── ContextSection.tsx        # The experiment framing
│   ├── ComparisonGame.tsx        # Interactive "try it yourself"
│   ├── LanguageBreakdown.tsx     # Horizontal bar chart
│   ├── EqualVerdicts.tsx         # The 25% equally good
│   ├── EvaluatorProfiles.tsx     # Curated worker stories
│   ├── MethodologyNotes.tsx      # Collapsible caveats
│   ├── JudgeCalibration.tsx      # LLM vs human (collapsible)
│   ├── DataExplorer.tsx          # Search/filter all comparisons
│   └── Footer.tsx                # Credits
├── hooks/
│   └── useComparisonGame.ts      # State for the interactive game
├── data/
│   └── curated-profiles.ts       # Pre-selected interesting workers
└── README.md                     # This plan
```

---

## Data Requirements

### From comparative_results.json (existing):
- Overall stats (totalComparisons, opusWinRate)
- byLanguage breakdown
- topWorkers (need to re-curate for interestingness)

### New data needed:
1. **Full comparison details** for the interactive game
   - Need: question, answer1, answer2, model IDs, worker choice
   - Source: Raw CSV or new JSON export

2. **Curated worker profiles**
   - The Opus Advocate (highest Opus %)
   - The Sonnet Advocate (lowest Opus %)
   - The Diplomat (most "equal good")
   - The Polyglot (multi-language)

3. **Position bias stats**
   - Opus win rate when in position 1 vs position 2
   - By language

---

## Visual Design Tokens

```css
/* Typography */
--font-display: 'Source Serif 4', Georgia, serif;
--font-body: 'Inter', system-ui, sans-serif;

/* Colors */
--opus-primary: #6366f1;      /* Indigo */
--opus-light: #e0e7ff;
--sonnet-primary: #f59e0b;    /* Amber */
--sonnet-light: #fef3c7;
--equal-good: #10b981;        /* Emerald */
--equal-bad: #ef4444;         /* Red */

/* Spacing */
--section-gap: 8rem;
--content-max-width: 48rem;

/* Effects */
--card-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
--hover-lift: translateY(-2px);
```

---

## Animation Plan

1. **Hero number** - Count up from 0 to 63 on load
2. **Language bars** - Fill left-to-right on scroll into view
3. **Comparison game** - Smooth reveal of result after selection
4. **Section transitions** - Subtle fade-up as sections enter viewport

---

## Mobile Considerations

- Hero stat: 80px instead of 120px
- Comparison game: Stack responses vertically
- Language bars: Full width, smaller text
- Worker profiles: Carousel/swipeable
- All touch targets: minimum 44px

---

## Implementation Order

1. **Phase 1: Structure**
   - page.tsx with data loading
   - V2Client.tsx skeleton
   - Basic section components (static)

2. **Phase 2: Hero + Context**
   - HeroStat with animation
   - ContextSection with map placeholder

3. **Phase 3: Core Visualization**
   - LanguageBreakdown bars
   - EqualVerdicts chart

4. **Phase 4: Interactive Game**
   - ComparisonGame component
   - Load random comparison
   - Track user selections

5. **Phase 5: Worker Profiles**
   - Curate interesting workers
   - EvaluatorProfiles component

6. **Phase 6: Deep Dives**
   - MethodologyNotes (collapsible)
   - JudgeCalibration (collapsible)
   - DataExplorer (search/filter)

7. **Phase 7: Polish**
   - Animations
   - Mobile testing
   - Performance optimization
