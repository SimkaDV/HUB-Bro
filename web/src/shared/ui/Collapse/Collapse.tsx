import { useEffect, useState, type ReactNode } from "react";
import styles from "./Collapse.module.css";

type Props = {
  open: boolean;
  children: ReactNode;
  /** Класс внутреннего блока: отступы и gap кладём сюда, чтобы они тоже плавно появлялись. */
  className?: string;
};

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Плавное раскрытие по высоте. Закрытое содержимое не рендерится.
export function Collapse({ open, children, className }: Props) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Два кадра: сначала блок появляется свёрнутым, потом запускается переход.
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setExpanded(true)));
      return () => cancelAnimationFrame(id);
    }
    setExpanded(false);
    if (reducedMotion()) setMounted(false);
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      className={`${styles.collapse} ${expanded ? styles.expanded : ""}`}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && e.propertyName === "grid-template-rows" && !open) setMounted(false);
      }}
    >
      <div className={styles.clip}>
        <div className={className}>{children}</div>
      </div>
    </div>
  );
}
