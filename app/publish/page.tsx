"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

function PublishContent(){
  const params = useSearchParams();
  const id = params.get("id");
  const [html,setHtml]=useState("");
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    if(!id){ setLoading(false); return; }
    fetch("/api/projects?id="+id).then(r=>r.json()).then(d=>{
      setHtml(d?.html || "");
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[id]);
  if(loading) return <div>Loading publishing site... id: {id}</div>;
  if(!html) return <div>Not found: {id}</div>;
  return <div dangerouslySetInnerHTML={{__html: html}} />;
}

export default function PublishPage(){
  return <Suspense fallback={<div>Loading...</div>}><PublishContent /></Suspense>;
}