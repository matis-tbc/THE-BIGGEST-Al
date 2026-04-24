import type React from "react";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface PacketSplitterProps {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_INPUT = "~/Downloads/Thank You Sponsor 2026.pdf";
const DEFAULT_OUTPUT = "~/Desktop/sponsor_packets";

export const PacketSplitter: React.FC<PacketSplitterProps> = ({ open, onClose }) => {
  const [inputPath, setInputPath] = useState<string>(DEFAULT_INPUT);
  const [outputPath, setOutputPath] = useState<string>(DEFAULT_OUTPUT);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<{
    ok: boolean;
    filesWritten?: number;
    error?: string;
  } | null>(null);
  const logBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      setLog([]);
      setResult(null);
      setRunning(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const api: any = (window as any).electronAPI;
    if (!api?.onSplitPacketLog) return;
    const off = api.onSplitPacketLog((line: string) => {
      setLog((prev) => [...prev, line]);
    });
    return off;
  }, [open]);

  useEffect(() => {
    if (logBottomRef.current) logBottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  const runSplit = async () => {
    setRunning(true);
    setLog([]);
    setResult(null);
    const api: any = (window as any).electronAPI;
    if (!api?.splitPacket) {
      setResult({ ok: false, error: "electronAPI.splitPacket not available" });
      setRunning(false);
      return;
    }
    try {
      const res = await api.splitPacket(inputPath.trim(), outputPath.trim());
      setResult(res);
    } catch (err: any) {
      setResult({ ok: false, error: err?.message || String(err) });
    } finally {
      setRunning(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-semibold text-white">Split sponsor packet PDF</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Splits the multi-page Canva export into one PDF per sponsor, named{" "}
              <code className="text-slate-300">Thank You {"{Company}.pdf"}</code>. Skips trailing
              placeholder pages.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200"
            disabled={running}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
              Input PDF
            </label>
            <input
              type="text"
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              disabled={running}
              placeholder={DEFAULT_INPUT}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-400 focus:outline-none"
            />
            <div className="text-[11px] text-slate-500 mt-1">
              Path supports <code>~</code> for your home directory.
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
              Output folder
            </label>
            <input
              type="text"
              value={outputPath}
              onChange={(e) => setOutputPath(e.target.value)}
              disabled={running}
              placeholder={DEFAULT_OUTPUT}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-400 focus:outline-none"
            />
          </div>

          <div className="rounded-md border border-slate-800 bg-slate-950 p-3 h-64 overflow-y-auto font-mono text-[11px] text-slate-300 whitespace-pre-wrap">
            {log.length === 0 ? (
              <span className="text-slate-600">Log output will appear here when you run.</span>
            ) : (
              log.map((line, i) => <div key={i}>{line}</div>)
            )}
            <div ref={logBottomRef} />
          </div>

          {result && (
            <div
              className={`rounded-md border px-3 py-2 text-sm ${
                result.ok
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-rose-500/40 bg-rose-500/10 text-rose-300"
              }`}
            >
              {result.ok
                ? `Wrote ${result.filesWritten ?? "?"} files to ${outputPath}`
                : `Failed: ${result.error}`}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-800 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary" disabled={running}>
            Close
          </button>
          <button
            onClick={runSplit}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={running || !inputPath.trim() || !outputPath.trim()}
          >
            {running ? "Running..." : "Run"}
          </button>
        </div>
      </div>
    </div>
  );
};
