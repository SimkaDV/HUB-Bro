import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({ variant = "primary", className, type = "button", ...rest }: Props) {
  const classes = [styles.button, styles[variant], className].filter(Boolean).join(" ");
  return <button type={type} className={classes} {...rest} />;
}
