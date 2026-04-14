import React, { useState, useMemo } from "react";
import type { EmailGuess, BacktestResult } from "../utils/emailPatterns";

interface Contact {
  id: string;
  name: string;
  email: string;
  [key: string]: string | null | undefined;
}

interface EmailGuesserProps {
  contacts: Contact[];
  onContactsUpdated: (contacts: Contact[]) => void;
}

export const EmailGuesser: React.FC<EmailGuesserProps> = ({
  contacts,
  onContactsUpdated,
}) => {
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(
    null,
  );
  const [isRunningBacktest, setIsRunningBacktest] = useState(false);
  const [linkedInUrls, setLinkedInUrls] = useState("");
  const [linkedInDomain, setLinkedInDomain] = useState("");
  const [linkedInResults, setLinkedInResults] = useState<
    { name: string; email: string; confidence: number }[]
  >([]);
  const [isProcessingUrls, setIsProcessingUrls] = useState(false);

  // Known contacts for pattern training (those with valid emails)
  const knownContacts = useMemo(
    () =>
      contacts
        .filter((c) => c.email && c.email.includes("@"))
        .map((c) => ({ name: c.name, email: c.email })),
    [contacts],
  );

  // Contacts missing emails
  const missingEmailContacts = useMemo(
    () => contacts.filter((c) => !c.email || !c.email.includes("@")),
    [contacts],
  );

  const runBacktest = async () => {
    if (!window.electronAPI?.emailBacktest) return;
    setIsRunningBacktest(true);
    try {
      const result = await window.electronAPI.emailBacktest(knownContacts);
      setBacktestResult(result);
    } catch (err) {
      console.error("Backtest failed:", err);
    } finally {
      setIsRunningBacktest(false);
    }
  };

  const guessEmailForContact = async (
    contact: Contact,
    domain: string,
  ): Promise<EmailGuess[]> => {
    if (!window.electronAPI?.emailGuess) return [];
    return await window.electronAPI.emailGuess(
      contact.name,
      domain,
      knownContacts,
    );
  };

  const [mxValid, setMxValid] = useState<boolean | null>(null);

  const processLinkedInUrls = async () => {
    if (!linkedInDomain.trim() || !linkedInUrls.trim()) return;
    if (!window.electronAPI?.emailParseLinkedin || !window.electronAPI?.emailGuess) return;

    setIsProcessingUrls(true);
    setMxValid(null);

    // Verify MX first
    if (window.electronAPI.emailVerifyMx) {
      const mx = await window.electronAPI.emailVerifyMx(linkedInDomain.trim());
      setMxValid(mx.valid);
      if (!mx.valid) {
        setIsProcessingUrls(false);
        return;
      }
    }

    const urls = linkedInUrls
      .trim()
      .split("\n")
      .filter((u) => u.trim());
    const results: { name: string; email: string; confidence: number }[] = [];

    for (const url of urls) {
      const parsed = await window.electronAPI.emailParseLinkedin(url.trim());
      if (parsed) {
        const fullName = `${parsed.firstName} ${parsed.lastName}`;
        const guesses = await window.electronAPI.emailGuess(
          fullName,
          linkedInDomain.trim(),
          knownContacts,
        );
        if (guesses.length > 0) {
          results.push({
            name: fullName,
            email: guesses[0].email,
            confidence: guesses[0].confidence,
          });
        }
      }
    }

    setLinkedInResults(results);
    setIsProcessingUrls(false);
  };

  const addLinkedInResultsToContacts = () => {
    const newContacts = linkedInResults.map((r, i) => ({
      id: `contact-li-${Date.now()}-${i}`,
      name: r.name,
      email: r.email,
    }));
    onContactsUpdated([...contacts, ...newContacts]);
    setLinkedInResults([]);
    setLinkedInUrls("");
  };

  return (
    <div className="space-y-4">
      {/* Backtest Section */}
      <div className="border border-slate-700 rounded-xl bg-slate-800/30 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-medium text-slate-200">
              Email Pattern Accuracy
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Tests pattern detection against {knownContacts.length} known
              contacts using leave-one-out validation
            </p>
          </div>
          <button
            onClick={runBacktest}
            disabled={isRunningBacktest || knownContacts.length < 2}
            className="btn-secondary text-xs disabled:opacity-50"
          >
            {isRunningBacktest ? "Testing..." : "Run Backtest"}
          </button>
        </div>

        {backtestResult && (
          <div className="space-y-3">
            {/* Overall stats */}
            <div className="flex items-center gap-4">
              <div className="bg-slate-900/50 rounded-lg px-3 py-2 text-center">
                <div
                  className={`text-2xl font-bold ${backtestResult.accuracy > 0.8 ? "text-emerald-400" : backtestResult.accuracy > 0.6 ? "text-yellow-400" : "text-rose-400"}`}
                >
                  {Math.round(backtestResult.accuracy * 100)}%
                </div>
                <div className="text-xs text-slate-500">Overall Accuracy</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg px-3 py-2 text-center">
                <div className="text-2xl font-bold text-slate-300">
                  {backtestResult.correctGuesses}/
                  {backtestResult.testableContacts}
                </div>
                <div className="text-xs text-slate-500">Correct Guesses</div>
              </div>
            </div>

            {/* Per-domain breakdown */}
            <div className="max-h-40 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th className="text-left p-1">Domain</th>
                    <th className="text-left p-1">Pattern</th>
                    <th className="text-center p-1">Contacts</th>
                    <th className="text-right p-1">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {backtestResult.perDomain.map((d) => (
                    <tr key={d.domain} className="border-t border-slate-800">
                      <td className="p-1 text-slate-300">{d.domain}</td>
                      <td className="p-1 text-slate-400 font-mono">
                        {d.pattern}
                      </td>
                      <td className="p-1 text-center text-slate-400">
                        {d.contacts}
                      </td>
                      <td className="p-1 text-right">
                        <span
                          className={
                            d.accuracy === 1
                              ? "text-emerald-400"
                              : d.accuracy > 0.7
                                ? "text-yellow-400"
                                : "text-rose-400"
                          }
                        >
                          {Math.round(d.accuracy * 100)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* LinkedIn URL Quick Add */}
      <div className="border border-slate-700 rounded-xl bg-slate-800/30 p-4">
        <h4 className="text-sm font-medium text-slate-200 mb-2">
          Quick Add from LinkedIn URLs
        </h4>
        <p className="text-xs text-slate-500 mb-3">
          Paste LinkedIn profile URLs (one per line). Names are extracted from
          the URL and emails are guessed from known patterns.
        </p>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={linkedInDomain}
              onChange={(e) => { setLinkedInDomain(e.target.value); setMxValid(null); }}
              placeholder="Company email domain (e.g., digikey.com)"
              className="flex-1 bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500"
            />
            {mxValid === true && <span className="text-xs text-emerald-400 flex-shrink-0">MX valid</span>}
            {mxValid === false && <span className="text-xs text-rose-400 flex-shrink-0">Invalid domain</span>}
          </div>
          <textarea
            value={linkedInUrls}
            onChange={(e) => setLinkedInUrls(e.target.value)}
            placeholder={"https://linkedin.com/in/john-smith-abc123\nhttps://linkedin.com/in/jane-doe-xyz789"}
            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 font-mono placeholder-slate-600 focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500 resize-y"
            rows={4}
          />
          <button
            onClick={processLinkedInUrls}
            disabled={
              isProcessingUrls ||
              !linkedInDomain.trim() ||
              !linkedInUrls.trim()
            }
            className="btn-primary text-sm w-full disabled:opacity-50"
          >
            {isProcessingUrls
              ? "Processing..."
              : "Generate Contacts from URLs"}
          </button>
        </div>

        {/* Results */}
        {linkedInResults.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-xs text-slate-400">
              {linkedInResults.length} contacts generated:
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {linkedInResults.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-slate-900/50 rounded px-2 py-1.5 text-xs"
                >
                  <span className="text-slate-300">{r.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-mono">{r.email}</span>
                    <span
                      className={`${r.confidence > 0.7 ? "text-emerald-400" : "text-yellow-400"}`}
                    >
                      {Math.round(r.confidence * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={addLinkedInResultsToContacts}
              className="btn-primary text-xs w-full"
            >
              Add {linkedInResults.length} Contacts to Campaign
            </button>
          </div>
        )}
      </div>

      {/* Missing email contacts */}
      {missingEmailContacts.length > 0 && (
        <div className="border border-yellow-500/20 rounded-xl bg-yellow-500/5 p-4">
          <h4 className="text-sm font-medium text-yellow-500 mb-2">
            {missingEmailContacts.length} contacts missing emails
          </h4>
          <p className="text-xs text-slate-500 mb-3">
            These contacts need a company domain to generate email guesses.
          </p>
        </div>
      )}
    </div>
  );
};
