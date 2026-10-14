import { Icon } from "@/components/icons/icon";
import s from "./garment-still.module.css";

export function GarmentStill({ caption }: { caption: string }) {
  return (
    <figure className={s.figure} aria-hidden="true">
      <span className={s.hanger}>
        <Icon name="hanger" size={48} />
      </span>
      <span className={s.drape} />
      <span className={s.neck} />
      <figcaption className={s.caption}>{caption}</figcaption>
    </figure>
  );
}
