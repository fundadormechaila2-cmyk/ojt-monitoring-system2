import { useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

export default function RowActionsMenu({ actions, open, onOpenChange }) {
  const menuId = useId();
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const menu = menuRef.current;
    const trigger = triggerRef.current;

    const positionMenu = () => {
      const rect = trigger.getBoundingClientRect();
      const margin = 8;
      const gap = 6;
      const below = window.innerHeight - rect.bottom - margin;
      const above = rect.top - margin;
      const opensUp = below < menu.scrollHeight + gap && above > below;
      const available = Math.max(0, (opensUp ? above : below) - gap);
      menu.style.maxHeight = `${available}px`;
      const height = Math.min(menu.scrollHeight, available);
      menu.style.left = `${Math.max(margin, Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - margin))}px`;
      menu.style.top = `${opensUp ? rect.top - gap - height : rect.bottom + gap}px`;
      menu.style.visibility = "visible";
    };

    const handleOutside = (event) => {
      if (!trigger.contains(event.target) && !menu.contains(event.target)) {
        onOpenChange(false);
      }
    };
    positionMenu();
    menu.querySelector('[role="menuitem"]')?.focus();
    document.addEventListener("pointerdown", handleOutside);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open, onOpenChange]);

  const handleKeyDown = (event) => {
    const items = Array.from(menuRef.current.querySelectorAll('[role="menuitem"]'));
    const index = items.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      onOpenChange(false);
      triggerRef.current.focus();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0
        : event.key === "End" ? items.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    } else if (event.key === "Tab") {
      const focusable = Array.from(document.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !menuRef.current.contains(element) && element.getClientRects().length);
      const triggerIndex = focusable.indexOf(triggerRef.current);
      const next = focusable[triggerIndex + (event.shiftKey ? -1 : 1)];
      onOpenChange(false);
      if (next) {
        event.preventDefault();
        next.focus();
      }
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="row-actions-trigger"
        aria-label="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => onOpenChange(!open)}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            onOpenChange(true);
          }
        }}
      >
        <MoreVertical size={20} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          className="row-actions-menu"
          role="menu"
          aria-label="Actions"
          onKeyDown={handleKeyDown}
        >
          {actions.map(({ label, icon: Icon, onSelect }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                onOpenChange(false);
                onSelect();
              }}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
