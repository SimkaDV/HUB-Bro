import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ALL_SELECTED,
  BATCH_STATE,
  batchState,
  buildQueue,
  countBy,
  createBatch,
  describeSelection,
  filterQueue,
  formatTime,
  groupQueue,
  isToday,
  orderStage,
  sortQueue,
  useBatches,
  useServiceOrder,
  type QueueSelection,
} from "@/shared/fulfillment";
import { SERVICE_LABEL, useOrders } from "@/shared/orders";
import { useStock } from "@/shared/stock";
import { Button, PageHeader, StatTiles, StatusBadge } from "@/shared/ui";
import { ProblemList } from "./ProblemList/ProblemList";
import { QueueGroupCard } from "./QueueGroupCard/QueueGroupCard";
import { QueueSettings } from "./QueueSettings/QueueSettings";
import styles from "./PickingPage.module.css";

// Выбор «Что печатать» — удобство одного браузера, поэтому просто localStorage.
const SELECTION_KEY = "hubbro.picking.queue.v4";

function loadSelection(): QueueSelection {
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<QueueSelection>;
      const products = saved.products && typeof saved.products === "object" ? saved.products : null;
      const services = Array.isArray(saved.services) ? saved.services : null;
      return { products, services };
    }
  } catch {
    // Нет доступа или мусор — «Все».
  }
  return ALL_SELECTED;
}

export default function PickingPage() {
  const orders = useOrders();
  const batches = useBatches();
  const { models, categories } = useStock();
  const serviceOrder = useServiceOrder();
  const [selection, setSelection] = useState(loadSelection);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SELECTION_KEY, JSON.stringify(selection));
    } catch {
      // Не сохранилось — не страшно.
    }
  }, [selection]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  const queue = useMemo(
    () => buildQueue(orders, batches, models, categories, serviceOrder),
    [orders, batches, models, categories, serviceOrder],
  );
  const visible = useMemo(() => sortQueue(filterQueue(queue, selection)), [queue, selection]);
  const groups = groupQueue(visible);
  const visibleIds = new Set(visible.map((i) => i.order.id));
  const picked = [...selected].filter((id) => visibleIds.has(id));

  const stages = orders.map((o) => orderStage(o, batches));
  const active = stages.filter((s) => s && s !== "packed").length;
  const inBatches = stages.filter((s) => s === "inBatch" || s === "printed").length;
  const problems = orders.filter((_, i) => stages[i] === "problem");
  const byProduct = countBy(sortQueue(queue), (i) => i.order.product);
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
    createBatch(ordered, describeSelection(selection));
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
            detail: serviceOrder.map((s) => `${SERVICE_LABEL[s]} ${byService.get(s) ?? 0}`).join(" · "),
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
        selection={selection}
        onChange={setSelection}
        items={queue}
        modelOrder={models.map((m) => m.name)}
        sizeOrder={(name) => models.find((m) => m.name === name)?.sizes.map((s) => s.size) ?? []}
        serviceOrder={serviceOrder}
      />

      {groups.length === 0 ? (
        <p className={styles.empty}>
          {queue.length ? (
            "Под фильтр ничего не попало"
          ) : orders.length === 0 ? (
            <>
              Заказов пока нет — подтяните их на экране <Link to="/orders">«Заказы»</Link>.
            </>
          ) : (
            "Очередь пуста — всё отправлено на пульт"
          )}
        </p>
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
