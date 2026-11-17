import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ALL_SELECTED,
  buildQueue,
  createBatch,
  describeSelection,
  filterQueue,
  groupQueue,
  QueueFilter,
  sortQueue,
  useBatches,
  useServiceOrder,
} from "@/shared/fulfillment";
import { useOrders } from "@/shared/orders";
import { useStock } from "@/shared/stock";
import { Button, Collapse } from "@/shared/ui";
import styles from "./QuickPrint.module.css";

/**
 * Быстрая печать: партия из очереди прямо на пульте, без комплектации. Сначала состав, потом партия.
 * Выбор не запоминается — при заходе всегда «Все». Описание — docs/PICKING.md, раздел 8.
 */
export function QuickPrint() {
  const orders = useOrders();
  const batches = useBatches();
  const { models, categories } = useStock();
  const serviceOrder = useServiceOrder();
  const [selection, setSelection] = useState(ALL_SELECTED);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  const queue = useMemo(
    () => buildQueue(orders, batches, models, categories, serviceOrder),
    [orders, batches, models, categories, serviceOrder],
  );
  // Состав пересчитывается вживую: если очередь изменилась до подтверждения, видно сразу.
  const picked = useMemo(() => sortQueue(filterQueue(queue, selection)), [queue, selection]);
  const groups = groupQueue(picked);
  const nextNumber = batches.reduce((max, b) => Math.max(max, b.number), 0) + 1;

  const confirm = () => {
    const number = createBatch(
      picked.map((i) => i.order.id),
      describeSelection(selection),
    );
    if (number === undefined) return;
    setPreviewOpen(false);
    // Следующая партия — снова со «Все»: старый выбор под остаток очереди обычно уже не подходит.
    setSelection(ALL_SELECTED);
    setNotice(`Партия №${number} на пульте: ${picked.length} шт.`);
  };

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          Быстрая печать <span className={styles.count}>в очереди {queue.length}</span>
        </h2>
        {queue.length > 0 && !previewOpen && (
          <Button disabled={picked.length === 0} onClick={() => setPreviewOpen(true)}>
            Собрать партию ({picked.length})
          </Button>
        )}
      </div>

      {queue.length === 0 ? (
        <p className={styles.empty}>
          {orders.length === 0 ? (
            <>
              Заказов пока нет — подтяните их на экране <Link to="/orders">«Заказы»</Link>.
            </>
          ) : (
            "Очередь пуста — всё на пульте"
          )}
        </p>
      ) : (
        <>
          <QueueFilter
            selection={selection}
            onChange={setSelection}
            items={queue}
            modelOrder={models.map((m) => m.name)}
            sizeOrder={(name) => models.find((m) => m.name === name)?.sizes.map((s) => s.size) ?? []}
            serviceOrder={serviceOrder}
          />
          {picked.length === 0 && <p className={styles.hint}>Ничего не выбрано</p>}
        </>
      )}

      <Collapse open={previewOpen && picked.length > 0} className={styles.preview}>
        <span className={styles.caption}>Состав партии в порядке печати</span>
        <ul className={styles.groups}>
          {groups.map((g) => (
            <li key={g.key}>
              <span>{g.title}</span>
              <span className={styles.qty}>×{g.items.length}</span>
            </li>
          ))}
        </ul>
        <p className={styles.total}>
          {groups.length} {plural(groups.length, "группа", "группы", "групп")} · {picked.length} шт.
        </p>
        <div className={styles.actions}>
          <Button onClick={confirm}>Создать партию №{nextNumber}</Button>
          <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
            Отмена
          </Button>
        </div>
      </Collapse>

      {notice && (
        <p className={styles.notice} role="status">
          {notice} — ниже в «На пульте»
        </p>
      )}
    </section>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}
