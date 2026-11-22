const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

/** Formats integer paise as INR, e.g. 150050 -> "₹1,500.50". */
export function formatMoney(minor: number): string {
  return inr.format(minor / 100);
}

/** Formats YYYY-MM-DD for display, e.g. "5 Jan 2025". Avoids UTC parsing. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
