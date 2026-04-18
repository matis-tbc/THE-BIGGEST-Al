import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Gauge } from "lucide-react";
import { TunnelScene } from "./tunnel/TunnelScene";

interface TunnelPlaygroundProps {
  onBack: () => void;
}

export function TunnelPlayground({ onBack }: TunnelPlaygroundProps) {
  const [speed, setSpeed] = useState(1.0);
  const [showControls, setShowControls] = useState(true);

  return (
    <div className="fixed inset-0 z-40 bg-black">
      {/* Full-screen tunnel */}
      <TunnelScene interactive speed={speed} />

      {/* Floating controls */}
      {showControls && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none"
        >
          <button
            onClick={onBack}
            className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-black/60 backdrop-blur border border-white/10 text-white/80 hover:text-white hover:bg-black/80 transition-all text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          <div className="pointer-events-auto flex items-center gap-3 px-4 py-2 rounded-lg bg-black/60 backdrop-blur border border-white/10">
            <Gauge className="h-4 w-4 text-yellow-500/80" />
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-24 accent-yellow-500"
            />
            <span className="text-xs text-white/60 w-10">{speed.toFixed(1)}x</span>
          </div>

          <button
            onClick={() => setShowControls(false)}
            className="pointer-events-auto px-3 py-2 rounded-lg bg-black/60 backdrop-blur border border-white/10 text-white/40 hover:text-white/80 transition-all text-xs"
          >
            Hide UI
          </button>
        </motion.div>
      )}

      {/* Tap to restore UI */}
      {!showControls && (
        <div className="absolute inset-0 cursor-pointer" onClick={() => setShowControls(true)} />
      )}
    </div>
  );
}
