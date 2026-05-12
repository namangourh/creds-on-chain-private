import { useTheme } from '../lib/theme';

interface Props {
  txSignature: string;
  label?: string;
}

export default function ExplorerLink({ txSignature, label = 'View on Solana Explorer →' }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <a
      href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        fontSize: '0.8125rem',
        color: isDark ? '#14f070' : '#0d4aa5',
        textDecoration: 'none',
        opacity: 0.8,
        transition: 'opacity 0.2s',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '0.8')}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: '14px' }}
      >
        open_in_new
      </span>
      {label}
    </a>
  );
}
