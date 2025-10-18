"use client";

import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = {
  variant?: ButtonVariant;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant = "primary",
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const className = `${styles.button} ${styles[variant]}`;

  return (
    <button type={type} className={className} {...rest}>
      {children}
    </button>
  );
}
