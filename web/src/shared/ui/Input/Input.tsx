import type { InputHTMLAttributes } from "react";
import styles from "./Input.module.css";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function Input({ label, className, id, ...rest }: Props) {
  const input = <input id={id} className={[styles.input, className].filter(Boolean).join(" ")} {...rest} />;
  if (!label) return input;
  return (
    <label className={styles.field} htmlFor={id}>
      <span className={styles.label}>{label}</span>
      {input}
    </label>
  );
}
