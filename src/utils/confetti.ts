import confetti from "canvas-confetti";

export function fireCampaignConfetti() {
  const defaults = {
    colors: ["#eab308", "#f59e0b", "#fbbf24", "#ffffff", "#a855f7"],
    spread: 70,
    ticks: 200,
    zIndex: 100,
  };

  // Double burst from both sides
  confetti({ ...defaults, particleCount: 80, origin: { x: 0.3, y: 0.6 }, angle: 60 });
  confetti({ ...defaults, particleCount: 80, origin: { x: 0.7, y: 0.6 }, angle: 120 });

  // Delayed center burst
  setTimeout(() => {
    confetti({ ...defaults, particleCount: 50, origin: { x: 0.5, y: 0.5 }, spread: 100 });
  }, 250);
}
