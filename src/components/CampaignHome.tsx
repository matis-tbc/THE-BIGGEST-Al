import type React from "react";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Users, Building2, Archive, Clock, FileText } from "lucide-react";
import { campaignStore, type Campaign, type CampaignKind } from "../services/campaignStore";
import { PacketSplitter } from "./PacketSplitter";

interface CampaignHomeProps {
  onOpenCampaign: (id: string) => void;
  onManageMembers: () => void;
}

export const CampaignHome: React.FC<CampaignHomeProps> = ({ onOpenCampaign, onManageMembers }) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newKind, setNewKind] = useState<CampaignKind>("outreach");
  const [splitterOpen, setSplitterOpen] = useState(false);

  useEffect(() => {
    setCampaigns(campaignStore.listCampaigns());
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const now = new Date().toISOString();
    const campaign: Campaign = {
      id: `campaign-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newName.trim(),
      description: newDescription.trim(),
      status: "active",
      createdAt: now,
      updatedAt: now,
      companies: [],
      contacts: [],
      templateId: null,
      kind: newKind,
      runs: [],
    };

    campaignStore.saveCampaign(campaign);
    setNewName("");
    setNewDescription("");
    setNewKind("outreach");
    setShowCreateForm(false);
    onOpenCampaign(campaign.id);
  };

  const kindOptions: Array<{ id: CampaignKind; label: string; description: string }> = [
    {
      id: "outreach",
      label: "Outreach",
      description:
        "Cold email to new prospects. Uses AI company discovery and the CU Hyperloop subject-line guard.",
    },
    {
      id: "follow_up",
      label: "Follow-up",
      description:
        "Warm messages to people you've already contacted. Skips lead discovery, softer validation.",
    },
    {
      id: "announcement",
      label: "Announcement / thank-you",
      description:
        "One-off blast to a known list (sponsor thank-yous, updates). Defaults to scheduled send.",
    },
  ];

  const statusBadge = (status: Campaign["status"]) => {
    const styles = {
      active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      archived: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    };
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${styles[status]}`}>
        {status}
      </span>
    );
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Campaigns</h2>
          <p className="text-slate-400">
            Organize outreach by campaign — generate companies, import contacts, and run drafts.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setSplitterOpen(true)}
            className="btn-secondary flex items-center gap-2"
            title="Split a multi-page sponsor packet PDF into one file per sponsor"
          >
            <FileText className="h-4 w-4" /> Split Packet PDF
          </button>
          <button onClick={onManageMembers} className="btn-secondary flex items-center gap-2">
            <Users className="h-4 w-4" /> Sender Profiles
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> New Campaign
          </button>
        </div>
      </div>

      {/* Inline Create Form */}
      {showCreateForm && (
        <motion.form
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleCreate}
          className="card bg-slate-800 border-yellow-500/30 space-y-4"
        >
          <h3 className="text-lg font-semibold text-white">Create Campaign</h3>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Campaign Name *</label>
            <input
              type="text"
              className="input-field"
              placeholder='e.g. "Canopies", "Brake Pads Q2"'
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Brief description of what this campaign targets"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Campaign type</label>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {kindOptions.map((opt) => {
                const isActive = newKind === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setNewKind(opt.id)}
                    className={`rounded-lg border px-3 py-2 text-left transition ${
                      isActive
                        ? "border-yellow-400 bg-yellow-500/10"
                        : "border-slate-700 bg-slate-900/40 hover:border-slate-600"
                    }`}
                  >
                    <div className="text-sm font-medium text-slate-100">{opt.label}</div>
                    <div className="mt-1 text-[11px] text-slate-400 leading-snug">
                      {opt.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={!newName.trim()} className="btn-primary">
              Create & Open
            </button>
          </div>
        </motion.form>
      )}

      {/* Campaign Grid */}
      {campaigns.length > 0 ? (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.07 } } }}
        >
          {campaigns.map((campaign) => (
            <motion.div
              key={campaign.id}
              variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
              className="card bg-slate-800/80 hover:bg-slate-800 border-slate-700 hover:border-slate-600 cursor-pointer transition-all group"
              onClick={() => onOpenCampaign(campaign.id)}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-lg font-semibold text-white group-hover:text-yellow-400 transition-colors">
                  {campaign.name}
                </h3>
                {statusBadge(campaign.status)}
              </div>
              {campaign.description && (
                <p className="text-sm text-slate-400 mb-3 line-clamp-2">{campaign.description}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" /> {campaign.companies.length} companies
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> {campaign.contacts.length} contacts
                </span>
                {campaign.runs.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Archive className="h-3.5 w-3.5" /> {campaign.runs.length} runs
                  </span>
                )}
                <span className="flex items-center gap-1 ml-auto">
                  <Clock className="h-3.5 w-3.5" /> {formatDate(campaign.updatedAt)}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      ) : !showCreateForm ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-12 text-center bg-slate-800/50">
          <Building2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 mb-4">No campaigns yet. Create one to get started.</p>
          <button onClick={() => setShowCreateForm(true)} className="btn-primary">
            Create Your First Campaign
          </button>
        </div>
      ) : null}

      {/* Cmd+K hint */}
      <div className="text-center pt-4 border-t border-slate-800">
        <p className="text-xs text-slate-600">
          Press{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-500">
            {typeof navigator !== "undefined" && navigator.platform?.includes("Mac")
              ? "\u2318"
              : "Ctrl+"}
            K
          </kbd>{" "}
          for quick actions — navigate, create campaigns, and more
        </p>
      </div>

      <PacketSplitter open={splitterOpen} onClose={() => setSplitterOpen(false)} />
    </div>
  );
};
