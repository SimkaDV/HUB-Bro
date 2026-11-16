import { useEffect, useState } from "react";
import { Collapse, Input } from "@/shared/ui";
import { SizeListEditor } from "../SizeListEditor/SizeListEditor";
import { ThresholdEditor } from "../ThresholdEditor/ThresholdEditor";
import { canDeleteCategory, formatThresholds, nameTaken, normalizeCode } from "../settings";
import { compareSizes } from "@/shared/stock";
import type { ChangeSettings } from "../store";
import type { Category, Model } from "@/shared/stock";
import styles from "./CategorySettingsCard.module.css";

type Props = {
  category: Category;
  categories: Category[];
  models: Model[];
  change: ChangeSettings;
};

/** Настройки категории: название, пороги по умолчанию для её моделей, шаблон размеров. */
export function CategorySettingsCard({ category, categories, models, change }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(category.name);
  useEffect(() => setName(category.name), [category.name]);
  const [code, setCode] = useState(category.code ?? "");
  useEffect(() => setCode(category.code ?? ""), [category.code]);

  const inCategory = models.filter((m) => m.category === category.name);
  const withOwn = inCategory.filter((m) => m.thresholds).length;
  const nameProblem = !name.trim()
    ? "Впишите название"
    : name.trim() !== category.name && nameTaken(name, categories.map((c) => c.name))
      ? "Такая категория уже есть"
      : null;

  const codeProblem =
    code && code !== category.code && categories.some((c) => c.id !== category.id && c.code === code)
      ? "Такой код уже у другой категории"
      : null;

  const patch = (text: string, fn: (c: Category) => Category) =>
    change(text, (s) => ({ categories: s.categories.map((c) => (c.id === category.id ? fn(c) : c)) }));

  const commitName = () => {
    const next = name.trim();
    if (nameProblem || next === category.name) return setName(category.name);
    // Модели ссылаются на категорию по названию — переименовываем и у них.
    change(`Категория «${category.name}» переименована в «${next}»`, (s) => ({
      categories: s.categories.map((c) => (c.id === category.id ? { ...c, name: next } : c)),
      models: s.models.map((m) => (m.category === category.name ? { ...m, category: next } : m)),
    }));
  };

  const commitCode = () => {
    const prev = category.code ?? "";
    if (codeProblem || code === prev) return setCode(prev);
    patch(`Категория «${category.name}»: код на бирке ${prev || "—"} → ${code || "—"}`, ({ code: _, ...c }) =>
      code ? { ...c, code } : c,
    );
  };

  const setSizes = (sizes: string[], text: string) => patch(text, (c) => ({ ...c, sizes }));

  return (
    <article className={styles.card}>
      <button type="button" className={styles.head} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={styles.title}>{category.name}</span>
        <span className={styles.meta}>
          {category.code ? `${category.code} · ` : ""}
          {inCategory.length} мод. · {category.sizes.length} разм. в шаблоне · пороги {formatThresholds(category.thresholds)}
        </span>
        <svg className={`${styles.chevron} ${open ? styles.up : ""}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 9l7 7 7-7" />
        </svg>
      </button>

      <Collapse open={open} className={styles.body}>
        <div className={styles.row}>
          <div className={styles.nameField}>
            <Input
              id={`cat-name-${category.id}`}
              label="Название"
              className={styles.onCard}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            {nameProblem && <span className={styles.problem}>{nameProblem}</span>}
          </div>
          <div className={styles.nameField}>
            <Input
              id={`cat-code-${category.id}`}
              label="Код на бирке"
              className={styles.onCard}
              value={code}
              placeholder="КЛ"
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              onBlur={commitCode}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            {codeProblem ? (
              <span className={styles.problem}>{codeProblem}</span>
            ) : (
              <span className={styles.hint}>
                До 4 букв или цифр, пишется после номера заказа: N338871{code ? `-${code}` : "-КЛ"}
              </span>
            )}
          </div>
        </div>

        <section className={styles.section}>
          <h4>Пороги «мало / норм» для моделей категории</h4>
          <p className={styles.hint}>
            Действуют на все модели категории, у которых нет своих порогов
            {withOwn > 0 ? ` (свои пороги у ${withOwn} из ${inCategory.length})` : ""}.
          </p>
          <ThresholdEditor
            id={`cat-thr-${category.id}`}
            value={category.thresholds}
            onCommit={(t) =>
              patch(
                `Категория «${category.name}»: пороги ${formatThresholds(category.thresholds)} → ${formatThresholds(t)}`,
                (c) => ({ ...c, thresholds: t }),
              )
            }
          />
        </section>

        <section className={styles.section}>
          <h4>Шаблон размеров</h4>
          <p className={styles.hint}>
            Новая модель этой категории получает эти размеры, окно поставки подсказывает их. На уже заведённые модели
            не влияет.
          </p>
          <SizeListEditor
            items={category.sizes.map((size) => ({ size, canDelete: true }))}
            onReorder={(order) => setSizes(order, `Категория «${category.name}»: порядок размеров изменён`)}
            onAutoSort={() =>
              setSizes([...category.sizes].sort(compareSizes), `Категория «${category.name}»: размеры выстроены по порядку`)
            }
            onAdd={(size) => setSizes([...category.sizes, size], `Категория «${category.name}»: добавлен размер ${size}`)}
            onDelete={(size) =>
              setSizes(
                category.sizes.filter((s) => s !== size),
                `Категория «${category.name}»: из шаблона убран размер ${size}`,
              )
            }
          />
        </section>

        <div className={styles.actions}>
          {canDeleteCategory(category, models) ? (
            <button
              type="button"
              className={styles.action}
              onClick={() =>
                change(`Категория «${category.name}» удалена`, (s) => ({
                  categories: s.categories.filter((c) => c.id !== category.id),
                }))
              }
            >
              Удалить категорию
            </button>
          ) : (
            <span className={styles.note}>Удалить можно только пустую категорию — без моделей, в том числе в архиве.</span>
          )}
        </div>
      </Collapse>
    </article>
  );
}
