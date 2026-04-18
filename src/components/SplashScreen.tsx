import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TunnelScene } from "./tunnel/TunnelScene";

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  const dismiss = useCallback(() => {
    if (fading) return;
    setFading(true);
  }, [fading]);

  // Auto-dismiss after 4 seconds
  useEffect(() => {
    const timer = setTimeout(dismiss, 4000);
    return () => clearTimeout(timer);
  }, [dismiss]);

  // Skip on click or key
  useEffect(() => {
    const handleKey = () => dismiss();
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [dismiss]);

  if (!visible) return null;

  return (
    <AnimatePresence>
      {!fading ? null : undefined}
      <motion.div
        key="splash"
        className="fixed inset-0 z-50 cursor-pointer"
        onClick={dismiss}
        initial={{ opacity: 1 }}
        animate={{ opacity: fading ? 0 : 1 }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
        onAnimationComplete={() => {
          if (fading) {
            setVisible(false);
            onComplete();
          }
        }}
      >
        {/* 3D Tunnel Background */}
        <div className="absolute inset-0">
          <TunnelScene speed={0.8} />
        </div>

        {/* Overlay Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="text-center"
          >
            <h1
              className="text-5xl font-bold text-white tracking-tight mb-2"
              style={{
                textShadow: "0 0 40px rgba(234, 179, 8, 0.5), 0 0 80px rgba(234, 179, 8, 0.2)",
              }}
            >
              Campaign Studio
            </h1>
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-yellow-500/50" />
              <span className="text-yellow-500/80 text-sm font-medium tracking-widest uppercase">
                Email Drafter Pro
              </span>
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-yellow-500/50" />
            </div>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            transition={{ delay: 1.5, duration: 1 }}
            className="text-slate-400 text-sm mt-8"
          >
            Click anywhere or press any key to continue
          </motion.p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
