import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { teamStore, TeamMember } from "../services/teamStore";
import { Plus, Trash2, Edit3, X, Save, Users } from "lucide-react";

interface MemberManagerProps {
    onBack: () => void;
}

export const MemberManager: React.FC<MemberManagerProps> = ({ onBack }) => {
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<TeamMember>>({});
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        loadMembers();
    }, []);

    const loadMembers = async () => {
        const list = await teamStore.listMembers();
        setMembers(list);
    };

    const handleSave = async () => {
        if (!editForm.name) return; // Basic validation
        await teamStore.saveMember({
            id: isEditing || crypto.randomUUID(),
            name: editForm.name || "",
            role: editForm.role || "",
            major: editForm.major || "",
            phone: editForm.phone || "",
            email: editForm.email || "",
            ...(isEditing ? { createdAt: editForm.createdAt, updatedAt: editForm.updatedAt } : {})
        });
        setEditForm({});
        setIsEditing(null);
        setIsCreating(false);
        loadMembers();
    };

    const handleDelete = async (id: string) => {
        await teamStore.deleteMember(id);
        loadMembers();
    };

    const startEdit = (m: TeamMember) => {
        setIsEditing(m.id);
        setEditForm(m);
        setIsCreating(false);
    };

    const startCreate = () => {
        setIsCreating(true);
        setIsEditing(null);
        setEditForm({ name: "", role: "", major: "", phone: "", email: "" });
    };

    const cancelEdit = () => {
        setIsEditing(null);
        setIsCreating(false);
        setEditForm({});
    };

    return (
        <div className="w-full flex-1 p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
                            <button onClick={onBack} className="text-slate-400 hover:text-slate-200 transition-colors mr-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-left"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
                            </button>
                            <Users className="w-6 h-6 text-yellow-500" />
                            Team Profiles
                        </h2>
                        <p className="text-slate-400 text-sm mt-1 ml-10">
                            Configure sender profiles. If the CSV matching field has a "Member" value exactly matching the "Name" here, the variables will map automatically.
                        </p>
                    </div>
                    {!isCreating && !isEditing && (
                        <button onClick={startCreate} className="btn-primary flex items-center gap-2">
                            <Plus className="w-4 h-4" />
                            Add Sender
                        </button>
                    )}
                </div>

                <div className="space-y-4">
                    <AnimatePresence>
                        {(isCreating || isEditing) && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="card p-6"
                            >
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">
                                            Identifier Name (Matches 'Member' col) *
                                        </label>
                                        <input
                                            className="input-field"
                                            placeholder="e.g. Matis"
                                            value={editForm.name || ""}
                                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">
                                            Email Address
                                        </label>
                                        <input
                                            className="input-field"
                                            placeholder="e.g. matis@colorado.edu"
                                            value={editForm.email || ""}
                                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">
                                            Role
                                        </label>
                                        <input
                                            className="input-field"
                                            placeholder="e.g. Business Development Lead"
                                            value={editForm.role || ""}
                                            onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">
                                            Major / Department
                                        </label>
                                        <input
                                            className="input-field"
                                            placeholder="e.g. Business Administration"
                                            value={editForm.major || ""}
                                            onChange={(e) => setEditForm({ ...editForm, major: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">
                                            Phone Number
                                        </label>
                                        <input
                                            className="input-field"
                                            placeholder="e.g. 555-0100"
                                            value={editForm.phone || ""}
                                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 justify-end mt-6">
                                    <button onClick={cancelEdit} className="btn-secondary flex items-center gap-2">
                                        <X className="w-4 h-4" /> Cancel
                                    </button>
                                    <button onClick={handleSave} className="btn-primary flex items-center gap-2" disabled={!editForm.name}>
                                        <Save className="w-4 h-4" /> Save Profile
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {members.map((m) => (
                        !((isEditing === m.id) || (isCreating && isEditing === null)) && (
                            <motion.div
                                key={m.id}
                                layout
                                className="card p-5 flex items-center justify-between hover:border-slate-600 transition-colors"
                            >
                                <div>
                                    <h3 className="text-lg font-medium text-slate-100">{m.name}</h3>
                                    <div className="text-sm text-slate-400 mt-1 flex gap-4">
                                        <span>{m.role || "No role"}</span>
                                        <span>•</span>
                                        <span>{m.email || "No email"}</span>
                                        <span>•</span>
                                        <span>{m.phone || "No phone"}</span>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => startEdit(m)}
                                        className="p-2 text-slate-400 hover:text-yellow-500 rounded-lg transition-colors"
                                    >
                                        <Edit3 className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(m.id)}
                                        className="p-2 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </motion.div>
                        )
                    ))}

                    {members.length === 0 && !isCreating && (
                        <div className="text-center py-12 text-slate-400">
                            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>No team profiles configured yet.</p>
                            <p className="text-sm mt-2">Add a sender profile so their signature can be injected automatically.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
