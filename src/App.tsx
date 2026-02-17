import React, { useState, useEffect } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { ContactImport } from './components/ContactImport';
import { TemplateManager } from './components/TemplateManager';
import { AttachmentPicker } from './components/AttachmentPicker';
import { PreflightReview } from './components/PreflightReview';
import { BatchProgress } from './components/BatchProgress';
import { ErrorReview } from './components/ErrorReview';
import { RendererErrorOverlay } from './components/RendererErrorOverlay';
import { CampaignHome } from './components/CampaignHome';
import { projectStore } from './services/projectStore';
import { campaignStore, MessageStatus } from './services/campaignStore';
import { syncSchedulerResults } from './services/campaignSync';
import { motion } from 'framer-motion';
import { Sparkles, Gauge } from 'lucide-react';

interface Contact {
  id: string;
  name: string;
  email: string;
  [key: string]: string;
}

interface Template {
  id: string;
  name: string;
  content: string;
  variables: string[];
}

interface AppState {
  isAuthenticated: boolean;
  currentStep: 'auth' | 'home' | 'contacts' | 'template' | 'attachment' | 'preflight' | 'processing' | 'review';
  contacts: Contact[];
  template: Template | null;
  attachment: File | null;
  operationId: string | null;
  campaignId: string | null;
  results: ProcessingResult[];
}

interface ProcessingResult {
  contactId: string;
  name: string;
  email: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  messageId?: string;
  error?: string;
}

interface AuthenticatedUser {
  displayName: string;
  email: string;
}

