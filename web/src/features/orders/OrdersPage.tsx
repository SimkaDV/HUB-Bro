import { useMemo, useState } from "react";
import { GROUPS, useOrders, type OrderGroup } from "@/shared/orders";
import { Card, Input, PageHeader } from "@/shared/ui";
import { FilterChip } from "./FilterChip/FilterChip";
import { groupByDay, inPeriod, matchesQuery, PERIODS, type DateRange, type Period } from "./filter";
import { OrderRow } from "./OrderRow/OrderRow";
import styles from "./OrdersPage.module.css";

export default function OrdersPage() {
  const orders = useOrders();
  const [group, setGroup] = useState<OrderGroup>("active");
  const [period, setPeriod] = useState<Period>("all");
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const searching = query.trim() !== "";
  const inRange = useMemo(() => orders.filter((o) => inPeriod(o, period, range)), [orders, period, range]);

  // Поиск идёт по всем заказам: номер ищут, когда фильтры уже неважны.
  const visible = useMemo(() => {
    if (searching) return orders.filter((o) => matchesQuery(o, query));
    const match = GROUPS.find((g) => g.id === group)!.match;
    return inRange.filter(match);
  }, [orders, inRange, group, query, searching]);

  const days = groupByDay(visible);

  return (
    <>
      <PageHeader
        title="Заказы"
        subtitle="Тестовые данные, к Авито подключим позже"
        actions={
          <Input
            type="search"
            className={styles.search}
            placeholder="Номер Авито или товар"
            aria-label="Поиск заказа"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
      />

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

      {days.length === 0 ? (
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
