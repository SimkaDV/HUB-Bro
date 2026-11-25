import { useState } from "react";
import { Button, Input } from "@/shared/ui";
import { CategorySettingsCard } from "../CategorySettingsCard/CategorySettingsCard";
import { DisplaySettingsPanel } from "../DisplaySettingsPanel/DisplaySettingsPanel";
import { ModelSettingsCard } from "../ModelSettingsCard/ModelSettingsCard";
import { SizeScalePanel } from "../SizeScalePanel/SizeScalePanel";
import { nameTaken } from "../settings";
import { DEFAULT_THRESHOLDS, newCategoryId, newModel } from "@/shared/stock";
import type { ChangeSettings } from "../store";
import type { Category, DisplaySettings, Model, SizeLabel } from "@/shared/stock";
import styles from "./SettingsView.module.css";

type Section = "models" | "categories" | "sizes" | "display";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "models", label: "Модели" },
  { id: "categories", label: "Категории" },
  { id: "sizes", label: "Размеры" },
  { id: "display", label: "Отображение" },
];

type Props = {
  models: Model[];
  categories: Category[];
  display: DisplaySettings;
  sizeScale: SizeLabel[];
  change: ChangeSettings;
};

/** Настройки склада. Права доступа пока не проверяем — менять может любой. */
export function SettingsView({ models, categories, display, sizeScale, change }: Props) {
  const [section, setSection] = useState<Section>("models");

  return (
    <div className={styles.view}>
      <div className={styles.tabs} role="tablist" aria-label="Разделы настроек">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            className={section === s.id ? styles.activeTab : ""}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className={styles.section} key={section}>
        {section === "models" && (
          <ModelsSection models={models} categories={categories} change={change} onAddCategory={() => setSection("categories")} />
        )}
        {section === "categories" && <CategoriesSection models={models} categories={categories} change={change} />}
        {section === "sizes" && <SizeScalePanel sizeScale={sizeScale} categories={categories} models={models} change={change} />}
        {section === "display" && <DisplaySettingsPanel display={display} change={change} />}
      </div>
    </div>
  );
}

function ModelsSection({ models, categories, change, onAddCategory }: Omit<Props, "display" | "sizeScale"> & { onAddCategory: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(categories[0]?.id ?? "");
  const [showArchive, setShowArchive] = useState(false);
  const problem = name.trim() && nameTaken(name, models.map((m) => m.name)) ? "Такая модель уже есть" : null;
  const active = models.filter((m) => !m.archived);
  const archived = models.filter((m) => m.archived);

  const add = () => {
    const cat = categories.find((c) => c.id === category);
    if (!name.trim() || problem || !cat) return;
    // Новый товар каталога: id из названия, поля бота пустые (их заполнит приложение менеджера бота).
    const model: Model = newModel(name.trim(), cat.id, cat.sizes, models);
    change(`Модель «${model.name}» добавлена (${cat.name})`, (s) => ({ models: [...s.models, model] }));
    setName("");
  };

  const card = (m: Model) => (
    <ModelSettingsCard key={m.id} model={m} models={models} categories={categories} change={change} />
  );

  if (categories.length === 0) {
    return (
      <div className={styles.firstStep}>
        <p>
          Модель всегда в категории: у категории задаются размеры, их получит новая модель. Сначала заведите категорию
          — например, «Джинсы».
        </p>
        <Button onClick={onAddCategory}>Завести категорию</Button>
      </div>
    );
  }

  return (
    <>
      <form
        className={styles.addForm}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input id="new-model-name" label="Новая модель" placeholder="Джинсы Бананы" value={name} onChange={(e) => setName(e.target.value)} />
        <label className={styles.field} htmlFor="new-model-cat">
          <span>Категория</span>
          <select id="new-model-cat" className={styles.select} value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={!name.trim() || !!problem || !category}>
          + Модель
        </Button>
        {problem && <span className={styles.problem}>{problem}</span>}
      </form>

      {categories.map((c) => {
        const list = active.filter((m) => m.categoryId === c.id);
        if (list.length === 0) return null;
        return (
          <section key={c.id} className={styles.group}>
            <h3>{c.name}</h3>
            {list.map(card)}
          </section>
        );
      })}

      {archived.length > 0 && (
        <section className={styles.group}>
          <button type="button" className={styles.archiveToggle} onClick={() => setShowArchive(!showArchive)} aria-expanded={showArchive}>
            Архив ({archived.length}) {showArchive ? "▴" : "▾"}
          </button>
          {showArchive && archived.map(card)}
        </section>
      )}
    </>
  );
}

function CategoriesSection({ models, categories, change }: Omit<Props, "display" | "sizeScale">) {
  const [name, setName] = useState("");
  const problem = name.trim() && nameTaken(name, categories.map((c) => c.name)) ? "Такая категория уже есть" : null;

  const add = () => {
    if (!name.trim() || problem) return;
    const category: Category = { id: newCategoryId(name.trim(), categories), name: name.trim(), sizes: [], thresholds: DEFAULT_THRESHOLDS };
    change(`Категория «${category.name}» добавлена`, (s) => ({ categories: [...s.categories, category] }));
    setName("");
  };

  return (
    <>
      <form
        className={styles.addForm}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input id="new-category-name" label="Новая категория" placeholder="Шорты" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={!name.trim() || !!problem}>
          + Категория
        </Button>
        {problem && <span className={styles.problem}>{problem}</span>}
      </form>
      {categories.map((c) => (
        <CategorySettingsCard key={c.id} category={c} categories={categories} models={models} change={change} />
      ))}
    </>
  );
}
