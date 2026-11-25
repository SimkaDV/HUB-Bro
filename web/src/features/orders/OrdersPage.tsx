import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { collectFromAvito, useAvitoLink } from "@/shared/avito";
import { isActive, useBatches } from "@/shared/fulfillment";
import { GROUPS, useOrders, type OrderGroup } from "@/shared/orders";
import { orderModel, useStock } from "@/shared/stock";
import { Button, Card, FilterChip, Input, PageHeader } from "@/shared/ui";
import { AvitoSync } from "./AvitoSync/AvitoSync";
import { formatDateTime, groupByDay, inPeriod, matchesQuery, PERIODS, type DateRange, type Period } from "./filter";
import { OrderRow } from "./OrderRow/OrderRow";
import styles from "./OrdersPage.module.css";

export default function OrdersPage() {
  const orders = useOrders();
  const avito = useAvitoLink();
  const { models } = useStock();
  const batches = useBatches();
  // «К заказу» из комплектации: /orders?order=<номер> — ищем по номеру и сразу раскрываем.
  const [params] = useSearchParams();
  const linked = params.get("order");
  const [group, setGroup] = useState<OrderGroup>("active");
  const [period, setPeriod] = useState<Period>("all");
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [query, setQuery] = useState(linked ?? "");
  const [openId, setOpenId] = useState<string | null>(linked);
  const inBatch = useMemo(() => new Set(batches.filter(isActive).flatMap((b) => b.orderIds)), [batches]);

  const searching = query.trim() !== "";
  const inRange = useMemo(() => orders.filter((o) => inPeriod(o, period, range)), [orders, period, range]);

  // Поиск идёт по всем заказам: номер ищут, когда фильтры уже неважны.
  const visible = useMemo(() => {
    if (searching) return orders.filter((o) => matchesQuery(o, query));
    const match = GROUPS.find((g) => g.id === group)!.match;
    return inRange.filter(match);
  }, [orders, inRange, group, query, searching]);

  const days = groupByDay(visible);
  const lastSync = orders.reduce<string | undefined>((max, o) => (o.syncedAt && (!max || o.syncedAt > max) ? o.syncedAt : max), undefined);

  return (
    <>
      <PageHeader
        title="Заказы"
        subtitle={lastSync ? `Из Авито · сверено ${formatDateTime(lastSync)}` : "Заказы из Авито — подтяните первые"}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={avito.collecting}
              title={avito.version ? undefined : "Расширение не отвечает — Настройки → Расширение Авито"}
              onClick={collectFromAvito}
            >
              {avito.collecting ? "Подтягиваю…" : "Подтянуть из Авито"}
            </Button>
            <Input
              type="search"
              className={styles.search}
              placeholder="Номер Авито или товар"
              aria-label="Поиск заказа"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </>
        }
      />

      <AvitoSync />

      <div className={styles.filters}>
        <div className={styles.chips} role="group" aria-label="Статус">
          {GROUPS.map((g) => {
            const count = inRange.filter(g.match).length;
            return (
              <FilterChip
                key={g.id}
                label={g.label}
                count={count}
                selected={!searching && group === g.id}
                alert={g.id === "problems" && count > 0}
                onClick={() => {
                  setGroup(g.id);
                  setQuery("");
                }}
              />
            );
          })}
        </div>

        <div className={styles.chips} role="group" aria-label="Период">
          {PERIODS.map((p) => (
            <FilterChip key={p.id} label={p.label} selected={period === p.id} onClick={() => setPeriod(p.id)} />
          ))}
          {period === "custom" && (
            <span className={styles.range}>
              <Input type="date" aria-label="С" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
              —
              <Input type="date" aria-label="По" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </span>
          )}
        </div>
      </div>

      {searching && <p className={styles.note}>Ищем по всем заказам, фильтры не действуют</p>}

      {orders.length === 0 ? (
        <Card className={styles.empty}>
          <p className={styles.emptyTitle}>Заказов пока нет</p>
          <p>
            Заказы приходят из кабинета Авито через расширение Chrome: установите его в{" "}
            <Link to="/settings">Настройках → Расширение Авито</Link> и нажмите «Подтянуть из Авито».
          </p>
          {models.length === 0 && (
            <p>
              Сначала заведите модели на <Link to="/stock">складе</Link>, иначе заказы встанут с проблемой «Товар не
              выбран».
            </p>
          )}
        </Card>
      ) : days.length === 0 ? (
        <Card className={styles.empty}>{searching ? "Ничего не нашли" : "Заказов нет"}</Card>
      ) : (
        <div className={styles.days}>
          {days.map((day) => (
            <section key={day.key}>
              <h2 className={styles.dayTitle}>
                {day.title} <span className={styles.dayCount}>{day.orders.length}</span>
              </h2>
              <Card className={styles.list}>
                <ul>
                  {day.orders.map((o) => (
                    <OrderRow
                      key={o.id}
                      order={o}
                      model={orderModel(o, models)}
                      inBatch={inBatch.has(o.id)}
                      open={openId === o.id}
                      onToggle={() => setOpenId(openId === o.id ? null : o.id)}
                    />
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
