import { Link } from "react-router-dom";
import { linkListing, listingStatus, sortListings, useListings } from "@/shared/listings";
import { formatRub } from "@/shared/stock";
import type { Model } from "@/shared/stock";
import type { ChangeSettings } from "../store";
import styles from "./ModelListings.module.css";

type Props = {
  model: Model;
  change: ChangeSettings;
};

/** Объявления Авито, привязанные к модели. Отвязать — крестиком, привязать — в разделе «Объявления». */
export function ModelListings({ model, change }: Props) {
  const listings = sortListings(useListings().listings.filter((l) => l.productId === model.id));

  if (listings.length === 0) {
    return (
      <p className={styles.hint}>
        Ни одно объявление не привязано. Привязать можно в разделе <Link to="/listings">«Объявления»</Link>.
      </p>
    );
  }

  return (
    <ul className={styles.list}>
      {listings.map((l) => {
        const status = listingStatus(l);
        return (
          <li key={l.id} className={styles.row}>
            <a className={styles.title} href={l.url} target="_blank" rel="noreferrer" title="Открыть на Авито">
              {l.title}
            </a>
            <span className={styles.meta}>
              {formatRub(l.price)} · {status.label} · ID {l.id}
            </span>
            <button
              type="button"
              className={styles.remove}
              aria-label={`Отвязать объявление «${l.title}»`}
              title="Отвязать"
              onClick={() => {
                linkListing(l.id, null);
                // Запись в историю склада: настройки модели поменялись.
                change(`«${model.name}»: отвязано объявление «${l.title}» (ID ${l.id})`, () => ({}));
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
