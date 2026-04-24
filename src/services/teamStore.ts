export interface TeamMember {
  id: string;
  /**
   * Full display name that renders in `{{Sender Name}}` / the signature
   * block. Can contain first + last name (e.g. "Owen Wojciak").
   */
  name: string;
  /**
   * Short identifier matched against the CSV `Member` column. Typically the
   * first name (e.g. "Owen") so CSVs stay terse. If left blank, the full
   * `name` is used for matching (backward compatible with old profiles).
   */
  identifier?: string;
  role: string; // Used mapping for {{Sender Role}}
  major: string; // Used mapping for {{Sender Major}}
  phone: string; // Used mapping for {{Sender Phone}}
  email: string; // Used mapping for {{Sender Email}}
  createdAt: string;
  updatedAt: string;
}

/**
 * The key used to match a profile against a CSV Member value. Prefer the
 * explicit identifier; fall back to the full name for profiles created
 * before the split.
 */
export function getMemberIdentifier(m: Pick<TeamMember, "name" | "identifier">): string {
  return (m.identifier && m.identifier.trim()) || m.name;
}

export interface TeamStore {
  listMembers(): Promise<TeamMember[]>;
  saveMember(
    member: Omit<TeamMember, "createdAt" | "updatedAt"> &
      Partial<Pick<TeamMember, "createdAt" | "updatedAt">>,
  ): Promise<TeamMember>;
  deleteMember(memberId: string): Promise<void>;
}

const TEAM_KEY = "email-drafter.team.v1";

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export class LocalTeamStore implements TeamStore {
  async listMembers(): Promise<TeamMember[]> {
    const members = safeParse<TeamMember[]>(window.localStorage.getItem(TEAM_KEY), []);
    return members.sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveMember(
    member: Omit<TeamMember, "createdAt" | "updatedAt"> &
      Partial<Pick<TeamMember, "createdAt" | "updatedAt">>,
  ): Promise<TeamMember> {
    const members = await this.listMembers();
    const now = new Date().toISOString();
    const existing = members.find((m) => m.id === member.id);

    const persisted: TeamMember = {
      ...member,
      createdAt: existing?.createdAt || member.createdAt || now,
      updatedAt: now,
    };

    const next = members.filter((m) => m.id !== persisted.id);
    next.push(persisted);
    window.localStorage.setItem(TEAM_KEY, JSON.stringify(next));
    return persisted;
  }

  async deleteMember(memberId: string): Promise<void> {
    const members = await this.listMembers();
    const next = members.filter((m) => m.id !== memberId);
    window.localStorage.setItem(TEAM_KEY, JSON.stringify(next));
  }
}

export const teamStore: TeamStore = new LocalTeamStore();
