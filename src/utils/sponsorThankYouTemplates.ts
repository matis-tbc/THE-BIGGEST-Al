// Static seed for the 2025-2026 sponsor thank-you send. Source of truth is
// `CU HYPERLOOP/Bus Dev/Email Drafts/Sponsor Email Templates 2025-2026.md`.
// Kept here in TypeScript so the app can auto-seed on first run without
// requiring the user to paste each template manually. The seed runs once
// (guarded by the migration flag in projectStore.listTemplates) and does
// nothing if a template with a matching `id` already exists, so re-runs
// never clobber user edits.

import type { StoredTemplate } from "../services/projectStore";

const now = () => new Date().toISOString();

const TEMPLATE_A_CONTENT = `Subject: Thank you {{company}} // CU Hyperloop 2026

Hi {{greeting}},

We just wrapped up our 2025-2026 season, placing 3rd at the Not-a-Boring Competition in Bastrop, Texas. Attached is our thank-you packet with a personalized note on how your support powered the team.

As we start building the 2026-2027 machine, I would love to set up a 30-minute call to talk through what we are designing next and how {{company}} can remain part of it. Starting that conversation early lets us plan around what you provide and make sure we are giving {{company}} the full benefits of the partnership across the whole season, not just at the end.

What does your schedule look like in the coming weeks? We are wrapping finals next week and are pretty flexible after that, so whatever works best on your end works on ours.

Thank you again for an incredible year.

{{Signature}}`;

const TEMPLATE_B_CONTENT = `Subject: Thank you Progressive Automations // CU Hyperloop 2026 + Next Year's Actuators

Hi {{greeting}},

We just wrapped up our 2025-2026 season, placing 3rd at the Not-a-Boring Competition in Bastrop, Texas. Attached is our thank-you packet with a personalized note on how your PA-13 actuators powered our hexapod this year.

Two things we would love to talk through as we plan 2026-2027:

We are starting to scope the next propulsion and gripper systems and would love your input on actuator selection. The team has been in the weeds with PA-13s all year, and your perspective on what makes sense for the loads, stroke lengths, and duty cycles we are targeting would be really valuable.

We would also love to find a way to work together on content, whether that is a walkthrough of how your actuators drive the hexapod, a case study from this season, or something you have been wanting to put out. Happy to figure out what works on your end.

Do you have time in the next few weeks to hop on a quick call?

Thank you again for everything this year.

{{Signature}}`;

const TEMPLATE_C_CONTENT = `Subject: Thank you Mao // CU Hyperloop 2026

Hi Mao,

We just wrapped up our 2025-2026 season, placing 3rd at the Not-a-Boring Competition in Bastrop, Texas. A lot of that came back to the introduction you made to Keysight this year. The scope and power supply they donated were in our lab almost every day, and the team could not have brought up our five custom PCBs without them. Attached is our thank-you packet with a note to you specifically.

If there is anyone else in your network we should be talking to for 2026-2027, we would love an intro. And if you ever want to swing by and see the machine in person, the door is open.

Thank you again, really.

{{Signature}}`;

const TEMPLATE_D_CONTENT = `Subject: Thank you {{company}} // CU Hyperloop 2026

Hi {{greeting}},

We just wrapped up our 2025-2026 season, placing 3rd at the Not-a-Boring Competition in Bastrop, Texas. Wanted to send our thank-you packet over your way. It includes a personalized note on how your support fit into the machine this year.

If you would like the blurb tailored differently for a social post, internal newsletter, or anything else on your end, let us know and we are happy to rewrite it.

Thank you again for an incredible year.

{{Signature}}`;

export const SPONSOR_THANK_YOU_TEMPLATES: StoredTemplate[] = [
  {
    id: "sponsor-2026-a-big-monetary",
    name: "sponsor-A-big-monetary",
    subjects: ["Thank you {{company}} // CU Hyperloop 2026"],
    content: TEMPLATE_A_CONTENT,
    variables: [],
    createdAt: now(),
    updatedAt: now(),
    versions: [],
  },
  {
    id: "sponsor-2026-b-progressive",
    name: "sponsor-B-progressive",
    subjects: ["Thank you Progressive Automations // CU Hyperloop 2026 + Next Year's Actuators"],
    content: TEMPLATE_B_CONTENT,
    variables: [],
    createdAt: now(),
    updatedAt: now(),
    versions: [],
  },
  {
    id: "sponsor-2026-c-electrorent",
    name: "sponsor-C-electrorent",
    subjects: ["Thank you Mao // CU Hyperloop 2026"],
    content: TEMPLATE_C_CONTENT,
    variables: [],
    createdAt: now(),
    updatedAt: now(),
    versions: [],
  },
  {
    id: "sponsor-2026-d-standard",
    name: "sponsor-D-standard",
    subjects: ["Thank you {{company}} // CU Hyperloop 2026"],
    content: TEMPLATE_D_CONTENT,
    variables: [],
    createdAt: now(),
    updatedAt: now(),
    versions: [],
  },
];
