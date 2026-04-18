import { useState, useEffect, useCallback } from "react";
import { AuthScreen } from "./components/AuthScreen";
import { replyPoller } from "./services/replyPoller";
import { RepliesPanel } from "./components/RepliesPanel";
import { InsightsPanel } from "./components/InsightsPanel";
import { ContactImport } from "./components/ContactImport";
import { TemplateManager } from "./components/TemplateManager";
import { AttachmentPicker } from "./components/AttachmentPicker";
import { PreflightReview } from "./components/PreflightReview";
import { BatchProgress } from "./components/BatchProgress";
import { ErrorReview } from "./components/ErrorReview";
import { RendererErrorOverlay } from "./components/RendererErrorOverlay";
import { CompanyGenerator } from "./components/CompanyGenerator";
import { CampaignDetail } from "./components/CampaignDetail";
import { SplashScreen } from "./components/SplashScreen";
import { TunnelPlayground } from "./components/TunnelPlayground";
import { CommandPalette } from "./components/CommandPalette";
import { seedTemplates } from "./utils/seedTemplates";
import { CampaignHome } from "./components/CampaignHome";
import { MemberManager } from "./components/MemberManager";
import { projectStore } from "./services/projectStore";
import { campaignStore } from "./services/campaignStore";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export interface Contact {
  id: string;
  name: string;
  email: string;
  templateId?: string | null;
  [key: string]: string | null | undefined;
}

interface Template {
  id: string;
  name: string;
  subjects?: string[];
  content: string;
  variables: string[];
}

interface AppState {
  isAuthenticated: boolean;
  currentStep:
  | "auth"
  | "home"
  | "contacts"
  | "leadgen"
  | "team"
  | "template"
  | "attachment"
  | "preflight"
  | "processing"
  | "review"
  | "campaign-detail"
  | "campaign-leadgen"
  | "campaign-contacts"
  | "campaign-template"
  | "tunnel";
  contacts: Contact[];
  template: Template | null;
  attachment: File | null;
  operationId: string | null;
  results: ProcessingResult[];
  templates: Template[];
  activeCampaignId: string | null;
}

interface ProcessingResult {
  contactId: string;
  name: string;
  email: string;
  status: "pending" | "processing" | "drafted" | "attaching" | "completed" | "failed";
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
    currentStep: "auth",
    contacts: [],
    template: null,
    attachment: null,
    operationId: null,
    results: [],
    templates: [],
    activeCampaignId: null,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [authenticatedUser, setAuthenticatedUser] =
    useState<AuthenticatedUser | null>(null);
  const [tokenExpiry, setTokenExpiry] = useState<number | null>(null);
  const [restoredProjectNotice, setRestoredProjectNotice] = useState<
    string | null
  >(null);

  useEffect(() => {
    console.info(
      "[App] Renderer booted. electronAPI available:",
      Boolean(window.electronAPI),
    );
    seedTemplates().catch(console.error);
  }, []);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const message = event.error?.message || event.message || "Renderer error";
      console.error("[RendererError]", message, event.error);
      setRendererError(message);
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason =
        (event.reason && event.reason.message) || String(event.reason);
      console.error("[RendererUnhandledRejection]", reason, event.reason);
      setRendererError(reason);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  useEffect(() => {
    console.info("[App] Current step changed:", appState.currentStep);
    const allHaveTemplates = appState.contacts.length > 0 && appState.contacts.every(c => !!c.templateId);

    if (
      appState.currentStep === "processing" &&
      (!appState.attachment || (!appState.template && !allHaveTemplates))
    ) {
      console.warn(
        "[App] Processing step reached without required template/attachment; redirecting back.",
      );
      setAppState((prev) => ({ ...prev, currentStep: "attachment" }));
    }
  }, [appState.currentStep, appState.template, appState.attachment, appState.contacts]);

