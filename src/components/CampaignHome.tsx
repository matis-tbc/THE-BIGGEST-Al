import React, { useEffect, useMemo, useState } from 'react';
import { campaignStore, CampaignAnalytics, CampaignRecord } from '../services/campaignStore';
import { listSchedulerJobs } from '../services/schedulerService';

interface CampaignHomeProps {
  onStartNewCampaign: () => void;
  onManageMembers: () => void;
}

interface CampaignCardData {
  campaign: CampaignRecord;
  analytics: CampaignAnalytics;
  schedulerSummary: {
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    paused: number;
  };
}

function statusBadge(status: CampaignRecord['status']): string {
  if (status === 'sent') return 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/50';
  if (status === 'queued' || status === 'sending') return 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/50';
  if (status === 'failed') return 'bg-rose-500/20 text-rose-200 border border-rose-400/50';
  if (status === 'paused') return 'bg-amber-500/20 text-amber-100 border border-amber-400/50';
  return 'bg-slate-700/70 text-slate-200 border border-slate-500/60';
}

export const CampaignHome: React.FC<CampaignHomeProps> = ({ onStartNewCampaign, onManageMembers }) => {
  const [cards, setCards] = useState<CampaignCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    const [campaigns, jobs] = await Promise.all([campaignStore.listCampaigns(), listSchedulerJobs()]);
    const topCampaigns = campaigns.slice(0, 30);
    const analytics = await Promise.all(topCampaigns.map(campaign => campaignStore.computeAnalytics(campaign.id)));

    const cardsData = topCampaigns.map((campaign, index) => {
      const campaignJobs = jobs.filter(job => job.campaignId === campaign.id);
      return {
        campaign,
        analytics: analytics[index],
        schedulerSummary: {
          total: campaignJobs.length,
          queued: campaignJobs.filter(job => job.status === 'queued').length,
          running: campaignJobs.filter(job => job.status === 'running').length,
          completed: campaignJobs.filter(job => job.status === 'completed').length,
          failed: campaignJobs.filter(job => job.status === 'failed').length,
          paused: campaignJobs.filter(job => job.status === 'paused').length,
        },
      };
    });

    setCards(cardsData);
    setIsLoading(false);
  };

  useEffect(() => {
    refresh().catch(error => {
      console.error('Failed to load campaign dashboard:', error);
      setIsLoading(false);
    });
    const timer = window.setInterval(() => {
      refresh().catch(error => {
        console.error('Failed to refresh campaign dashboard:', error);
      });
    }, 7000);
    return () => window.clearInterval(timer);
  }, []);

  const totals = useMemo(() => {
    return cards.reduce(
      (acc, card) => {
        acc.campaigns += 1;
        acc.drafted += card.analytics.drafted;
        acc.queued += card.analytics.queued;
        acc.automated += card.analytics.sent;
        acc.failed += card.analytics.failed;
        return acc;
      },
      { campaigns: 0, drafted: 0, queued: 0, automated: 0, failed: 0 }
    );
  }, [cards]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Campaign Home</h2>
        <p className="text-slate-400">Loading campaign history...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Campaign Home</h2>
          <p className="text-slate-400">View drafted and scheduled campaigns, automation jobs, and lifecycle metrics.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onManageMembers} className="btn-secondary">
            Manage Sender Profiles
          </button>
          <button onClick={onStartNewCampaign} className="btn-primary">
            Start New Campaign
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card !p-4">
          <p className="text-xs text-slate-400">Campaigns</p>
          <p className="text-2xl font-semibold text-white mt-1">{totals.campaigns}</p>
        </div>
        <div className="card !p-4">
          <p className="text-xs text-slate-400">Drafted</p>
          <p className="text-2xl font-semibold text-white mt-1">{totals.drafted}</p>
        </div>
        <div className="card !p-4 !border-cyan-500/30">
          <p className="text-xs text-cyan-400">Queued</p>
          <p className="text-2xl font-semibold text-cyan-50 mt-1">{totals.queued}</p>
        </div>
        <div className="card !p-4 !border-emerald-500/30">
          <p className="text-xs text-emerald-400">Auto-Sorted</p>
          <p className="text-2xl font-semibold text-emerald-50 mt-1">{totals.automated}</p>
        </div>
        <div className="card !p-4 !border-rose-500/30">
          <p className="text-xs text-rose-400">Failures</p>
          <p className="text-2xl font-semibold text-rose-50 mt-1">{totals.failed}</p>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center bg-slate-800/50">
          <p className="text-sm text-slate-400 mb-4">No campaigns yet. Create your first draft run to start tracking lifecycle data.</p>
          <button onClick={onStartNewCampaign} className="btn-secondary">Import Contacts</button>
        </div>
      ) : (
        <div className="space-y-4">
          {cards.map(({ campaign, analytics, schedulerSummary }) => (
            <div key={campaign.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-700 pb-3 mb-3">
                <div>
                  <h3 className="text-base font-semibold text-white">{campaign.name}</h3>
                  <p className="text-xs text-slate-400 mt-1">Updated {new Date(campaign.updatedAt).toLocaleString()}</p>
                </div>
                <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${statusBadge(campaign.status)}`}>
                  {campaign.status.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-3 text-xs">
                <div className="rounded-lg bg-slate-800/80 px-3 py-2">
                  <span className="block text-slate-400 mb-1">Drafted</span>
                  <span className="font-semibold text-slate-200 text-sm">{analytics.drafted}</span>
                </div>
                <div className="rounded-lg bg-slate-800/80 px-3 py-2">
                  <span className="block text-slate-400 mb-1">Queued</span>
                  <span className="font-semibold text-slate-200 text-sm">{analytics.queued}</span>
                </div>
                <div className="rounded-lg bg-slate-800/80 px-3 py-2">
                  <span className="block text-slate-400 mb-1">Auto-Sorted</span>
                  <span className="font-semibold text-slate-200 text-sm">{analytics.sent}</span>
                </div>
                <div className="rounded-lg bg-slate-800/80 px-3 py-2">
                  <span className="block text-slate-400 mb-1">Failed</span>
                  <span className="font-semibold text-rose-400 text-sm">{analytics.failed}</span>
                </div>
                <div className="rounded-lg bg-slate-800/80 px-3 py-2">
                  <span className="block text-slate-400 mb-1">Jobs</span>
                  <span className="font-semibold text-slate-200 text-sm">{schedulerSummary.total}</span>
                </div>
                <div className="rounded-lg bg-slate-800/80 px-3 py-2">
                  <span className="block text-slate-400 mb-1">Success</span>
                  <span className="font-semibold text-yellow-500 text-sm">{(analytics.sendRate * 100).toFixed(0)}%</span>
                </div>
              </div>

              {schedulerSummary.total > 0 && (
                <div className="mt-3 text-xs text-slate-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                  Jobs Status: Queued <span className="text-white">{schedulerSummary.queued}</span> •
                  Running <span className="text-white">{schedulerSummary.running}</span> •
                  Completed <span className="text-white">{schedulerSummary.completed}</span> •
                  Failed <span className="text-rose-400">{schedulerSummary.failed}</span> •
                  Paused <span className="text-white">{schedulerSummary.paused}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
