// Gmail message → plain text, bulk-mail detection and date candidates.

const decodeB64 = (data) => Buffer.from(String(data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

function findPart(part, mime) {
  if (!part) return null;
  if (part.mimeType === mime && part.body && part.body.data) return part.body.data;
  for (const p of part.parts || []) {
    const hit = findPart(p, mime);
    if (hit) return hit;
  }
  return null;
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// Drops quoted history so each message contributes only what it adds.
function stripQuoted(text) {
  const cut = String(text).search(/^\s*(On .{5,200}wrote:|-{2,}\s*Original Message|_{5,}\s*$|From: .+\n(Sent|Date): )/im);
  const kept = cut > 0 ? text.slice(0, cut) : text;
  return kept.split('\n').filter((l) => !/^\s*>/.test(l)).join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function messageText(msg) {
  const plain = findPart(msg.payload, 'text/plain');
  const html = plain ? null : findPart(msg.payload, 'text/html');
  const raw = plain ? decodeB64(plain) : html ? htmlToText(decodeB64(html)) : msg.snippet || '';
  const text = stripQuoted(raw) || String(msg.snippet || '');
  return text.length > CFG.maxCharsPerMessage ? `${text.slice(0, CFG.maxCharsPerMessage)}…` : text;
}

const BULK_CATEGORIES = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_FORUMS', 'CATEGORY_UPDATES'];
const BULK_SENDER = /^(no-?reply|do-?not-?reply|notifications?|notify|mailer-daemon|updates?|news(letter)?|marketing|info|hello|team)@/i;

// Bulk = you never wrote in the thread AND it carries a mailing-list/marketing signal. Rule-based on purpose:
// Gmail headers state this as fact, so no judgment is spent on it.
function isBulkThread(messages, ownerWrote) {
  if (ownerWrote) return false;
  return messages.some((m) =>
    header(m, 'List-Unsubscribe') ||
    /^(bulk|list|junk)$/i.test(header(m, 'Precedence').trim()) ||
    (m.labelIds || []).some((l) => BULK_CATEGORIES.includes(l)) ||
    BULK_SENDER.test((parseAddressList(header(m, 'From'))[0] || {}).email || ''));
}

// ── Date candidates: code finds and resolves date phrases; the model only picks which (if any) is a deadline ──
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const addDays = (key, n) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekdayOf = (key) => new Date(`${key}T00:00:00Z`).getUTCDay();
const mondayOf = (key) => addDays(key, -((weekdayOf(key) + 6) % 7));
const validYmd = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
};

function findDateCandidates(text, refDate) {
  const ref = dayKey(refDate);
  const found = [];
  const add = (date, m) => {
    if (!date) return;
    const ctx = text.slice(Math.max(0, m.index - 90), m.index + m[0].length + 60).replace(/\s+/g, ' ').trim();
    found.push({ date, phrase: m[0].trim(), context: ctx });
  };
  const each = (re, fn) => {
    for (const m of text.matchAll(re)) add(fn(m), m);
  };
  const nextWeekday = (wd, strictlyAfter = true) => {
    let k = addDays(ref, strictlyAfter ? 1 : 0);
    while (weekdayOf(k) !== wd) k = addDays(k, 1);
    return k;
  };

  each(/\b(today|tonight|end of (?:the )?day|EOD|COB)\b/gi, () => ref);
  each(/\btomorrow\b/gi, () => addDays(ref, 1));
  each(/\b(end of (?:the )?week|EOW)\b/gi, () => nextWeekday(5, false));
  each(/\bnext week\b/gi, () => nextWeekday(1));
  each(/\b(end of (?:the )?month|EOM)\b/gi, () => {
    const [y, mo] = ref.split('-').map(Number);
    return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  });
  each(/\b(?:(next|this)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thurs?|fri)\b\.?/gi, (m) => {
    const wd = WEEKDAYS[m[2].slice(0, 3).toLowerCase()];
    let k = nextWeekday(wd);
    // "next Friday" said early in a week means the Friday after this one
    if (/next/i.test(m[1] || '') && mondayOf(k) === mondayOf(ref)) k = addDays(k, 7);
    return k;
  });
  const monthIdx = (s) => MONTHS.indexOf(s.slice(0, 3).toLowerCase());
  const withYear = (y, mo, d) => {
    if (y) return validYmd(Number(y), mo, d);
    const refYear = Number(ref.slice(0, 4));
    const k = validYmd(refYear, mo, d);
    return k && k < addDays(ref, -30) ? validYmd(refYear + 1, mo, d) : k;
  };
  const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  each(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON}\\.?(?:,?\\s+(20\\d\\d))?\\b`, 'gi'), (m) => withYear(m[3], monthIdx(m[2]), Number(m[1])));
  each(new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d\\d))?\\b`, 'gi'), (m) => withYear(m[3], monthIdx(m[1]), Number(m[2])));
  each(/\b(20\d\d)-(\d\d)-(\d\d)\b/g, (m) => validYmd(Number(m[1]), Number(m[2]) - 1, Number(m[3])));

  return found;
}
