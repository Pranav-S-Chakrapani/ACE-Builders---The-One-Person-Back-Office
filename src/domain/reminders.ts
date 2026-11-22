/// <reference types="vite/client" />
// A live model must be called from a server-side endpoint, never from frontend code holding an API key.

export type Tone = 'gentle' | 'firm' | 'final';

export type ReminderMode = 'overdue' | 'due_soon';

export interface ReminderInput {
  clientName: string;
  invoiceNumber: string;
  balance: number; /* paise */
  daysLate: number;
  dueDate: string; /* YYYY-MM-DD */
  businessName?: string;
  mode: ReminderMode;
}

export function pickTone(daysLate: number, mode: ReminderMode): Tone {
  if (mode === 'due_soon') return 'gentle';
  if (daysLate < 7) return 'gentle';
  if (daysLate <= 30) return 'firm';
  return 'final';
}

const rupeeFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

function formatRupees(paise: number): string {
  return '₹' + rupeeFormatter.format(paise / 100);
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

function variantIndex(invoiceNumber: string): number {
  const digits = invoiceNumber.replace(/\D/g, '');
  const n = digits.length > 0 ? parseInt(digits, 10) : 0;
  return (Number.isNaN(n) ? 0 : n) % 2;
}

export function draftFallback(input: ReminderInput): string {
  const tone = pickTone(input.daysLate, input.mode);
  const variant = variantIndex(input.invoiceNumber);
  const first = firstName(input.clientName);
  const no = input.invoiceNumber;
  const amount = formatRupees(input.balance);
  const days = String(input.daysLate);
  const studio = input.businessName && input.businessName.trim() !== ''
    ? ' ' + input.businessName.trim()
    : '';

  let text: string;

  if (input.mode === 'due_soon') {
    text = `Hi ${first}, a quick heads-up that invoice ${no} for ${amount} falls due on ${input.dueDate}. Thanks,${studio}`;
  } else if (tone === 'gentle') {
    text = variant === 0
      ? `Hi ${first}, hope you're doing well! A quick note on invoice ${no} for ${amount}, which was due ${days} days ago. Could you let me know when the payment is likely to go through? Thanks so much,${studio}`
      : `Hi ${first}, just a friendly nudge that invoice ${no} for ${amount} is ${days} days past its due date. Let me know if anything is needed from my side. Thank you!${studio}`;
  } else if (tone === 'firm') {
    text = variant === 0
      ? `Hi ${first}, following up on invoice ${no} for ${amount}, now ${days} days past due. Could you confirm a payment date this week? Happy to help if anything is blocking it. Thanks,${studio}`
      : `Hi ${first}, invoice ${no} for ${amount} is now ${days} days overdue. Please share a payment date so I can plan around it. Thank you for your prompt attention.${studio}`;
  } else {
    text = variant === 0
      ? `Hi ${first}, this is a final reminder on invoice ${no} for ${amount}, ${days} days past due. I'd appreciate settling it by the end of this week so we can close it out. Thank you,${studio}`
      : `Hi ${first}, invoice ${no} for ${amount} has now been outstanding for ${days} days. Could you arrange payment this week? Please reply if there is an issue I should know about.${studio}`;
  }

  return text.length < 500 ? text : text.slice(0, 499);
}

export async function draftReminder(input: ReminderInput): Promise<string> {
  const endpoint = import.meta.env.VITE_LLM_ENDPOINT as string | undefined;
  if (!endpoint) return draftFallback(input);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tone: pickTone(input.daysLate, input.mode),
        clientName: input.clientName,
        invoiceNumber: input.invoiceNumber,
        balance: input.balance,
        daysLate: input.daysLate,
        businessName: input.businessName,
      }),
      signal: controller.signal,
    });
    const data = (await res.json()) as { message?: unknown };
    if (typeof data.message === 'string' && data.message.length > 0) {
      return data.message;
    }
    return draftFallback(input);
  } catch {
    return draftFallback(input);
  } finally {
    clearTimeout(timeout);
  }
}
