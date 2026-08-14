import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface SelectOption { value: string; label: string; description?: string }

interface Props {
  value: string;
  options: SelectOption[];
  onChange(value: string): void;
  ariaLabel: string;
  className?: string;
  leadingIcon?: ReactNode;
  minMenuWidth?: number;
}

interface MenuPosition { top: number; left: number; width: number; maxHeight: number }

export function BeautifulSelect({ value, options, onChange, ariaLabel, className = "", leadingIcon, minMenuWidth = 150 }: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(() => Math.max(0, options.findIndex((option) => option.value === value)));
  const [position, setPosition] = useState<MenuPosition>({ top: 0, left: 0, width: minMenuWidth, maxHeight: 260 });
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  const updatePosition = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const desiredHeight = Math.min(260, options.length * 45 + 10);
    const width = Math.max(minMenuWidth, rect.width);
    const roomBelow = window.innerHeight - rect.bottom - 10;
    const openAbove = roomBelow < desiredHeight && rect.top > roomBelow;
    const maxHeight = Math.max(120, Math.min(desiredHeight, openAbove ? rect.top - 16 : roomBelow));
    const top = openAbove ? Math.max(8, rect.top - maxHeight - 7) : rect.bottom + 7;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    setPosition({ top, left, width, maxHeight });
  }, [minMenuWidth, options.length]);

  const openMenu = (direction = 0) => {
    const current = Math.max(0, options.findIndex((option) => option.value === value));
    setHighlighted(Math.max(0, Math.min(options.length - 1, current + direction)));
    setOpen(true);
  };

  const select = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setHighlighted(index);
    setOpen(false);
    rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault(); openMenu(event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0); return;
    }
    if (!open) return;
    if (event.key === "Escape" || event.key === "Tab") { setOpen(false); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    }
    if (event.key === "Home") { event.preventDefault(); setHighlighted(0); }
    if (event.key === "End") { event.preventDefault(); setHighlighted(options.length - 1); }
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(highlighted); }
  };

  useLayoutEffect(() => { if (open) updatePosition(); }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const reposition = () => updatePosition();
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePosition]);

  const menuStyle: CSSProperties = { top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight };
  return <div ref={rootRef} className={`beautiful-select ${open ? "is-open" : ""} ${className}`}>
    <button type="button" className="beautiful-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listboxId : undefined} aria-activedescendant={open ? `${listboxId}-${highlighted}` : undefined} onClick={() => open ? setOpen(false) : openMenu()} onKeyDown={onKeyDown}>
      {leadingIcon && <span className="select-leading">{leadingIcon}</span>}
      <span className="select-value">{selected?.label ?? value}</span>
      <ChevronDown className="select-chevron" />
    </button>
    {open && createPortal(<div ref={menuRef} id={listboxId} role="listbox" aria-label={ariaLabel} className="beautiful-select-menu" style={menuStyle}>
      {options.map((option, index) => <button type="button" role="option" aria-selected={option.value === value} id={`${listboxId}-${index}`} key={option.value} className={`${option.value === value ? "selected" : ""} ${highlighted === index ? "highlighted" : ""}`} onPointerMove={() => setHighlighted(index)} onClick={() => select(index)}>
        <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
        {option.value === value && <Check />}
      </button>)}
    </div>, document.body)}
  </div>;
}
