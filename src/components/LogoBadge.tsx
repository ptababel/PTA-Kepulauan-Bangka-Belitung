import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

interface LogoBadgeProps {
  size?: 'sm' | 'md' | 'lg';
}

export function LogoBadge({ size = 'md' }: LogoBadgeProps) {
  const [imgError, setImgError] = useState(false);

  const dims =
    size === 'sm'
      ? 'w-9 h-11'
      : size === 'lg'
        ? 'w-20 h-24'
        : 'w-11 h-14';

  if (imgError) {
    return (
      <div
        className={`${dims} rounded-lg bg-emerald-800 text-amber-300 flex items-center justify-center shrink-0 border border-emerald-700`}
        aria-label="Logo PTA Kep. Babel"
      >
        <ShieldCheck className="w-6 h-6" />
      </div>
    );
  }

  return (
    <img
      src="/assets/aistudio/PTA_Kep_Babel_e9d2c4ad.png"
      alt="Logo Pengadilan Tinggi Agama Kepulauan Bangka Belitung"
      referrerPolicy="no-referrer"
      onError={() => setImgError(true)}
      className={`${dims} object-contain shrink-0`}
    />
  );
}
