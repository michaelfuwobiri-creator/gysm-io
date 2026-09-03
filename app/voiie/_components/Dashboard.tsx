"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "@/app/voiie/_components/api";
import { useToasts, ToastStack } from "@/app/voiie/_components/useToasts";
import { LeftPanel } from "@/app/voiie/_components/LeftPanel";
import { CenterPanel } from "@/app/voiie/_components/CenterPanel";
import { RightPanel } from "@/app/voiie/_components/RightPanel";
import { HunterPanel } from "@/app/voiie/_components/HunterPanel";
import type { LeadDetail, VoiieLead } from "@/app/voiie/_components/types";

// No realtime infra in this app (no Pusher/Supabase Realtime configured)
// -- a 20s poll is the same backstop voiie-prod used alongside Pusher,
// just promoted to the only update mechanism. Good enough for a
// single-operator dashboard; swap in something push-based later if
// hunting volume ever makes 20s feel slow.
const POLL_MS = 20_000;

export function Dashboard({ initialLeads }: { initialLeads: VoiieLead[] }) {
  const [leads, setLeads] = useState<VoiieLead[]>(initialLeads);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(initialLeads[0]?.id ?? null);
  const [activeLead, setActiveLead] = useState<LeadDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [search, setSearch] = useState("");
  const { toasts, push } = useToasts();

  const refetchLeads = useCallback(async () => {
    try {
      const data = await apiGet<{ leads: VoiieLead[] }>("/api/voiie/leads");
      setLeads(data.leads);
    } catch (err) {
      console.warn("refetchLeads failed:", err);
    }
  }, []);

  const refetchActiveLead = useCallback(
    async (leadId: string) => {
      setLoadingDetail(true);
      try {
        const data = await apiGet<LeadDetail>(`/api/voiie/leads/${leadId}`);
        setActiveLead(data);
      } catch (err) {
        push((err as Error).message, "cyan");
      } finally {
        setLoadingDetail(false);
      }
    },
    [push]
  );

  useEffect(() => {
    if (activeLeadId) refetchActiveLead(activeLeadId);
    else setActiveLead(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLeadId]);

  const activeLeadIdRef = useRef(activeLeadId);
  activeLeadIdRef.current = activeLeadId;

  useEffect(() => {
    const interval = setInterval(() => {
      refetchLeads();
      if (activeLeadIdRef.current) refetchActiveLead(activeLeadIdRef.current);
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [refetchLeads, refetchActiveLead]);

  const filteredLeads = leads.filter((l) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return l.handle.toLowerCase().includes(q) || (l.signal ?? "").toLowerCase().includes(q);
  });

  const stats = {
    leadsToday: leads.length,
    contacted: leads.filter((l) => ["contacted", "consulting", "demo_sent", "negotiating", "paid", "converted"].includes(l.status)).length,
    consulting: leads.filter((l) => l.status === "consulting").length,
    demoSent: leads.filter((l) => l.status === "demo_sent").length,
    paid: leads.filter((l) => l.status === "paid" || l.status === "converted").length,
  };

  return (
    <div className="overflow-x-auto overflow-y-hidden h-full">
      <div className="flex h-full" style={{ minWidth: 1360 }}>
        <LeftPanel
          leads={filteredLeads}
          activeLeadId={activeLeadId}
          setActiveLeadId={setActiveLeadId}
          search={search}
          setSearch={setSearch}
          stats={stats}
        />
        <CenterPanel
          lead={activeLead}
          loading={loadingDetail}
          onAnswered={() => activeLeadId && refetchActiveLead(activeLeadId)}
          onLeadsChanged={refetchLeads}
          pushToast={push}
        />
        <RightPanel
          lead={activeLead}
          onChanged={() => activeLeadId && refetchActiveLead(activeLeadId)}
          onLeadsChanged={refetchLeads}
          pushToast={push}
        />
        <HunterPanel stats={stats} onHunted={refetchLeads} pushToast={push} />
      </div>
      <ToastStack toasts={toasts} />
    </div>
  );
}
