import type { DisplayStatus } from '../domain/invoiceStatus';

interface Props {
  status: DisplayStatus;
}

export default function StatusBadge({ status }: Props) {
  return <span className={`badge badge--${status.tone}`}>{status.label}</span>;
}