function App() {
  const [appState, setAppState] = useState<AppState>({
    isAuthenticated: false,
    currentStep: 'auth',
    contacts: [],
    template: null,
    attachment: null,
    operationId: null,
    campaignId: null,
    results: [],
  });

  const [isLoading, setIsLoading] = useState(true);
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [authenticatedUser, setAuthenticatedUser] = useState<AuthenticatedUser | null>(null);
  const [tokenExpiry, setTokenExpiry] = useState<number | null>(null);
  const [restoredProjectNotice, setRestoredProjectNotice] = useState<string | null>(null);

  useEffect(() => {
    console.info('[App] Renderer booted. electronAPI available:', Boolean(window.electronAPI));
  }, []);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const message = event.error?.message || event.message || 'Renderer error';
      console.error('[RendererError]', message, event.error);
      setRendererError(message);
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = (event.reason && event.reason.message) || String(event.reason);
      console.error('[RendererUnhandledRejection]', reason, event.reason);
      setRendererError(reason);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  useEffect(() => {
    console.info('[App] Current step changed:', appState.currentStep);
    if (appState.currentStep === 'processing' && (!appState.template || !appState.attachment)) {
      console.warn('[App] Processing step reached without required template/attachment; redirecting back.');
      setAppState(prev => ({ ...prev, currentStep: 'attachment' }));
    }
  }, [appState.currentStep, appState.template, appState.attachment]);

  useEffect(() => {
    // Check if user is already authenticated
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      if (!window.electronAPI || !window.electronAPI.getTokens) {
        setIsLoading(false);
        return;
      }
      const tokens = await window.electronAPI.getTokens();
      if (tokens) {
        setTokenExpiry(tokens.expiresAt || null);
        setAppState(prev => ({ ...prev, isAuthenticated: true, currentStep: 'home' }));
        if (window.electronAPI.getUserProfile) {
          const profile = await window.electronAPI.getUserProfile();
          if (profile) {
            setAuthenticatedUser(profile);
          }
        }
        const recentProject = (await projectStore.listProjects())[0];
        if (recentProject && recentProject.contacts.length > 0) {
          setAppState(prev => ({
            ...prev,
            contacts: recentProject.contacts as Contact[],
          }));
          setRestoredProjectNotice(`Restored recent project "${recentProject.name}".`);
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthSuccess = () => {
    console.info('[App] Authentication successful, moving to campaign home');
    setAppState(prev => ({ ...prev, isAuthenticated: true, currentStep: 'home' }));
    setRendererError(null);
    if (window.electronAPI?.getUserProfile) {
      window.electronAPI.getUserProfile()
        .then(profile => {
          if (profile) {
            setAuthenticatedUser(profile);
          }
        })
        .catch(error => {
          console.error('Failed to load user profile after auth:', error);
        });
    }
    if (window.electronAPI?.getTokens) {
      window.electronAPI.getTokens()
        .then(tokens => {
          if (tokens?.expiresAt) {
            setTokenExpiry(tokens.expiresAt);
          }
        })
        .catch(() => {});
    }
  };

  const handleContactsImported = (contacts: Contact[]) => {
    console.info('[App] Imported contacts:', contacts.length);
    setAppState(prev => ({ ...prev, contacts, currentStep: 'template' }));
  };

  const startNewCampaign = () => {
    setAppState(prev => ({
      ...prev,
      currentStep: 'contacts',
      contacts: [],
      template: null,
      attachment: null,
      operationId: null,
      campaignId: null,
      results: [],
    }));
  };

  const handleTemplateSelected = (template: Template) => {
    console.info('[App] Template selected:', template.id);
    setAppState(prev => ({ ...prev, template, currentStep: 'attachment' }));
  };

  const handleAttachmentSelected = (file: File) => {
    console.info('[App] Attachment selected:', file.name, file.size, 'bytes');
    setAppState(prev => ({ ...prev, attachment: file, currentStep: 'preflight' }));
  };

  const handleProcessingComplete = (
    operationId: string,
    results: Array<{ contactId: string; status: 'pending' | 'processing' | 'completed' | 'failed'; messageId?: string; error?: string; }>
  ) => {
    console.info('[App] Processing completed. Operation ID:', operationId);
    const contactMap = new Map(appState.contacts.map(contact => [contact.id, contact]));
    const enrichedResults: ProcessingResult[] = results.map(result => {
      const contact = contactMap.get(result.contactId);
      return {
        contactId: result.contactId,
        name: contact?.name || 'Unknown',
        email: contact?.email || '',
        status: result.status,
        messageId: result.messageId,
        error: result.error
      };
    });

    const campaignId = `camp-${Date.now()}`;
    const toMessageStatus = (status: ProcessingResult['status']): MessageStatus => {
      if (status === 'completed') return 'drafted';
      if (status === 'failed') return 'failed';
      return 'drafted';
    };

    void (async () => {
      try {
        await campaignStore.createCampaign({
          id: campaignId,
          name: appState.template?.name
            ? `${appState.template.name} (${new Date().toLocaleString()})`
            : `Campaign ${new Date().toLocaleString()}`,
          templateId: appState.template?.id,
          attachmentName: appState.attachment?.name,
        });
        await campaignStore.upsertMessages(
          enrichedResults.map(item => ({
            id: `msg-${campaignId}-${item.contactId}`,
            campaignId,
            contactId: item.contactId,
            contactName: item.name,
            contactEmail: item.email,
            messageId: item.messageId,
            status: toMessageStatus(item.status),
            draftCreatedAt: item.status === 'completed' ? new Date().toISOString() : undefined,
            error: item.error,
            updatedAt: new Date().toISOString(),
          }))
        );
        await campaignStore.createEvents(
          enrichedResults.map(item => ({
            campaignId,
            messageId: item.messageId,
            contactId: item.contactId,
            type: item.status === 'completed' ? 'draft_created' : 'send_failed',
            detail: item.status === 'completed' ? 'Draft created in Outlook.' : (item.error || 'Draft creation failed'),
          }))
        );
        const hasFailures = enrichedResults.some(item => item.status === 'failed');
        await campaignStore.updateCampaignStatus(campaignId, hasFailures ? 'failed' : 'drafted');
      } catch (error) {
        console.error('Failed to persist campaign records:', error);
      }
    })();

    setAppState(prev => ({
      ...prev,
      operationId,
      campaignId,
      results: enrichedResults,
      currentStep: 'review'
    }));
  };

  const resetApp = () => {
    setAuthenticatedUser(null);
    setAppState({
      isAuthenticated: false,
      currentStep: 'auth',
      contacts: [],
      template: null,
      attachment: null,
      operationId: null,
      campaignId: null,
      results: [],
    });
    setTokenExpiry(null);
    setRestoredProjectNotice(null);
  };

  const backToCampaignHome = () => {
    setAppState(prev => ({
      ...prev,
      currentStep: 'home',
      contacts: [],
      template: null,
      attachment: null,
      operationId: null,
      campaignId: null,
      results: [],
    }));
  };

  useEffect(() => {
    if (!appState.isAuthenticated) return;
    const snapshot = {
      id: 'active-project',
      name: 'Current Drafting Session',
      contacts: appState.contacts,
      templateId: appState.template?.id,
      attachmentName: appState.attachment?.name,
      updatedAt: new Date().toISOString(),
    };
    projectStore.saveProject(snapshot).catch(error => {
      console.error('Failed to autosave project snapshot:', error);
    });
  }, [appState.isAuthenticated, appState.contacts, appState.template, appState.attachment]);

  useEffect(() => {
    if (!appState.isAuthenticated) return;
    syncSchedulerResults().catch(error => {
      console.error('Initial scheduler sync failed:', error);
    });
    const timer = window.setInterval(() => {
      syncSchedulerResults().catch(error => {
        console.error('Periodic scheduler sync failed:', error);
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [appState.isAuthenticated]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Email Drafter...</p>
        </div>
      </div>
    );
  }

  const rendererErrorOverlay = rendererError ? (
    <RendererErrorOverlay
      message={rendererError}
      onRetry={() => {
        setRendererError(null);
        window.location.reload();
      }}
    />
  ) : null;

  if (!appState.isAuthenticated) {
    return (
      <div className="h-full relative">
        {rendererErrorOverlay}
        <AuthScreen onAuthSuccess={handleAuthSuccess} />
      </div>
    );
  }

  return (
    <div className="h-full tunnel-shell relative">
      {rendererErrorOverlay}
      <div className="tunnel-content max-w-6xl mx-auto p-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="mb-8"
        >
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="hyperloop-chip flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> CU Hyperloop</span>
            <span className="hyperloop-chip flex items-center gap-1"><Gauge className="h-3.5 w-3.5" /> Draft Control</span>
          </div>
          <h1 className="text-4xl font-bold text-slate-100 tracking-tight mb-2">Tunnel Boring Draft Studio</h1>
          <p className="text-slate-300">Create high-throughput Outlook drafts with in-app contact cleanup, template versioning, and preflight validation.</p>
          {authenticatedUser?.email && (
            <p className="text-sm text-slate-300 mt-2">
              Signed in as {authenticatedUser.displayName || authenticatedUser.email} ({authenticatedUser.email})
            </p>
          )}
          {tokenExpiry && (
            <p className="text-xs text-slate-400 mt-1">
              Session token expires at {new Date(tokenExpiry).toLocaleTimeString()}
            </p>
          )}
          {restoredProjectNotice && (
            <p className="text-xs text-cyan-300 mt-1">{restoredProjectNotice}</p>
          )}
          <div className="mt-3">
            <button
              className="btn-secondary"
              onClick={() => {
                if (window.electronAPI?.logout) {
                  window.electronAPI.logout().finally(() => resetApp());
                } else {
                  resetApp();
                }
              }}
            >
              Sign Out
            </button>
          </div>
        </motion.div>

        {/* Progress Steps */}
        {appState.currentStep !== 'home' && (
        <div className="mb-8">
          <div className="flex items-center justify-between gap-2">
            {[
              { key: 'contacts', label: 'Import Contacts', icon: '👥' },
              { key: 'template', label: 'Select Template', icon: '📝' },
              { key: 'attachment', label: 'Choose Attachment', icon: '📎' },
              { key: 'preflight', label: 'Preflight Review', icon: '🧪' },
              { key: 'processing', label: 'Create Drafts', icon: '⚡' },
              { key: 'review', label: 'Review Results', icon: '✅' },
            ].map((step, index) => (
              <div key={step.key} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  appState.currentStep === step.key 
                    ? 'border-cyan-300 bg-cyan-500/20 text-cyan-200 shadow-neon' 
                    : appState.currentStep === 'review' || 
                      (step.key === 'contacts' && appState.contacts.length > 0) ||
                      (step.key === 'template' && appState.template) ||
                      (step.key === 'attachment' && appState.attachment) ||
                      (step.key === 'processing' && appState.operationId)
                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                    : 'border-slate-600 bg-slate-900/60 text-slate-400'
                }`}>
                  <span className="text-sm font-medium">{index + 1}</span>
                </div>
                <div className="ml-3">
                  <p className={`text-sm font-medium ${
                    appState.currentStep === step.key ? 'text-cyan-200' : 'text-slate-400'
                  }`}>
                    {step.label}
                  </p>
                </div>
                {index < 5 && (
                  <div className={`flex-1 h-0.5 mx-4 ${
                    appState.currentStep === 'review' || 
                    (step.key === 'contacts' && appState.contacts.length > 0) ||
                    (step.key === 'template' && appState.template) ||
                    (step.key === 'attachment' && appState.attachment) ||
                    (step.key === 'preflight' && appState.attachment) ||
                    (step.key === 'processing' && appState.operationId)
                      ? 'bg-emerald-400/80' 
                      : 'bg-slate-700/70'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Main Content */}
        <div className="card">
          {appState.currentStep === 'home' && (
            <CampaignHome onStartNewCampaign={startNewCampaign} />
          )}

          {appState.currentStep === 'contacts' && (
            <ContactImport 
              onContactsImported={handleContactsImported}
              onBack={() => {
                backToCampaignHome();
              }}
            />
          )}
          
          {appState.currentStep === 'template' && (
            <TemplateManager 
              contacts={appState.contacts}
              onTemplateSelected={handleTemplateSelected}
              onBack={() => setAppState(prev => ({ ...prev, currentStep: 'contacts' }))}
            />
          )}
          
          {appState.currentStep === 'attachment' && (
            <AttachmentPicker 
              onAttachmentSelected={handleAttachmentSelected}
              onBack={() => setAppState(prev => ({ ...prev, currentStep: 'template' }))}
            />
          )}

          {appState.currentStep === 'preflight' && (
            <PreflightReview
              contacts={appState.contacts}
              template={appState.template!}
              attachment={appState.attachment}
              onBack={() => setAppState(prev => ({ ...prev, currentStep: 'attachment' }))}
              onContinue={() => setAppState(prev => ({ ...prev, currentStep: 'processing' }))}
            />
          )}
          
          {appState.currentStep === 'processing' && (
            <BatchProgress 
              contacts={appState.contacts}
              template={appState.template!}
              attachment={appState.attachment!}
              onComplete={handleProcessingComplete}
              onBack={() => setAppState(prev => ({ ...prev, currentStep: 'attachment' }))}
            />
          )}
          
          {appState.currentStep === 'review' && (
            <ErrorReview 
              operationId={appState.operationId!}
              campaignId={appState.campaignId || undefined}
              results={appState.results}
              onReviewFailedContacts={() => {
                setRestoredProjectNotice('Moved back to contacts so you can fix failed rows.');
                setAppState(prev => ({ ...prev, currentStep: 'contacts' }));
              }}
              onStartOver={backToCampaignHome}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
