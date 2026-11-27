import type { CaseSummary, DocumentRef, Lang } from '@chhetry/shared';
import type { CrmAdapter } from '@chhetry/crm';
import { normalize, hasToken } from '@chhetry/guardrails';

/**
 * Case facts given to the LLM and the template answerer. Built only from the
 * CRM (system of record). Receipt numbers and other ids are dropped: the LLM
 * does not need them to answer, so they are not sent to the vendor.
 */
export interface CaseFacts {
  cases: {
    type: string;
    title: string;
    status: CaseSummary['status'];
    keyDates: { label: string; date: string }[];
    steps: CaseSummary['steps'];
    missingDocuments: string[];
  }[];
  documents: { title: string; kind: DocumentRef['kind']; status: DocumentRef['status']; receivedAt?: string }[];
}

export async function loadCaseFacts(crm: CrmAdapter, personId: string): Promise<CaseFacts> {
  const [cases, docs] = await Promise.all([crm.getCases(personId), crm.getDocuments(personId)]);
  return {
    cases: cases.map((c) => ({ type: c.type, title: c.title, status: c.status, keyDates: c.keyDates, steps: c.steps, missingDocuments: c.missingDocuments })),
    documents: docs.map((d) => {
      const out: CaseFacts['documents'][number] = { title: d.title, kind: d.kind, status: d.status };
      if (d.receivedAt) out.receivedAt = d.receivedAt;
      return out;
    }),
  };
}

/** Every date present in the facts. An answer may only mention these (output checker). */
export function factDates(f: CaseFacts): string[] {
  const s = new Set<string>();
  for (const c of f.cases) {
    for (const k of c.keyDates) s.add(k.date);
    for (const st of c.steps) if (st.date) s.add(st.date);
  }
  for (const d of f.documents) if (d.receivedAt) s.add(d.receivedAt);
  return [...s];
}

const TOPIC_TOKENS = {
  dates: ['when', 'date', 'hearing', 'interview', 'appointment', 'next', 'due', 'कहिले', 'मिति', 'सुनुवाइ', 'अन्तर्वार्ता', 'কবে', 'তারিখ', 'শুনানি', 'ইন্টারভিউ', 'সাক্ষাৎকার'],
  documents: ['document*', 'missing', 'paper*', 'upload', 'send', 'कागजात', 'कागज', 'বাকি', 'কাগজ', 'নথি', 'डकुमेन्ट', 'ডকুমেন্ট'],
  status: ['status', 'update', 'approved', 'pending', 'progress', 'स्थिति', 'के भयो', 'অবস্থা', 'স্ট্যাটাস', 'কী হলো'],
} as const;

const FRAMES: Record<Lang, { upcoming: string; missing: string; status: string; none: string }> = {
  en: { upcoming: 'Coming up in your file:', missing: 'Documents the team still needs:', status: 'Your cases:', none: 'Nothing is listed.' },
  ne: { upcoming: 'तपाईंको फाइलमा आउँदै गरेका कुराहरू:', missing: 'टोलीलाई अझै चाहिने कागजातहरू:', status: 'तपाईंका मुद्दाहरू:', none: 'केही सूचीमा छैन।' },
  bn: { upcoming: 'আপনার ফাইলে সামনে যা আছে:', missing: 'দলের এখনও যে কাগজগুলো দরকার:', status: 'আপনার কেসগুলো:', none: 'কিছু তালিকায় নেই।' },
};

/**
 * Deterministic answerer used when no LLM is configured (local dev, tests)
 * or as a fallback. Returns null when it cannot tell what is being asked.
 * Case titles and step labels come from the CRM in English.
 */
export function templateAnswer(f: CaseFacts, question: string, lang: Lang, today: string): string | null {
  const n = normalize(question);
  const is = (k: keyof typeof TOPIC_TOKENS) => TOPIC_TOKENS[k].some((t) => hasToken(n, t));
  const fr = FRAMES[lang];
  const parts: string[] = [];
  if (is('dates')) {
    const upcoming = f.cases.flatMap((c) => c.steps.filter((s) => s.date && s.date >= today && s.status !== 'done').map((s) => ({ c, s })));
    upcoming.sort((a, b) => a.s.date!.localeCompare(b.s.date!));
    parts.push(`${fr.upcoming} ${upcoming.length ? upcoming.map(({ c, s }) => `${s.label} (${c.title}): ${s.date}`).join('; ') : fr.none}`);
  }
  if (is('documents')) {
    const missing = f.cases.flatMap((c) => c.missingDocuments);
    parts.push(`${fr.missing} ${missing.length ? missing.join('; ') : fr.none}`);
  }
  if (is('status')) parts.push(`${fr.status} ${f.cases.map((c) => `${c.title}: ${c.status}`).join('; ')}`);
  return parts.length ? parts.join('\n') : null;
}
