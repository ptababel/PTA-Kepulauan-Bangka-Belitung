import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { Pegawai } from '../types';

interface PegawaiDropdownProps {
  id: string;
  label: string;
  pegawaiList: Pegawai[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showReceiptStatus?: boolean;
  heightClass?: string;
}

export function PegawaiDropdown({
  id,
  label,
  pegawaiList,
  value,
  onChange,
  placeholder = 'Pilih atau cari nama / kode pegawai...',
  showReceiptStatus = false,
  heightClass = 'min-h-[44px]',
}: PegawaiDropdownProps) {
  const [open, setOpen] = useState(false);
  const [browseAll, setBrowseAll] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setBrowseAll(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const options = useMemo(() => {
    const sorted = [...pegawaiList].sort((a, b) =>
      a.nama_lengkap.localeCompare(b.nama_lengkap, 'id')
    );
    const q = value.trim().toLowerCase();
    if (browseAll || !q) return sorted;
    return sorted.filter(
      (emp) =>
        emp.nama_lengkap.toLowerCase().includes(q) ||
        emp.kode_pegawai.toLowerCase().includes(q) ||
        emp.unit_kerja.toLowerCase().includes(q)
    );
  }, [pegawaiList, value, browseAll]);

  function handleSelectOption(emp: Pegawai | null) {
    if (!emp) {
      onChange('');
    } else {
      onChange(emp.nama_lengkap);
    }
    setOpen(false);
    setBrowseAll(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlightedIndex(0);
      } else {
        setHighlightedIndex((idx) => Math.min(options.length, idx + 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((idx) => Math.max(0, idx - 1));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (highlightedIndex === 0) {
        handleSelectOption(null);
      } else {
        const chosen = options[highlightedIndex - 1];
        if (chosen) handleSelectOption(chosen);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setBrowseAll(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>

      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          value={value}
          onFocus={() => {
            setOpen(true);
            setBrowseAll(true);
            setHighlightedIndex(0);
          }}
          onChange={(e) => {
            onChange(e.target.value);
            setBrowseAll(false);
            setOpen(true);
            setHighlightedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full ${heightClass} pl-10 ${
            value ? 'pr-16' : 'pr-10'
          } py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700`}
        />

        {value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setBrowseAll(true);
              setOpen(true);
              inputRef.current?.focus();
            }}
            aria-label="Hapus pilihan pegawai"
            className="absolute right-8 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setOpen((prev) => {
              const next = !prev;
              if (next) {
                setBrowseAll(true);
                setHighlightedIndex(0);
              }
              return next;
            });
          }}
          aria-label="Buka menu dropdown pegawai"
          aria-expanded={open}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-800 rounded-md"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={label}
          className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-md max-h-72 overflow-y-auto z-40 divide-y divide-slate-100"
        >
          <li role="option" aria-selected={value === ''}>
            <button
              type="button"
              onClick={() => handleSelectOption(null)}
              className={`w-full min-h-[44px] px-3.5 py-2 text-left text-sm flex items-center justify-between gap-2 transition-colors ${
                highlightedIndex === 0
                  ? 'bg-slate-50 text-slate-900'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="font-medium">Semua Pegawai ({pegawaiList.length})</span>
              {value === '' && <Check className="w-4 h-4 text-emerald-700 shrink-0" />}
            </button>
          </li>

          {options.length === 0 ? (
            <li className="px-3.5 py-4 text-xs text-slate-500 text-center">
              Pegawai tidak ditemukan.
            </li>
          ) : (
            options.map((emp, idx) => {
              const isSelected = value.trim().toLowerCase() === emp.nama_lengkap.toLowerCase();
              const isHighlighted = highlightedIndex === idx + 1;
              const received = Boolean(emp.penerimaan_id);

              return (
                <li key={emp.id} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => handleSelectOption(emp)}
                    className={`w-full min-h-[44px] px-3.5 py-2 text-left flex items-center justify-between gap-3 transition-colors ${
                      isHighlighted || isSelected
                        ? 'bg-emerald-50/70 text-slate-900'
                        : 'hover:bg-slate-50 text-slate-900'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{emp.nama_lengkap}</div>
                      <div className="text-xs text-slate-500 truncate">
                        <span className="font-mono">{emp.kode_pegawai}</span> · {emp.unit_kerja}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {showReceiptStatus && (
                        <span
                          className={`text-xs font-semibold ${
                            received ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {received ? 'Sudah' : 'Belum'}
                        </span>
                      )}
                      {isSelected && <Check className="w-4 h-4 text-emerald-700" />}
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
