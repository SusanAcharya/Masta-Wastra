import { ICONS, type IconName } from "./icon-data";

type Props = {
  name: IconName;
  size?: number;
  /** Visible meaning for icon-only use. Omit when a text label sits beside the icon. */
  label?: string;
  className?: string;
};

// Lounge Icons grammar: 24px grid, stroke 1.75, round caps and joins, currentColor.
export function Icon({ name, size = 24, label, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}

export type { IconName };
