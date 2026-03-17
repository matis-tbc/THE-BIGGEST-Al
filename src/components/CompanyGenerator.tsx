import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Loader2, Building2, AlertCircle, Copy, Check, Plus } from 'lucide-react';
import { Contact } from '../App';
import { GeneratedCompany } from '../services/campaignStore';

interface CompanyResult {
  name: string;
  website: string;
  reasoning: string;
  estimatedSize?: string;
  industry?: string;
  suggestedContactTitles?: string[];
  relevanceScore?: number;
}

interface CompanyGeneratorProps {
  onLeadsImported: (leads: Contact[]) => void;
  onBack: () => void;
  // Campaign scoping (optional)
  campaignId?: string;
  campaignDescription?: string;
  existingCompanies?: GeneratedCompany[];
  onSaveToCampaign?: (companies: GeneratedCompany[]) => void;
}

export const CompanyGenerator: React.FC<CompanyGeneratorProps> = ({
  onLeadsImported, onBack, campaignId, campaignDescription, existingCompanies = [], onSaveToCampaign
}) => {
  const [query, setQuery] = useState('');
  const [industry, setIndustry] = useState('');
  const [size, setSize] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allResults, setAllResults] = useState<CompanyResult[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<number>>(new Set());
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedRow, setCopiedRow] = useState<number | null>(null);
  const [refinement, setRefinement] = useState('');
  const [lastQuery, setLastQuery] = useState('');

  const existingNames = new Set(existingCompanies.map(c => c.name.toLowerCase()));

  const deduplicateResults = (results: CompanyResult[]): CompanyResult[] => {
    const seen = new Set<string>();
    // Include existing company names in the seen set
    existingNames.forEach(name => seen.add(name));
    return results.filter(r => {
      const key = r.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    await doSearch(query.trim(), false);
  };

  const handleSearchMore = async () => {
    if (!lastQuery) return;
    await doSearch(lastQuery, true);
  };

  const handleRefine = async () => {
    if (!refinement.trim() || !lastQuery) return;
    await doSearch(lastQuery, true, refinement.trim());
  };

  const doSearch = async (searchQuery: string, append: boolean, refineText?: string) => {
    setLoading(true);
    setError(null);
    if (!append) {
      setAllResults([]);
      setSelectedCompanies(new Set());
    }

    try {
      if (!(window as any).electronAPI?.companySearch) {
        throw new Error('Company search API is not available.');
      }

      const filters: Record<string, string | string[] | undefined> = {};
      if (industry.trim()) filters.industry = industry.trim();
      if (size.trim()) filters.size = size.trim();
      if (location.trim()) filters.location = location.trim();

      // Collect names to exclude
      const excludeNames = [
        ...existingCompanies.map(c => c.name),
        ...(append ? allResults.map(r => r.name) : []),
      ];
      if (excludeNames.length > 0) filters.excludeNames = excludeNames;
      if (campaignDescription) filters.campaignDescription = campaignDescription;
      if (refineText) filters.refinement = refineText;

      const response = await (window as any).electronAPI.companySearch(
        searchQuery,
        Object.keys(filters).length > 0 ? filters : undefined
      );

      if (response && response.companies && response.companies.length > 0) {
        const newResults = response.companies as CompanyResult[];
        if (append) {
          setAllResults(prev => {
            const combined = [...prev, ...newResults];
            return deduplicateResults(combined);
          });
        } else {
          setAllResults(deduplicateResults(newResults));
        }
        setLastQuery(searchQuery);
        setRefinement('');
      } else {
        if (!append) {
          setError('No companies found for this query. Try broadening your search.');
        } else {
          setError('No additional companies found. Try refining your search.');
        }
      }
    } catch (err: any) {
      console.error('Company search error:', err);
      setError(err.message || 'Failed to search for companies. Please check your API key.');
    } finally {
      setLoading(false);
    }
  };

  const toggleCompany = (index: number) => {
    const newSelected = new Set(selectedCompanies);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedCompanies(newSelected);
  };

  const toggleAll = () => {
    if (selectedCompanies.size === allResults.length) {
      setSelectedCompanies(new Set());
    } else {
      setSelectedCompanies(new Set(allResults.map((_, i) => i)));
    }
  };

  const handleImport = () => {
    const importedContacts: Contact[] = allResults
      .filter((_, i) => selectedCompanies.has(i))
      .map((company) => ({
        id: `company-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: company.name,
        email: '',
        company: company.name,
        website: company.website,
      }));

    if (importedContacts.length > 0) {
      onLeadsImported(importedContacts);
    }
  };

  const handleSaveToCampaign = () => {
    if (!onSaveToCampaign) return;
    const selected = allResults
      .filter((_, i) => selectedCompanies.has(i))
      .map((company): GeneratedCompany => ({
        id: `gc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: company.name,
        website: company.website,
        reasoning: company.reasoning,
        estimatedSize: company.estimatedSize,
        industry: company.industry,
        suggestedContactTitles: company.suggestedContactTitles,
        relevanceScore: company.relevanceScore,
        addedAt: new Date().toISOString(),
        searchQuery: lastQuery,
      }));

    if (selected.length > 0) {
      onSaveToCampaign(selected);
    }
  };

  const copyAllResults = async () => {
    const text = allResults.map(c => `${c.name}\t${c.website}`).join('\n');
    await navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const copyRow = async (index: number) => {
    const company = allResults[index];
    await navigator.clipboard.writeText(`${company.name}\t${company.website}`);
    setCopiedRow(index);
    setTimeout(() => setCopiedRow(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Building2 className="h-5 w-5 text-emerald-400" /> Company Discovery
          </h2>
          <p className="text-sm text-slate-400">Search for companies using AI. Find contacts manually via free tools like Apollo or ContactOut.</p>
        </div>
        <button className="btn-secondary" onClick={onBack}>
          {campaignId ? 'Back to Campaign' : 'Back to Home'}
        </button>
      </div>

      <div className="card bg-slate-800 border-slate-700">
        <form onSubmit={handleSearch} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Search Query</label>
            <input
              type="text"
              className="input-field"
              placeholder='e.g. "companies that sell 20x10 foot canopies"'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Industry (Optional)</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Manufacturing"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Company Size (Optional)</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. 50-200 employees"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Location (Optional)</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. United States"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="btn-primary flex items-center gap-2"
              disabled={loading || !query.trim()}
            >
              {loading ? <Loader2 className="animate-spin h-5 w-5" /> : <Search className="h-5 w-5" />}
              Find Companies
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3 text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {allResults.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card overflow-hidden"
        >
          <div className="p-4 border-b border-slate-700 flex flex-wrap justify-between items-center gap-3 bg-slate-800/50">
            <h3 className="font-medium text-white">Found {allResults.length} companies</h3>
            <div className="flex items-center gap-2">
              <button onClick={copyAllResults} className="btn-secondary py-1.5 text-sm flex items-center gap-2">
                {copiedAll ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copiedAll ? 'Copied!' : 'Copy All'}
              </button>
              {campaignId && onSaveToCampaign ? (
                <button
                  onClick={handleSaveToCampaign}
                  disabled={selectedCompanies.size === 0}
                  className="btn-primary py-1.5 text-sm flex items-center gap-2"
                >
                  <Building2 className="h-4 w-4" />
                  Save {selectedCompanies.size} to Campaign
                </button>
              ) : (
                <button
                  onClick={handleImport}
                  disabled={selectedCompanies.size === 0}
                  className="btn-primary py-1.5 text-sm flex items-center gap-2"
                >
                  <Building2 className="h-4 w-4" />
                  Import {selectedCompanies.size} as Contacts
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm text-left text-slate-300">
              <thead className="text-xs uppercase bg-slate-800/80 sticky top-0 z-10">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedCompanies.size === allResults.length && allResults.length > 0}
                      onChange={toggleAll}
                      className="rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500"
                    />
                  </th>
                  <th scope="col" className="px-4 py-3">Company Name</th>
                  <th scope="col" className="px-4 py-3">Website</th>
                  <th scope="col" className="px-4 py-3">Industry</th>
                  <th scope="col" className="px-4 py-3">Est. Size</th>
                  <th scope="col" className="px-4 py-3">Relevance</th>
                  <th scope="col" className="px-4 py-3">Reasoning</th>
                  <th scope="col" className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {/* Show existing campaign companies as grayed rows */}
                {campaignId && existingCompanies.map((company, i) => (
                  <tr key={`existing-${i}`} className="border-b border-slate-700/50 bg-slate-800/30 opacity-50">
                    <td className="px-4 py-3">
                      <input type="checkbox" disabled checked className="rounded border-slate-600 bg-slate-700 text-slate-500" />
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-500">{company.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{company.website}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{company.industry || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{company.estimatedSize || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{company.relevanceScore ? `${company.relevanceScore}/5` : '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-xs">Already saved</td>
                    <td className="px-4 py-3"></td>
                  </tr>
                ))}
                {allResults.map((company, index) => (
                  <tr
                    key={index}
                    className={`border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer transition-colors ${selectedCompanies.has(index) ? 'bg-emerald-500/5' : ''}`}
                    onClick={() => toggleCompany(index)}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedCompanies.has(index)}
                        onChange={() => toggleCompany(index)}
                        className="rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{company.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-blue-400">{company.website}</td>
                    <td className="px-4 py-3 text-xs">{company.industry || '—'}</td>
                    <td className="px-4 py-3 text-xs">{company.estimatedSize || '—'}</td>
                    <td className="px-4 py-3 text-xs">
                      {company.relevanceScore ? (
                        <span className={`font-medium ${company.relevanceScore >= 4 ? 'text-emerald-400' : company.relevanceScore >= 3 ? 'text-yellow-400' : 'text-slate-400'}`}>
                          {company.relevanceScore}/5
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-xs truncate">{company.reasoning}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <button onClick={() => copyRow(index)} className="text-slate-500 hover:text-slate-300 transition-colors">
                        {copiedRow === index ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Search More + Refinement */}
          <div className="p-4 border-t border-slate-700 bg-slate-800/30 space-y-3">
            <div className="flex items-center gap-3">
              <button
                onClick={handleSearchMore}
                disabled={loading || !lastQuery}
                className="btn-secondary text-sm flex items-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <Plus className="h-4 w-4" />}
                Search for More
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="input-field flex-1 text-sm !py-2"
                placeholder='Refine results... e.g. "focus on smaller companies" or "include international"'
                value={refinement}
                onChange={e => setRefinement(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRefine()}
              />
              <button
                onClick={handleRefine}
                disabled={loading || !refinement.trim() || !lastQuery}
                className="btn-secondary text-sm"
              >
                Refine
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
