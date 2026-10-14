import { redirect } from "next/navigation";

// M2 replaces this with a client check: /scan when the closet is empty, else /today.
export default function Home() {
  redirect("/today");
}
