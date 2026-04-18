import { useEffect } from "react";
import { Command } from "cmdk";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  Plus,
  Users,
  Eye,
  LogOut,
  Play,
  Building2,
  FileText,
  UserCircle,
  Wand2,
} from "lucide-react";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (step: string) => void;
  onCreateCampaign: () => void;
  onSignOut: () => void;
  activeCampaignId: string | null;
  onRunCampaign?: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onCreateCampaign,
  onSignOut,
  activeCampaignId,
  onRunCampaign,
}: CommandPaletteProps) {
  // Cmd+K / Ctrl+K toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  const runAction = (fn: () => void) => {
    fn();
    onOpenChange(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="palette-backdrop"
          className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => onOpenChange(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg"
          >
            <Command
              className="rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden"
              label="Command palette"
            >
              <div className="flex items-center border-b border-slate-700 px-4">
                <Wand2 className="h-4 w-4 text-slate-500 mr-3 shrink-0" />
                <Command.Input
                  placeholder="Type a command or search..."
                  className="w-full py-3.5 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none"
                />
                <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs text-slate-500 bg-slate-800 rounded border border-slate-700 ml-2 shrink-0">
                  esc
                </kbd>
              </div>

              <Command.List className="max-h-72 overflow-y-auto p-2">
                <Command.Empty className="py-6 text-center text-sm text-slate-500">
                  No results found.
                </Command.Empty>

                <Command.Group
                  heading="Navigation"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-slate-500"
                >
                  <PaletteItem
                    icon={<Home />}
                    label="Go to Campaigns"
                    onSelect={() => runAction(() => onNavigate("home"))}
                  />
                  <PaletteItem
                    icon={<UserCircle />}
                    label="Manage Sender Profiles"
                    onSelect={() => runAction(() => onNavigate("team"))}
                  />
                  <PaletteItem
                    icon={<Eye />}
                    label="Open Tunnel Playground"
                    shortcut="visual"
                    onSelect={() => runAction(() => onNavigate("tunnel"))}
                  />
                </Command.Group>

                <Command.Group
                  heading="Actions"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-slate-500 mt-1"
                >
                  <PaletteItem
                    icon={<Plus />}
                    label="Create New Campaign"
                    onSelect={() => runAction(onCreateCampaign)}
                  />
                  <PaletteItem
                    icon={<LogOut />}
                    label="Sign Out"
                    onSelect={() => runAction(onSignOut)}
                  />
                </Command.Group>

                {activeCampaignId && (
                  <Command.Group
                    heading="Current Campaign"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-slate-500 mt-1"
                  >
                    <PaletteItem
                      icon={<Building2 />}
                      label="Generate Companies"
                      onSelect={() => runAction(() => onNavigate("campaign-leadgen"))}
                    />
                    <PaletteItem
                      icon={<Users />}
                      label="Import Contacts"
                      onSelect={() => runAction(() => onNavigate("campaign-contacts"))}
                    />
                    <PaletteItem
                      icon={<FileText />}
                      label="Select Template"
                      onSelect={() => runAction(() => onNavigate("campaign-template"))}
                    />
                    {onRunCampaign && (
                      <PaletteItem
                        icon={<Play />}
                        label="Run Campaign"
                        onSelect={() => runAction(onRunCampaign)}
                      />
                    )}
                  </Command.Group>
                )}
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PaletteItem({
  icon,
  label,
  shortcut,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-300 cursor-pointer transition-colors data-[selected=true]:bg-yellow-500/10 data-[selected=true]:text-yellow-400 hover:bg-slate-800"
    >
      <span className="h-4 w-4 shrink-0 [&>svg]:h-4 [&>svg]:w-4 opacity-60">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-xs text-slate-600">{shortcut}</span>}
    </Command.Item>
  );
}
