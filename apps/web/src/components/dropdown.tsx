"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

type Option = { value: string; label: string };

// 커스텀 드롭다운. 네이티브 <select> 팝업(브라우저가 직접 그리며 다크 모드에서
// 한 프레임 검게 번쩍이는 문제)을 쓰지 않고 직접 렌더해 플래시를 원천 제거한다.
// 키보드(방향키·Enter·Home/End·Esc)와 aria-activedescendant로 접근성을 보장한다.
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
  const [activeIndex, setActiveIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const optionId = (index: number) => `${baseId}-opt-${index}`;
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const openMenu = () => {
    const current = options.findIndex((option) => option.value === value);
    setActiveIndex(current >= 0 ? current : 0);
    setOpen(true);
  };

  const commit = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) return openMenu();
        return setActiveIndex((prev) => Math.min(options.length - 1, prev + 1));
      case "ArrowUp":
        event.preventDefault();
        if (!open) return openMenu();
        return setActiveIndex((prev) => Math.max(0, prev - 1));
      case "Home":
        if (open) { event.preventDefault(); setActiveIndex(0); }
        return;
      case "End":
        if (open) { event.preventDefault(); setActiveIndex(options.length - 1); }
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open && activeIndex >= 0) return commit(activeIndex);
        return openMenu();
      case "Escape":
        if (open) { event.preventDefault(); setOpen(false); }
        return;
      default:
    }
  };

  return (
    <div className={`dropdown${disabled ? " is-disabled" : ""}`} ref={ref}>
      <button
        type="button"
        className="dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className={selected ? undefined : "dropdown-placeholder"}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={16} aria-hidden />
      </button>
      {open && !disabled && (
        <ul className="dropdown-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => (
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={option.value === value}
              className={`dropdown-option${option.value === value ? " is-selected" : ""}${index === activeIndex ? " is-active" : ""}`}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => commit(index)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
