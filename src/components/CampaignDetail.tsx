import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Building2, Users, FileText, History, Play,
  Copy, Check, Trash2, Archive, Edit2, X, Mail
} from 'lucide-react';
import { campaignStore, Campaign, GeneratedCompany } from '../services/campaignStore';
import { projectStore } from '../services/projectStore';
import { validateEmail } from '../utils/csvParser';
import { EmailGuesser } from './EmailGuesser';

type Tab = 'companies' | 'contacts' | 'emails' | 'template' | 'runs';

interface CampaignDetailProps {
  campaignId: string;
  onBack: () => void;
  onOpenLeadGen: () => void;
  onOpenContacts: () => void;
  onOpenTemplate: () => void;
  onRunCampaign: () => void;
}

export const CampaignDetail: React.FC<CampaignDetailProps> = ({
  campaignId, onBack, onOpenLeadGen, onOpenContacts, onOpenTemplate, onRunCampaign
}) => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('companies');
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedRow, setCopiedRow] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [descValue, setDescValue] = useState('');
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [templateName, setTemplateName] = useState<string | null>(null);

  const reload = useCallback(() => {
    const c = campaignStore.getCampaign(campaignId);
    setCampaign(c);
    if (c) {
      setNameValue(c.name);
      setDescValue(c.description);
    }
  }, [campaignId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!campaign?.templateId) {
      setTemplateName(null);
      return;
    }
    projectStore.listTemplates().then(templates => {
      const t = templates.find(t => t.id === campaign.templateId);
      setTemplateName(t?.name || null);
    });
  }, [campaign?.templateId]);

  if (!campaign) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">Campaign not found.</p>
        <button onClick={onBack} className="btn-secondary mt-4">Back to Campaigns</button>
      </div>
    );
  }

  const saveName = () => {
    if (nameValue.trim()) {
      campaignStore.updateCampaign(campaignId, { name: nameValue.trim() });
      reload();
    }
    setEditingName(false);
  };

  const saveDesc = () => {
    campaignStore.updateCampaign(campaignId, { description: descValue.trim() });
    reload();
    setEditingDesc(false);
  };

  const handleArchive = () => {
    const newStatus = campaign.status === 'archived' ? 'active' : 'archived';
    campaignStore.updateCampaign(campaignId, { status: newStatus });
    reload();
  };

  const handleDelete = () => {
    if (confirm(`Delete campaign "${campaign.name}"? This cannot be undone.`)) {
      campaignStore.deleteCampaign(campaignId);
      onBack();
    }
  };

  const copyAll = async () => {
    const text = campaign.companies.map(c => `${c.name}\t${c.website}`).join('\n');
    await navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const copyRow = async (company: GeneratedCompany) => {
    await navigator.clipboard.writeText(`${company.name}\t${company.website}`);
    setCopiedRow(company.id);
    setTimeout(() => setCopiedRow(null), 2000);
  };

  const deleteSelectedCompanies = () => {
    if (selectedCompanies.size === 0) return;
    const updated = { ...campaign, companies: campaign.companies.filter(c => !selectedCompanies.has(c.id)) };
    campaignStore.saveCampaign(updated as Campaign);
    setSelectedCompanies(new Set());
    reload();
  };

  const clearContacts = () => {
    campaignStore.setContacts(campaignId, []);
    reload();
  };

  const validContactCount = campaign.contacts.filter(c => validateEmail(c.email)).length;
  const allContactsHaveTemplate = campaign.contacts.length > 0 && campaign.contacts.every(c => c.templateId);
  const canRun = validContactCount > 0 && (campaign.templateId || allContactsHaveTemplate);

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'companies', label: 'Companies', icon: <Building2 className="h-4 w-4" />, count: campaign.companies.length },
    { key: 'contacts', label: 'Contacts', icon: <Users className="h-4 w-4" />, count: campaign.contacts.length },
    { key: 'emails', label: 'Email Finder', icon: <Mail className="h-4 w-4" />, count: campaign.contacts.filter(c => !c.email || !validateEmail(c.email)).length || undefined },
    { key: 'template', label: 'Template', icon: <FileText className="h-4 w-4" /> },
    { key: 'runs', label: 'Run History', icon: <History className="h-4 w-4" />, count: campaign.runs.length },
  ];

  const statusBadge = () => {
    const styles: Record<string, string> = {
      active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      completed: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      archived: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    };
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${styles[campaign.status]}`}>
        {campaign.status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button onClick={onBack} className="btn-secondary text-sm mb-4 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Campaigns
        </button>

        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    className="input-field text-xl font-bold !py-1"
                    value={nameValue}
                    onChange={e => setNameValue(e.target.value)}
                    onBlur={saveName}
                    onKeyDown={e => e.key === 'Enter' && saveName()}
                    autoFocus
                  />
                  <button onClick={saveName} className="text-emerald-400 hover:text-emerald-300"><Check className="h-4 w-4" /></button>
                  <button onClick={() => { setEditingName(false); setNameValue(campaign.name); }} className="text-slate-400 hover:text-slate-300"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <h2
                  className="text-2xl font-bold text-white cursor-pointer hover:text-yellow-400 transition-colors flex items-center gap-2"
                  onClick={() => setEditingName(true)}
                >
                  {campaign.name}
                  <Edit2 className="h-4 w-4 opacity-0 group-hover:opacity-100 text-slate-500" />
                </h2>
              )}
              {statusBadge()}
            </div>

            {editingDesc ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  className="input-field text-sm !py-1 flex-1"
                  value={descValue}
                  onChange={e => setDescValue(e.target.value)}
                  onBlur={saveDesc}
                  onKeyDown={e => e.key === 'Enter' && saveDesc()}
                  placeholder="Add a description..."
                  autoFocus
                />
                <button onClick={saveDesc} className="text-emerald-400"><Check className="h-4 w-4" /></button>
                <button onClick={() => { setEditingDesc(false); setDescValue(campaign.description); }} className="text-slate-400"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <p
                className="text-sm text-slate-400 cursor-pointer hover:text-slate-300 transition-colors mt-1"
                onClick={() => setEditingDesc(true)}
              >
                {campaign.description || 'Click to add a description...'}
              </p>
            )}
          </div>

          <div className="flex gap-2 ml-4 shrink-0">
            <button onClick={handleArchive} className="btn-secondary text-xs flex items-center gap-1">
              <Archive className="h-3.5 w-3.5" /> {campaign.status === 'archived' ? 'Unarchive' : 'Archive'}
            </button>
            <button onClick={handleDelete} className="btn-secondary text-xs text-rose-400 border-rose-500/30 hover:bg-rose-500/10 flex items-center gap-1">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700 gap-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-yellow-500 text-yellow-500'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-700 text-slate-400'
              }`}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
      <motion.div
        key={activeTab}
        className="min-h-[300px]"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.15 }}
      >
        {/* Companies Tab */}
        {activeTab === 'companies' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={onOpenLeadGen} className="btn-primary text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Generate Companies
                </button>
                {campaign.companies.length > 0 && (
                  <button onClick={copyAll} className="btn-secondary text-sm flex items-center gap-2">
                    {copiedAll ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    {copiedAll ? 'Copied!' : 'Copy All'}
                  </button>
                )}
              </div>
              {selectedCompanies.size > 0 && (
                <button onClick={deleteSelectedCompanies} className="btn-secondary text-xs text-rose-400 flex items-center gap-1">
                  <Trash2 className="h-3.5 w-3.5" /> Delete {selectedCompanies.size} selected
                </button>
              )}
            </div>

            {campaign.companies.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-slate-700">
                <table className="w-full text-sm text-left text-slate-300">
                  <thead className="text-xs uppercase bg-slate-800/80">
                    <tr>
                      <th className="px-3 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selectedCompanies.size === campaign.companies.length && campaign.companies.length > 0}
                          onChange={() => {
                            if (selectedCompanies.size === campaign.companies.length) {
                              setSelectedCompanies(new Set());
                            } else {
                              setSelectedCompanies(new Set(campaign.companies.map(c => c.id)));
                            }
                          }}
                          className="rounded border-slate-600 bg-slate-700 text-emerald-500"
                        />
                      </th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Website</th>
                      <th className="px-4 py-3">Industry</th>
                      <th className="px-4 py-3">Est. Size</th>
                      <th className="px-4 py-3">Relevance</th>
                      <th className="px-4 py-3">Reasoning</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaign.companies.map(company => (
                      <tr key={company.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedCompanies.has(company.id)}
                            onChange={() => {
                              const next = new Set(selectedCompanies);
                              if (next.has(company.id)) next.delete(company.id);
                              else next.add(company.id);
                              setSelectedCompanies(next);
                            }}
                            className="rounded border-slate-600 bg-slate-700 text-emerald-500"
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
                        <td className="px-4 py-3 text-xs text-slate-400 max-w-xs truncate">{company.reasoning}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => copyRow(company)} className="text-slate-500 hover:text-slate-300 transition-colors">
                            {copiedRow === company.id ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center bg-slate-800/50">
                <Building2 className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400 mb-3">No companies yet. Use AI to discover relevant companies.</p>
                <button onClick={onOpenLeadGen} className="btn-secondary text-sm">Generate Companies</button>
              </div>
            )}
          </div>
        )}

        {/* Contacts Tab */}
        {activeTab === 'contacts' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={onOpenContacts} className="btn-primary text-sm flex items-center gap-2">
                  <Users className="h-4 w-4" /> Import Contacts
                </button>
                {campaign.contacts.length > 0 && (
                  <button onClick={clearContacts} className="btn-secondary text-xs text-rose-400 flex items-center gap-1">
                    <Trash2 className="h-3.5 w-3.5" /> Clear Contacts
                  </button>
                )}
              </div>
              {campaign.contacts.length > 0 && (
                <div className="text-sm text-slate-400">
                  {validContactCount} valid of {campaign.contacts.length} contacts
                </div>
              )}
            </div>

            {campaign.contacts.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-slate-700 max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm text-left text-slate-300">
                  <thead className="text-xs uppercase bg-slate-800/80 sticky top-0">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaign.contacts.map(contact => (
                      <tr key={contact.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="px-4 py-3 font-medium text-white">{contact.name}</td>
                        <td className="px-4 py-3 font-mono text-xs">{contact.email}</td>
                        <td className="px-4 py-3 text-xs">{(contact as any).company || (contact as any).Company || '—'}</td>
                        <td className="px-4 py-3">
                          {validateEmail(contact.email) ? (
                            <span className="text-xs text-emerald-400">Valid</span>
                          ) : (
                            <span className="text-xs text-rose-400">Invalid</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center bg-slate-800/50">
                <Users className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400 mb-3">No contacts imported yet. Use Apollo/ContactOut to find contacts, then paste them here.</p>
                <button onClick={onOpenContacts} className="btn-secondary text-sm">Import Contacts</button>
              </div>
            )}
          </div>
        )}

        {/* Email Finder Tab */}
        {activeTab === 'emails' && (
          <EmailGuesser
            contacts={campaign.contacts}
            companies={campaign.companies}
            onContactsUpdated={(updated) => {
              campaignStore.setContacts(campaignId, updated);
              reload();
            }}
          />
        )}

        {/* Template Tab */}
        {activeTab === 'template' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button onClick={onOpenTemplate} className="btn-primary text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" /> Select Template
              </button>
            </div>

            {campaign.templateId && templateName ? (
              <div className="card bg-slate-800 border-emerald-500/20">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-emerald-400" />
                  <div>
                    <p className="text-sm font-medium text-white">{templateName}</p>
                    <p className="text-xs text-slate-400">Template selected for this campaign</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center bg-slate-800/50">
                <FileText className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400 mb-3">No template selected. Choose one to use for this campaign's drafts.</p>
                <button onClick={onOpenTemplate} className="btn-secondary text-sm">Select Template</button>
              </div>
            )}
          </div>
        )}

        {/* Run History Tab */}
        {activeTab === 'runs' && (
          <div className="space-y-4">
            {campaign.runs.length > 0 ? (
              <div className="space-y-3">
                {campaign.runs.map(run => (
                  <div key={run.id} className="card bg-slate-800 border-slate-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {new Date(run.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {run.contactCount} contacts · {run.attachmentName || 'No attachment'}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-emerald-400">{run.successCount} success</span>
                        {run.failCount > 0 && <span className="text-rose-400">{run.failCount} failed</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center bg-slate-800/50">
                <History className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No runs yet. Import contacts and select a template to run your first campaign.</p>
              </div>
            )}
          </div>
        )}
      </motion.div>
      </AnimatePresence>

      {/* Sticky Action Bar */}
      <div className="sticky bottom-0 bg-slate-900/95 backdrop-blur border-t border-slate-700 -mx-6 -mb-6 px-6 py-4 flex items-center justify-between">
        <div className="text-sm text-slate-400">
          {campaign.companies.length} companies · {validContactCount} valid contacts · {campaign.templateId ? 'Template set' : 'No template'}
        </div>
        <button
          onClick={onRunCampaign}
          disabled={!canRun}
          className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play className="h-4 w-4" /> Run Campaign
        </button>
      </div>
    </div>
  );
};
