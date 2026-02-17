import React, { useEffect, useMemo, useState } from 'react';
import { campaignStore, CampaignAnalytics, CampaignRecord } from '../services/campaignStore';
import { listSchedulerJobs } from '../services/schedulerService';

interface CampaignHomeProps {
  onStartNewCampaign: () => void;
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

export const CampaignHome: React.FC<CampaignHomeProps> = ({ onStartNewCampaign }) => {
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
        <h2 className="text-2xl font-bold text-gray-900">Campaign Home</h2>
        <p className="text-gray-600">Loading campaign history...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Campaign Home</h2>
          <p className="text-gray-600">View drafted and scheduled campaigns, automation jobs, and lifecycle metrics.</p>
        </div>
        <button onClick={onStartNewCampaign} className="btn-primary">
          Start New Campaign
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-md border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Campaigns</p>
          <p className="text-xl font-semibold text-gray-900">{totals.campaigns}</p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Drafted</p>
          <p className="text-xl font-semibold text-gray-900">{totals.drafted}</p>
        </div>
        <div className="rounded-md border border-cyan-200 bg-cyan-50 p-3">
          <p className="text-xs text-cyan-700">Queued</p>
          <p className="text-xl font-semibold text-cyan-900">{totals.queued}</p>
        </div>
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs text-emerald-700">Auto-Sorted</p>
          <p className="text-xl font-semibold text-emerald-900">{totals.automated}</p>
        </div>
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3">
          <p className="text-xs text-rose-700">Failures</p>
          <p className="text-xl font-semibold text-rose-900">{totals.failed}</p>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-600 mb-3">No campaigns yet. Create your first draft run to start tracking lifecycle data.</p>
          <button onClick={onStartNewCampaign} className="btn-secondary">Import Contacts</button>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map(({ campaign, analytics, schedulerSummary }) => (
            <div key={campaign.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{campaign.name}</h3>
                  <p className="text-xs text-gray-500">Updated {new Date(campaign.updatedAt).toLocaleString()}</p>
                </div>
                <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${statusBadge(campaign.status)}`}>
                  {campaign.status.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-3 text-xs">
                <div className="rounded border border-gray-200 px-2 py-1">Drafted: <span className="font-medium">{analytics.drafted}</span></div>
                <div className="rounded border border-gray-200 px-2 py-1">Queued: <span className="font-medium">{analytics.queued}</span></div>
                <div className="rounded border border-gray-200 px-2 py-1">Auto-Sorted: <span className="font-medium">{analytics.sent}</span></div>
                <div className="rounded border border-gray-200 px-2 py-1">Failed: <span className="font-medium">{analytics.failed}</span></div>
                <div className="rounded border border-gray-200 px-2 py-1">Scheduler Jobs: <span className="font-medium">{schedulerSummary.total}</span></div>
                <div className="rounded border border-gray-200 px-2 py-1">Success Rate: <span className="font-medium">{(analytics.sendRate * 100).toFixed(0)}%</span></div>
              </div>

              {schedulerSummary.total > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  Jobs: queued {schedulerSummary.queued}, running {schedulerSummary.running}, completed {schedulerSummary.completed}, failed {schedulerSummary.failed}, paused {schedulerSummary.paused}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
