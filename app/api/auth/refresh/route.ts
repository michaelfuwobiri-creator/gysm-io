export async function GET(){ return Response.json({ ok: true, route: 'api/auth/refresh' }) }
export async function POST(req: Request){ const b = await req.json().catch(()=>({})); return Response.json({ ok: true, jobId: 'job_'+Date.now(), project: b, status: 'queued' }) }
export async function PATCH(req: Request){ return Response.json({ ok: true }) }
export async function DELETE(){ return Response.json({ ok: true }) }
