import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BATCH_STATE,
  batchState,
  createBatch,
  formatTime,
  isToday,
  orderStage,
  useBatches,
} from "@/shared/fulfillment";
import { SERVICES, useOrders } from "@/shared/orders";
import { useStock } from "@/shared/stock";
import { Button, PageHeader, StatTiles, StatusBadge } from "@/shared/ui";
import { ProblemList } from "./ProblemList/ProblemList";
import { QueueGroupCard } from "./QueueGroupCard/QueueGroupCard";
import { QueueSettings } from "./QueueSettings/QueueSettings";
import {
  buildQueue,
  countBy,
  DEFAULT_CONFIG,
  describeConfig,
  filterQueue,
  groupQueue,
  sortQueue,
  type QueueConfig,
} from "./queue";
import styles from "./PickingPage.module.css";

// Настройка очереди — удобство одного браузера, поэтому просто localStorage.
const CONFIG_KEY = "hubbro.picking.queue.v1";

function loadConfig(): QueueConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<QueueConfig>) };
  } catch {
    // Нет доступа или мусор — настройка по умолчанию.
  }
  return DEFAULT_CONFIG;
}

export default function PickingPage() {
  const orders = useOrders();
  const batches = useBatches();
  const { models, categories } = useStock();
  const [config, setConfig] = useState(loadConfig);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch {
      // Не сохранилось — не страшно.
    }
  }, [config]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  const queue = useMemo(() => buildQueue(orders, batches, models, categories), [orders, batches, models, categories]);
  const visible = useMemo(() => sortQueue(filterQueue(queue, config), config.levels), [queue, config]);
  const groups = groupQueue(visible, config.levels);
  const visibleIds = new Set(visible.map((i) => i.order.id));
  const picked = [...selected].filter((id) => visibleIds.has(id));

  const stages = orders.map((o) => orderStage(o, batches));
  const active = stages.filter((s) => s && s !== "packed").length;
  const inBatches = stages.filter((s) => s === "inBatch" || s === "printed").length;
  const problems = orders.filter((_, i) => stages[i] === "problem");
  const byProduct = countBy(sortQueue(queue, [{ key: "model", on: true }]), (i) => i.order.product);
  const byService = countBy(queue, (i) => i.order.service);
  const printedToday = batches.filter((b) => !b.cancelledAt && isToday(b.printedAt));
  const todayBatches = batches.filter((b) => isToday(b.createdAt));

  const select = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  /** Отправляет на пульт в порядке очереди, а не в порядке кликов. */
  const send = (ids: string[]) => {
    const set = new Set(ids);
    const ordered = visible.map((i) => i.order.id).filter((id) => set.has(id));
    if (ordered.length === 0) return;
    const number = batches.reduce((max, b) => Math.max(max, b.number), 0) + 1;
    createBatch(ordered, describeConfig(config));
    select(ordered, false);
    setNotice(`Партия №${number} на пульте: ${ordered.length} шт.`);
  };

  const showProblems = () => {
    setProblemsOpen(true);
    document.getElementById("problems")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <PageHeader title="Комплектация" subtitle="Заказы со склада → очередь печати → партия на пульт" />

      <StatTiles
        tiles={[
          { label: "Всего", value: active, detail: `к печати ${queue.length} · в партиях ${inBatches} · проблем ${problems.length}` },
          { label: "На печать", value: queue.length, detail: "в резерве, без проблем" },
          {
            label: "Товаров",
            value: byProduct.size,
            detail: [...byProduct].map(([name, n]) => `${name} ${n}`).join(" · ") || "очередь пуста",
          },
          {
            label: "ПВЗ",
            value: byService.size,
            detail: SERVICES.map((s) => `${s.label} ${byService.get(s.id) ?? 0}`).join(" · "),
          },
          {
            label: "Проблемы",
            value: problems.length,
            detail: problems.length ? "показать список ↓" : "всё чисто",
            alert: problems.length > 0,
            onClick: problems.length ? showProblems : undefined,
          },
          {
            label: "Отпечатано сегодня",
            value: printedToday.length,
            detail: `партий · ${printedToday.reduce((n, b) => n + b.orderIds.length, 0)} шт.`,
          },
        ]}
      />

      <ProblemList orders={problems} models={models} open={problemsOpen} onToggle={() => setProblemsOpen(!problemsOpen)} />

      <h2 className={styles.sectionTitle}>
        Очередь печати <span className={styles.count}>{visible.length}</span>
      </h2>

      <QueueSettings
        config={config}
        onChange={setConfig}
        items={queue}
        modelOrder={models.map((m) => m.name)}
        sizeOrder={(name) => models.find((m) => m.name === name)?.sizes.map((s) => s.size) ?? []}
      />

      {groups.length === 0 ? (
        <p className={styles.empty}>{queue.length ? "Под фильтр ничего не попало" : "Очередь пуста — всё отправлено на пульт"}</p>
      ) : (
        <div className={styles.groups}>
          {groups.map((g) => (
            <QueueGroupCard key={g.key} group={g} selected={selected} onSelect={select} onSend={send} />
          ))}
        </div>
      )}

      {visible.length > 0 && (
        <div className={styles.bar}>
          <span className={styles.barText}>
            {picked.length ? `Выбрано ${picked.length} из ${visible.length}` : `В очереди ${visible.length}`}
          </span>
          {picked.length > 0 && (
            <Button variant="secondary" onClick={() => select(picked, false)}>
              Снять выбор
            </Button>
          )}
          <Button onClick={() => send(picked.length ? picked : visible.map((i) => i.order.id))}>
            {picked.length ? `Выбранные на пульт (${picked.length})` : `Всё на пульт (${visible.length})`}
          </Button>
        </div>
      )}

      {todayBatches.length > 0 && (
        <section className={styles.today}>
          <h2 className={styles.sectionTitle}>
            Партии сегодня <Link to="/labels">открыть пульт →</Link>
          </h2>
          <ul className={styles.batches}>
            {todayBatches.map((b) => {
              const state = BATCH_STATE[batchState(b)];
              return (
                <li key={b.id}>
                  <span className={styles.batchNo}>№{b.number}</span>
                  <span>{formatTime(b.createdAt)}</span>
                  <span>{b.orderIds.length} шт.</span>
                  <span className={styles.batchNote}>{b.note}</span>
                  <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {notice && (
        <div className={styles.notice} role="status">
          {notice} <Link to="/labels">На пульт →</Link>
        </div>
      )}
    </>
  );
}
