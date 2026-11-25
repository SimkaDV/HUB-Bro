import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Category, Model } from "@/shared/stock";
import styles from "./ProductPicker.module.css";

type Props = {
  id: string;
  /** Выбранная модель. Нет — объявление без товара. */
  value?: Model;
  models: Model[];
  categories: Category[];
  onChange: (productId: string | null) => void;
};

type Option = { id: string | null; label: string; group?: string };

const normalize = (s: string) => s.toLowerCase().replace(/ё/g, "е").trim();

/** Все слова запроса есть в названии модели или категории: «тру» → «Джинсы Трубы», «джинсы клеш» → «Джинсы Клёш». */
const matches = (m: Model, categories: Category[], query: string) => {
  const hay = normalize(`${m.name} ${categories.find((c) => c.id === m.categoryId)?.name ?? ""}`);
  return normalize(query).split(/\s+/).every((w) => hay.includes(w));
};

/**
 * Выбор товара с поиском: поле ввода + свой список в стиле сайта (вместо системного select).
 * Стрелки — по списку, Enter — выбрать, Esc — закрыть без изменений.
 */
export function ProductPicker({ id, value, models, categories, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Архивные модели не предлагаем, но уже выбранную оставляем, чтобы было видно, что выбрано.
  const choices = models.filter((m) => (!m.archived || m.id === value?.id) && (!query.trim() || matches(m, categories, query)));
  const options: Option[] = [
    ...categories.flatMap((c) =>
      choices
        .filter((m) => m.categoryId === c.id)
        .map((m) => ({ id: m.id, label: m.archived ? `${m.name} (в архиве)` : m.name, group: c.name })),
    ),
    ...(value && !query.trim() ? [{ id: null, label: "Отвязать товар" }] : []),
  ];

  useEffect(() => {
    if (!open) return;
    // Открыли — подсвечиваем уже выбранную модель.
    const i = options.findIndex((o) => o.id === value?.id);
    setActive(i >= 0 ? i : 0);
  }, [open]); // только в момент открытия

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const pick = (o: Option) => {
    if (o.id !== (value?.id ?? null)) onChange(o.id);
    close();
    inputRef.current?.blur();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (options.length ? (a + step + options.length) % options.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && options[active]) pick(options[active]);
      else setOpen(true);
    } else if (e.key === "Escape") {
      close();
      inputRef.current?.blur();
    }
  };

  const listId = `${id}-list`;
  let lastGroup: string | undefined;

  return (
    <div className={`${styles.picker} ${open ? styles.open : ""} ${value ? "" : styles.empty}`}>
      <input
        ref={inputRef}
        id={id}
        className={styles.input}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder={value ? value.name : "Выберите товар"}
        value={open ? query : (value?.name ?? "")}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={close}
        onKeyDown={onKeyDown}
      />
      <svg className={styles.chevron} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 9l7 7 7-7" />
      </svg>

      {open && (
        <ul ref={listRef} id={listId} role="listbox" className={styles.list}>
          {options.length === 0 && <li className={styles.nothing}>Такой модели на складе нет</li>}
          {options.map((o, i) => {
            const header = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            const selected = o.id !== null && o.id === value?.id;
            return (
              <li key={o.id ?? "none"} role="presentation">
                {header && <span className={styles.group}>{header}</span>}
                <span
                  id={`${id}-opt-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={selected}
                  className={[styles.option, i === active ? styles.active : "", o.id === null ? styles.unlink : ""].join(" ")}
                  // mousedown, а не click: иначе поле успеет потерять фокус и список закроется.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o);
                  }}
                  onMouseEnter={() => setActive(i)}
                >
                  {o.label}
                  {selected && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12l5 5 9-10" />
                    </svg>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
