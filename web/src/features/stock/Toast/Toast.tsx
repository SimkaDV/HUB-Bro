import { useEffect, useState } from "react";
import styles from "./Toast.module.css";

type Props = {
  /** Новый текст — новое уведомление; id меняется, даже если текст тот же. */
  message: { id: number; text: string } | null;
};

const SHOW_MS = 2600;

/** Короткое уведомление внизу экрана, исчезает само. */
export function Toast({ message }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), SHOW_MS);
    return () => window.clearTimeout(t);
  }, [message]);

  if (!message) return null;
  return (
    <div className={`${styles.toast} ${visible ? styles.visible : ""}`} role="status">
      {message.text}
    </div>
  );
}
