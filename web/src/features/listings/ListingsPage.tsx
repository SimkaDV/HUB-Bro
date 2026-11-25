import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useConnections } from "@/shared/connections";
import { useOrders } from "@/shared/orders";
import { isActive, linkedModel, linkListing, listingsCount, sortListings, syncListings, useListings } from "@/shared/listings";
import { useStock } from "@/shared/stock";
import { Button, Card, FilterChip, Input, PageHeader } from "@/shared/ui";
import { ListingCard } from "./ListingCard/ListingCard";
import { formatDateTime } from "./format";
import styles from "./ListingsPage.module.css";

type Filter = "unlinked" | "active" | "all";

// Сами подтягиваем свежие объявления при заходе, если с прошлого обновления прошло больше 10 минут.
const AUTO_SYNC_AFTER = 10 * 60_000;

export default function ListingsPage() {
  const { listings, syncedAt } = useListings();
  const { models, categories } = useStock();
  const avito = useConnections().avito.values;
  const hasKeys = Boolean(avito.clientId && avito.clientSecret);

  const [filter, setFilter] = useState<Filter | null>(null);
  // «выбрать товар →» из заказа открывает страницу сразу с поиском по ID объявления.
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const orders = useOrders();
  /** Сколько заказов ждут, пока объявлению выберут товар. */
  const waiting = (id: string) => orders.filter((o) => o.itemId === id && o.problem === "noModel").length;
  const [openId, setOpenId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await syncListings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось обновить объявления");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (hasKeys && (!syncedAt || Date.now() - Date.parse(syncedAt) > AUTO_SYNC_AFTER)) void sync();
  }, []); // только при заходе на страницу

  const isLinked = (l: (typeof listings)[number]) => Boolean(linkedModel(l, models));
  const unlinked = listings.filter((l) => !isLinked(l));
  // Пока есть непривязанные — сначала показываем их.
  const current: Filter = filter ?? (unlinked.length > 0 ? "unlinked" : "all");

  const searching = query.trim() !== "";
  const q = query.trim().toLowerCase().replace(/\s/g, "");
  const base = searching
    ? listings.filter((l) => l.id.includes(q) || l.title.toLowerCase().replace(/\s/g, "").includes(q))
    : current === "unlinked"
      ? unlinked
      : current === "active"
        ? listings.filter(isActive)
        : listings;
  // Первыми — объявления, по которым уже ждут заказы.
  const visible = sortListings(base).sort((a, b) => waiting(b.id) - waiting(a.id));

  const subtitle = syncing
    ? "Обновляем с Авито…"
    : syncedAt
      ? `Обновлено ${formatDateTime(syncedAt)} · ${listingsCount(listings.length)}`
      : "Ещё не обновляли с Авито";

  return (
    <>
      <PageHeader
        title="Объявления"
        subtitle={subtitle}
        actions={
          <>
            <Input
              type="search"
              className={styles.search}
              placeholder="Название или ID"
              aria-label="Поиск объявления"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button onClick={sync} disabled={syncing || !hasKeys}>
              {syncing ? "Обновляем…" : "Обновить с Авито"}
            </Button>
          </>
        }
      />

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {!hasKeys && (
        <Card className={styles.empty}>
          Чтобы подтянуть объявления, внесите ключи Авито в <Link to="/settings">Настройках</Link>.
        </Card>
      )}

      {listings.length > 0 && (
        <div className={styles.chips} role="group" aria-label="Какие объявления показать">
          <FilterChip
            label="Без товара"
            count={unlinked.length}
            alert={unlinked.length > 0}
            selected={!searching && current === "unlinked"}
            onClick={() => {
              setFilter("unlinked");
              setQuery("");
            }}
          />
          <FilterChip
            label="Активные"
            count={listings.filter(isActive).length}
            selected={!searching && current === "active"}
            onClick={() => {
              setFilter("active");
              setQuery("");
            }}
          />
          <FilterChip
            label="Все"
            count={listings.length}
            selected={!searching && current === "all"}
            onClick={() => {
              setFilter("all");
              setQuery("");
            }}
          />
        </div>
      )}

      {hasKeys && listings.length === 0 && !syncing && !error && (
        <p className={styles.note}>Объявлений пока нет. Нажмите «Обновить с Авито».</p>
      )}
      {listings.length > 0 && visible.length === 0 && (
        <p className={styles.note}>
          {searching ? "Ничего не нашли." : current === "unlinked" ? "Все объявления привязаны к товарам." : "Здесь пусто."}
        </p>
      )}

      <div className={styles.grid}>
        {visible.map((l) => (
          <ListingCard
            key={l.id}
            listing={l}
            model={linkedModel(l, models)}
            models={models}
            categories={categories}
            waiting={waiting(l.id)}
            open={openId === l.id}
            onToggle={() => setOpenId(openId === l.id ? null : l.id)}
            onLink={(productId) => linkListing(l.id, productId)}
          />
        ))}
      </div>
    </>
  );
}
