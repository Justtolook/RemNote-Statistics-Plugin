import React from 'react';
import { MetricCard } from '../statisticsComponents';

const KONAMI_SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const LOGO_CLICKS_FOR_CONFETTI = 7;

/** Shows a banner for five seconds after the Konami code is typed. */
function useKonamiCode(): boolean {
  const [active, setActive] = React.useState(false);

  React.useEffect(() => {
    let progress = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      progress = event.key === KONAMI_SEQUENCE[progress] ? progress + 1 : event.key === KONAMI_SEQUENCE[0] ? 1 : 0;
      if (progress === KONAMI_SEQUENCE.length) {
        progress = 0;
        setActive(true);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setActive(false), 5000);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return active;
}

/** Counts logo clicks and shows confetti for three seconds after seven of them. */
export function useLogoEasterEgg() {
  const [clicks, setClicks] = React.useState(0);
  const showConfetti = clicks >= LOGO_CLICKS_FOR_CONFETTI;

  React.useEffect(() => {
    if (!showConfetti) return;
    const timer = setTimeout(() => setClicks(0), 3000);
    return () => clearTimeout(timer);
  }, [showConfetti]);

  return { showConfetti, onLogoClick: () => setClicks(count => count + 1) };
}

export function EasterEggBanners({ showConfetti, accent }: { showConfetti: boolean; accent: string }) {
  const showKonami = useKonamiCode();

  return (
    <>
      {showKonami && (
        <div
          className="mb-4 p-4 rounded-lg text-center animate-bounce"
          style={{ backgroundColor: accent, color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
        >
          <div className="text-lg font-bold">🎉 Konami Code Activated! 🎉</div>
          <div className="text-sm mt-1">You're a true legend! Keep crushing those flashcards! 💪</div>
        </div>
      )}
      {showConfetti && (
        <div
          className="mb-4 p-6 rounded-lg text-center"
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: '#fff',
            boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
            animation: 'pulse 0.5s ease-in-out infinite'
          }}
        >
          <div className="text-3xl mb-2">🎊 🎉 🎈 ✨ 🎁 🌟</div>
          <div className="text-xl font-bold">Congratulations!</div>
          <div className="text-sm mt-2">You found the secret click counter! 🎯</div>
          <div className="text-xs mt-1 opacity-90">You're clearly very curious... or very bored 😄</div>
        </div>
      )}
    </>
  );
}

/** The "Remembered" metric card, with a bunny hiding behind it. */
export function RememberedMetricCard({ value }: { value: number }) {
  const [showBunny, setShowBunny] = React.useState(false);

  return (
    <div
      className="relative cursor-pointer"
      style={{ overflow: 'visible' }}
      onMouseEnter={() => setShowBunny(true)}
      onMouseLeave={() => setShowBunny(false)}
      onClick={() => setShowBunny(visible => !visible)}
    >
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ opacity: showBunny ? 1 : 0, transition: 'opacity 1s ease-in-out', zIndex: 0, left: '-10px' }}
      >
        <div className="text-6xl animate-bounce">🐰</div>
      </div>
      <div className="remembered-metric-card-shell" style={{ transform: showBunny ? 'translateX(70px)' : 'translateX(0)' }}>
        <MetricCard
          label="Remembered"
          value={value.toLocaleString()}
          supporting={showBunny ? <span style={{ color: '#10b981' }}>🥕 Peek-a-boo!</span> : undefined}
          accent="#10b981"
        />
      </div>
    </div>
  );
}