  useEffect(() => {
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
        setAppState((prev) => ({
          ...prev,
          isAuthenticated: true,
          currentStep: "home",
        }));
        if (window.electronAPI.getUserProfile) {
          const profile = await window.electronAPI.getUserProfile();
          if (profile) {
            setAuthenticatedUser(profile);
          }
        }
        const savedTemplates = await projectStore.listTemplates();
        setAppState((prev) => ({
          ...prev,
          templates: savedTemplates as unknown as Template[],
        }));
      }
    } catch (error) {
      console.error("Auth check failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthSuccess = () => {
    console.info("[App] Authentication successful, moving to campaign home");
    setAppState((prev) => ({
      ...prev,
      isAuthenticated: true,
      currentStep: "home",
    }));
    setRendererError(null);
    if (window.electronAPI?.getUserProfile) {
      window.electronAPI
        .getUserProfile()
        .then((profile) => {
          if (profile) {
            setAuthenticatedUser(profile);
          }
        })
        .catch((error) => {
          console.error("Failed to load user profile after auth:", error);
        });
    }
    if (window.electronAPI?.getTokens) {
      window.electronAPI
        .getTokens()
        .then((tokens) => {
          if (tokens?.expiresAt) {
            setTokenExpiry(tokens.expiresAt);
          }
        })
        .catch(() => { });
    }
  };

  const handleContactsImported = async (contacts: Contact[]) => {
    console.info("[App] Imported contacts:", contacts.length);

    // If in campaign context, save to campaign and go back to detail
    if (appState.activeCampaignId && appState.currentStep === "campaign-contacts") {
      campaignStore.setContacts(appState.activeCampaignId, contacts);
      setAppState(prev => ({ ...prev, currentStep: "campaign-detail" }));
      return;
    }

    const allHaveTemplates = contacts.length > 0 && contacts.every((c) => !!c.templateId);

    if (allHaveTemplates) {
      console.info("[App] All valid contacts have templates assigned. Bypassing Template step.");
      const savedTemplates = await projectStore.listTemplates();
      setAppState((prev) => ({
        ...prev,
        contacts,
        templates: savedTemplates as unknown as Template[],
        currentStep: "attachment",
      }));
    } else {
      setAppState((prev) => ({ ...prev, contacts, currentStep: "template" }));
    }
  };

  const startNewCampaign = () => {
    setAppState((prev) => ({
      ...prev,
      currentStep: "contacts",
      contacts: [],
      template: null,
      attachment: null,
      operationId: null,
      results: [],
      activeCampaignId: null,
    }));
  };

  const handleTemplateSelected = async (template: Template) => {
    console.info("[App] Template selected:", template.id);

    // If in campaign context, save to campaign and go back to detail
    if (appState.activeCampaignId && appState.currentStep === "campaign-template") {
      campaignStore.setTemplateId(appState.activeCampaignId, template.id);
      setAppState(prev => ({ ...prev, currentStep: "campaign-detail" }));
      return;
    }

    const savedTemplates = await projectStore.listTemplates();
    setAppState((prev) => ({
      ...prev,
      template,
      templates: savedTemplates as unknown as Template[],
      currentStep: "attachment",
    }));
  };

  const handleAttachmentSelected = (file: File) => {
    console.info("[App] Attachment selected:", file.name, file.size, "bytes");
    setAppState((prev) => ({
      ...prev,
      attachment: file,
      currentStep: "preflight",
    }));
  };

  const handleProcessingComplete = (
    operationId: string,
    results: Array<{
      contactId: string;
      status: "pending" | "processing" | "drafted" | "attaching" | "completed" | "failed";
      messageId?: string;
      error?: string;
    }>,
  ) => {
    console.info("[App] Processing completed. Operation ID:", operationId);
    const contactMap = new Map(
      appState.contacts.map((contact) => [contact.id, contact]),
    );
    const hadAttachment = appState.attachment !== null;
    const enrichedResults: ProcessingResult[] = results.map((result) => {
      const contact = contactMap.get(result.contactId);
      // If attachment was expected but contact is still "drafted" or "attaching",
      // mark as failed - the attachment never completed
      let finalStatus = result.status;
      let finalError = result.error;
      if (hadAttachment && (result.status === "drafted" || result.status === "attaching")) {
        finalStatus = "failed";
        finalError = "Attachment upload did not complete";
      }
      return {
        contactId: result.contactId,
        name: contact?.name || "Unknown",
        email: contact?.email || "",
        status: finalStatus === "completed" || finalStatus === "failed" ? finalStatus : "failed",
        messageId: result.messageId,
        error: finalError,
      };
    });

    // If in campaign context, save run
    if (appState.activeCampaignId) {
      const successCount = enrichedResults.filter(r => r.status === 'completed').length;
      const failCount = enrichedResults.filter(r => r.status === 'failed').length;
      campaignStore.addRun(appState.activeCampaignId, {
        id: operationId,
        timestamp: new Date().toISOString(),
        templateId: appState.template?.id || null,
        attachmentName: appState.attachment?.name || null,
        contactCount: enrichedResults.length,
        successCount,
        failCount,
      });
    }

    setAppState((prev) => ({
      ...prev,
      operationId,
      results: enrichedResults,
      currentStep: "review",
    }));
  };

  const resetApp = () => {
    setAuthenticatedUser(null);
    setAppState({
      isAuthenticated: false,
      currentStep: "auth",
      contacts: [],
      template: null,
      attachment: null,
      operationId: null,
      results: [],
      templates: [],
      activeCampaignId: null,
    });
    setTokenExpiry(null);
    setRestoredProjectNotice(null);
  };

  const backToCampaignHome = () => {
    setAppState((prev) => ({
      ...prev,
      currentStep: "home",
      contacts: [],
      template: null,
      attachment: null,
      operationId: null,
      results: [],
      activeCampaignId: null,
    }));
  };

  const backToCampaignDetail = () => {
    setAppState(prev => ({
      ...prev,
      currentStep: "campaign-detail",
      contacts: [],
      template: null,
      attachment: null,
      operationId: null,
      results: [],
    }));
  };

  const openCampaign = (id: string) => {
    setAppState(prev => ({
      ...prev,
      activeCampaignId: id,
      currentStep: "campaign-detail",
    }));
  };

  const runCampaign = async () => {
    if (!appState.activeCampaignId) return;
    const campaign = campaignStore.getCampaign(appState.activeCampaignId);
    if (!campaign) return;

    const savedTemplates = await projectStore.listTemplates();
    const template = savedTemplates.find(t => t.id === campaign.templateId);

    setAppState(prev => ({
      ...prev,
      contacts: campaign.contacts,
      template: template ? {
        id: template.id,
        name: template.name,
        subjects: template.subjects,
        content: template.content,
        variables: template.variables,
      } : null,
      templates: savedTemplates as unknown as Template[],
      currentStep: "attachment",
    }));
  };

  const navigateFromPalette = useCallback((step: string) => {
    setAppState(prev => ({ ...prev, currentStep: step as AppState['currentStep'] }));
  }, []);

  useEffect(() => {
    if (!appState.isAuthenticated) return;
    if (appState.activeCampaignId) return; // Don't autosave when in campaign mode
    const snapshot = {
      id: "active-project",
      name: "Current Drafting Session",
      contacts: appState.contacts,
      templateId: appState.template?.id,
      attachmentName: appState.attachment?.name,
      updatedAt: new Date().toISOString(),
    };
    projectStore.saveProject(snapshot).catch((error) => {
      console.error("Failed to autosave project snapshot:", error);
    });
  }, [
    appState.isAuthenticated,
    appState.contacts,
    appState.template,
    appState.attachment,
    appState.activeCampaignId,
  ]);

  useEffect(() => {
    if (!appState.isAuthenticated) {
      replyPoller.stop();
      return;
    }
    replyPoller.start();
    return () => replyPoller.stop();
  }, [appState.isAuthenticated]);

  // Splash screen on boot
  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

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

  // Determine if we're in the linear flow (non-campaign steps that show the stepper)
  const linearFlowSteps = ["contacts", "template", "attachment", "preflight", "processing", "review"];
  const showStepper = linearFlowSteps.includes(appState.currentStep) ||
    (appState.activeCampaignId && ["attachment", "preflight", "processing", "review"].includes(appState.currentStep));

  // Tunnel playground renders full-screen, outside normal layout
  if (appState.currentStep === "tunnel") {
    return <TunnelPlayground onBack={backToCampaignHome} />;
  }

  return (
    <div className="h-full bg-slate-900 relative text-slate-100">
      {rendererErrorOverlay}

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onNavigate={navigateFromPalette}
        onCreateCampaign={() => {
          setAppState(prev => ({ ...prev, currentStep: 'home', activeCampaignId: null }));
          // CampaignHome will show create form
        }}
        onSignOut={() => {
          if (window.electronAPI?.logout) {
            window.electronAPI.logout().finally(() => resetApp());
          } else {
            resetApp();
          }
        }}
        activeCampaignId={appState.activeCampaignId}
        onRunCampaign={appState.activeCampaignId ? runCampaign : undefined}
      />

      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="mb-8"
        >
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="bg-yellow-500/10 text-yellow-500 text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-yellow-500/20">
              <Sparkles className="h-3.5 w-3.5" /> Email Drafter Pro
            </span>
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600 transition-all text-xs text-slate-400 hover:text-slate-200"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              Quick actions
              <kbd className="ml-1 px-1.5 py-0.5 rounded bg-slate-700 border border-slate-600 text-[10px] font-mono text-slate-400">
                {navigator.platform?.includes('Mac') ? '\u2318' : 'Ctrl+'}K
              </kbd>
            </button>
            <InsightsPanel />
            <RepliesPanel />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">
            Campaign Studio
          </h1>
          <p className="text-slate-400">
            Create high-throughput Outlook drafts with in-app contact cleanup,
            template versioning, and preflight validation.
          </p>
          {authenticatedUser?.email && (
            <p className="text-sm text-slate-400 mt-2">
              Signed in as{" "}
              <span className="font-medium text-slate-200">
                {authenticatedUser.displayName || authenticatedUser.email}
              </span>{" "}
              ({authenticatedUser.email})
            </p>
          )}
          {tokenExpiry && (
            <p className="text-xs text-slate-500 mt-1">
              Session token expires at{" "}
              {new Date(tokenExpiry).toLocaleTimeString()}
            </p>
          )}
          {restoredProjectNotice && (
            <p className="text-sm font-medium text-yellow-400 mt-2 bg-yellow-500/10 border border-yellow-500/20 px-3 py-1.5 rounded-md inline-block">
              {restoredProjectNotice}
            </p>
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
        {showStepper && (
          <div className="mb-8">
            <div className="flex items-center justify-between gap-2">
              {[
                { key: "contacts", label: "Import Contacts", icon: "👥" },
                { key: "template", label: "Select Template", icon: "📝" },
                { key: "attachment", label: "Choose Attachment", icon: "📎" },
                { key: "preflight", label: "Preflight Review", icon: "🧪" },
                { key: "processing", label: "Create Drafts", icon: "⚡" },
                { key: "review", label: "Review Results", icon: "✅" },
              ].map((step, index) => (
                <div key={step.key} className="flex items-center">
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${appState.currentStep === step.key
                      ? "border-yellow-500 bg-yellow-500/10 text-yellow-500"
                      : appState.currentStep === "review" ||
                        (step.key === "contacts" &&
                          appState.contacts.length > 0) ||
                        (step.key === "template" && (appState.template || (appState.contacts.length > 0 && appState.contacts.every(c => !!c.templateId)))) ||
                        (step.key === "attachment" &&
                          appState.attachment) ||
                        (step.key === "processing" && appState.operationId)
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                        : "border-slate-700 bg-slate-800 text-slate-500"
                      }`}
                  >
                    <span className="text-sm font-medium">{index + 1}</span>
                  </div>
                  <div className="ml-3">
                    <p
                      className={`text-sm font-medium ${appState.currentStep === step.key
                        ? "text-yellow-500"
                        : "text-slate-500"
                        }`}
                    >
                      {step.label}
                    </p>
                  </div>
                  {index < 5 && (
                    <div
                      className={`flex-1 h-0.5 mx-4 ${appState.currentStep === "review" ||
                        (step.key === "contacts" &&
                          appState.contacts.length > 0) ||
                        (step.key === "template" && (appState.template || (appState.contacts.length > 0 && appState.contacts.every(c => !!c.templateId)))) ||
                        (step.key === "attachment" && appState.attachment) ||
                        (step.key === "preflight" && appState.attachment) ||
                        (step.key === "processing" && appState.operationId)
                        ? "bg-emerald-500"
                        : "bg-slate-700"
                        }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="card overflow-y-auto max-h-[calc(100vh-200px)]">
          {appState.currentStep === "home" && (
            <CampaignHome
              onOpenCampaign={openCampaign}
              onManageMembers={() => setAppState(prev => ({ ...prev, currentStep: 'team' }))}
            />
          )}

          {appState.currentStep === "team" && (
            <MemberManager onBack={() => setAppState(prev => ({ ...prev, currentStep: 'home' }))} />
          )}

          {appState.currentStep === "campaign-detail" && appState.activeCampaignId && (
            <CampaignDetail
              campaignId={appState.activeCampaignId}
              onBack={backToCampaignHome}
              onOpenLeadGen={() => setAppState(prev => ({ ...prev, currentStep: 'campaign-leadgen' }))}
              onOpenContacts={() => setAppState(prev => ({ ...prev, currentStep: 'campaign-contacts' }))}
              onOpenTemplate={() => setAppState(prev => ({ ...prev, currentStep: 'campaign-template' }))}
              onRunCampaign={runCampaign}
            />
          )}

          {appState.currentStep === "campaign-leadgen" && appState.activeCampaignId && (
            <CompanyGenerator
              campaignId={appState.activeCampaignId}
              campaignDescription={campaignStore.getCampaign(appState.activeCampaignId)?.description}
              existingCompanies={campaignStore.getCampaign(appState.activeCampaignId)?.companies || []}
              onLeadsImported={handleContactsImported}
              onSaveToCampaign={(companies) => {
                campaignStore.addCompanies(appState.activeCampaignId!, companies);
                setAppState(prev => ({ ...prev, currentStep: 'campaign-detail' }));
              }}
              onBack={backToCampaignDetail}
            />
          )}

          {appState.currentStep === "leadgen" && (
            <CompanyGenerator
              onLeadsImported={handleContactsImported}
              onBack={() => setAppState(prev => ({ ...prev, currentStep: 'home' }))}
            />
          )}

          {appState.currentStep === "campaign-contacts" && appState.activeCampaignId && (
            <ContactImport
              campaignId={appState.activeCampaignId}
              onContactsImported={handleContactsImported}
              onBack={backToCampaignDetail}
            />
          )}

          {appState.currentStep === "contacts" && (
            <ContactImport
              onContactsImported={handleContactsImported}
              onBack={() => {
                backToCampaignHome();
              }}
            />
          )}

          {appState.currentStep === "campaign-template" && appState.activeCampaignId && (
            <TemplateManager
              contacts={campaignStore.getCampaign(appState.activeCampaignId)?.contacts || []}
              onTemplateSelected={handleTemplateSelected}
              onBack={backToCampaignDetail}
            />
          )}

          {appState.currentStep === "template" && (
            <TemplateManager
              contacts={appState.contacts}
              onTemplateSelected={(template) =>
                handleTemplateSelected(template)
              }
              onBack={() => {
                setAppState((prev) => ({ ...prev, currentStep: "contacts" }));
              }}
            />
          )}

          {appState.currentStep === "attachment" && (
            <AttachmentPicker
              onAttachmentSelected={handleAttachmentSelected}
              onBack={() =>
                setAppState((prev) => ({ ...prev, currentStep: "template" }))
              }
            />
          )}

          {appState.currentStep === "preflight" && (
            <PreflightReview
              contacts={appState.contacts}
              templates={appState.templates}
              defaultTemplateId={appState.template?.id || null}
              attachment={appState.attachment}
              onBack={() =>
                setAppState((prev) => ({ ...prev, currentStep: "attachment" }))
              }
              onContinue={() =>
                setAppState((prev) => ({ ...prev, currentStep: "processing" }))
              }
            />
          )}

          {appState.currentStep === "processing" && (
            <BatchProgress
              contacts={appState.contacts}
              templates={appState.templates}
              defaultTemplateId={appState.template?.id || null}
              attachment={appState.attachment!}
              onComplete={handleProcessingComplete}
              onBack={() =>
                setAppState((prev) => ({ ...prev, currentStep: "attachment" }))
              }
            />
          )}

          {appState.currentStep === "review" && (
            <ErrorReview
              operationId={appState.operationId!}
              results={appState.results as any}
              onReviewFailedContacts={() => {
                setRestoredProjectNotice(
                  "Moved back to contacts so you can fix failed rows.",
                );
                setAppState((prev) => ({ ...prev, currentStep: "contacts" }));
              }}
              onStartOver={appState.activeCampaignId ? backToCampaignDetail : backToCampaignHome}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
