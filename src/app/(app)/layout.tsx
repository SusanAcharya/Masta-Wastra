import { TabBar } from "@/components/lounge/ios-glass-tab-bar/tab-bar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main id="main" className="page">
        {children}
      </main>
      <TabBar />
    </>
  );
}
