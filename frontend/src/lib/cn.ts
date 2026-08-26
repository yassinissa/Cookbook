import { clsx, type ClassValue } from 'clsx'

/** Compose class names. Thin wrapper so call sites don't import clsx directly. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}
