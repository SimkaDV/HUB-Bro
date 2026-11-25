import { useEffect, useState } from "react";
import { fetchListingDetails, listingStatus, type Listing, type ListingDetails } from "@/shared/listings";
import { formatRub, type Category, type Model } from "@/shared/stock";
import { Collapse, StatusBadge } from "@/shared/ui";
import { formatDate } from "../format";
import { ProductPicker } from "../ProductPicker/ProductPicker";
import styles from "./ListingCard.module.css";

type Props = {
  listing: Listing;
  /** Модель, к которой привязано. Нет — объявление без товара. */
  model?: Model;
  models: Model[];
  categories: Category[];
  /** Заказы, которые ждут, пока выберут товар. */
  waiting: number;
  open: boolean;
  onToggle: () => void;
  onLink: (productId: string | null) => void;
};

/** Карточка объявления: статус, цена, название, выбор товара. По клику раскрываются подробности. */
export function ListingCard({ listing, model, models, categories, waiting, open, onToggle, onLink }: Props) {
  const status = listingStatus(listing);
  const stats = listing.stats;

  return (
    <article className={`${styles.card} ${open ? styles.open : ""}`}>
      <button type="button" className={styles.head} aria-expanded={open} onClick={onToggle}>
        <span className={styles.badges}>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          {!model && <StatusBadge tone="warning">Без товара</StatusBadge>}
          {!model && waiting > 0 && <StatusBadge tone="danger">⚠ Ждут заказы: {waiting}</StatusBadge>}
        </span>
        <span className={styles.price}>{formatRub(listing.price)}</span>
        <span className={styles.title}>{listing.title}</span>
        {stats && (
          <span className={styles.stats}>
            {stats.views} просм. · {stats.contacts} конт. · {stats.favorites} в избр. за 30 дней
          </span>
        )}
      </button>

      <ProductSelect listing={listing} model={model} models={models} categories={categories} onLink={onLink} />

      <Collapse open={open} className={styles.details}>
        <Details listing={listing} />
      </Collapse>
    </article>
  );
}

function ProductSelect({ listing, model, models, categories, onLink }: Omit<Props, "open" | "onToggle" | "waiting">) {
  const id = `listing-model-${listing.id}`;
  return (
    <div className={styles.product}>
      <label htmlFor={id}>Товар</label>
      <ProductPicker id={id} value={model} models={models} categories={categories} onChange={onLink} />
    </div>
  );
}

function Details({ listing }: { listing: Listing }) {
  const [details, setDetails] = useState<ListingDetails | "loading" | "failed">("loading");

  useEffect(() => {
    let alive = true;
    fetchListingDetails(listing.id)
      .then((d) => alive && setDetails(d))
      .catch(() => alive && setDetails("failed"));
    return () => {
      alive = false;
    };
  }, [listing.id]);

  const placed =
    details === "loading"
      ? "загружаем…"
      : details === "failed"
        ? "не получилось загрузить"
        : details.startTime
          ? `${formatDate(details.startTime)}${details.finishTime ? `, показывается до ${formatDate(details.finishTime)}` : ""}`
          : "—";

  return (
    <dl className={styles.facts}>
      <dt>ID на Авито</dt>
      <dd className={styles.num}>{listing.id}</dd>
      <dt>Размещено</dt>
      <dd>{placed}</dd>
      {listing.category && (
        <>
          <dt>Категория</dt>
          <dd>{listing.category}</dd>
        </>
      )}
      {listing.address && (
        <>
          <dt>Адрес</dt>
          <dd>{listing.address}</dd>
        </>
      )}
      <dt>У нас с</dt>
      <dd>
        {formatDate(listing.firstSeenAt)}
        {listing.linkedAt ? `, товар выбран ${formatDate(listing.linkedAt)}` : ""}
      </dd>
      {listing.goneAt && (
        <>
          <dt>Пропало с Авито</dt>
          <dd>{formatDate(listing.goneAt)}</dd>
        </>
      )}
      <dd className={styles.link}>
        <a href={listing.url} target="_blank" rel="noreferrer">
          Открыть на Авито ↗
        </a>
      </dd>
    </dl>
  );
}
