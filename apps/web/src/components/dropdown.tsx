"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Option = { value: string; label: string };

// 커스텀 드롭다운. 네이티브 <select> 팝업(브라우저가 직접 그리며 다크 모드에서
// 한 프레임 검게 번쩍이는 문제)을 쓰지 않고 직접 렌더해 플래시를 원천 제거한다.
export function Dropdown({
  value,
  placeholder,
  options,
  disabled = false,
  ariaLabel,
  onChange,
}: {
  value: string;
  placeholder: string;
  options: Option[];
  disabled?: boolean;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`dropdown${disabled ? " is-disabled" : ""}`} ref={ref}>
      <button
        type="button"
        className="dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={selected ? undefined : "dropdown-placeholder"}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={16} aria-hidden />
      </button>
      {open && !disabled && (
        <ul className="dropdown-menu" role="listbox">
          {options.map((option) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={`dropdown-option${option.value === value ? " is-selected" : ""}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
