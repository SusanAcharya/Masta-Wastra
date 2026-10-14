"use client";

import { motion } from "motion/react";
import { useEffect } from "react";
import { haptic } from "@/lib/motion";
import s from "./lift.module.css";

// The signature moment (9.4). The cutout keeps a layoutId, so when the parent moves it to
// the contact sheet, Motion flies it there (step 4).
export function Lift({
  id,
  photoUrl,
  cutoutUrl,
  calm,
  onDone,
}: {
  id: string;
  photoUrl: string;
  cutoutUrl: string;
  calm: boolean;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(
      () => {
        haptic();
        onDone();
      },
      calm ? 260 : 1150,
    );
    return () => clearTimeout(t);
  }, [calm, onDone]);

  return (
    <div className={`${s.stage} ${calm ? s.calm : ""}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl} alt="" className={s.photo} />
      <motion.img
        layoutId={`cut-${id}`}
        src={cutoutUrl}
        alt=""
        className={s.cut}
        initial={false}
        animate={
          calm
            ? undefined
            : {
                scale: [1, 1, 1.04],
                filter: [
                  "drop-shadow(0 0 0 rgba(0,0,0,0))",
                  "drop-shadow(0 0 0 rgba(0,0,0,0))",
                  "drop-shadow(0 14px 16px rgba(42,33,27,0.28))",
                ],
              }
        }
        transition={{ duration: 1.0, times: [0, 0.7, 1], ease: [0.2, 0.7, 0.2, 1] }}
      />
      <span className={s.beam} />
    </div>
  );
}
