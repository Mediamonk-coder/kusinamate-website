// Webhook stays in server environment. No provider error or URL is logged.
export function validSlackWebhook(value) {
  try {
    const url=new URL(value);
    return url.protocol==='https:' && url.hostname==='hooks.slack.com' && !url.port && !url.username && !url.password && !url.search && !url.hash && /^\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(url.pathname);
  } catch {return false;}
}
export function slackPayload(data) {
  // All visitor content uses plain_text, never mrkdwn. No channel/user mentions,
  // link expansion, or visitor-controlled top-level notification text.
  const safe=(value,max)=>String(value||'Not supplied').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
  const details=`Reference: ${safe(data.id,36)}\nName: ${safe(data.full_name,100)}\nBusiness: ${safe(data.business_name,150)}\nContact: ${safe(data.contact,254)}\nInterest: ${safe(data.partner_type,100)}`;
  const message=safe(data.message,3000);
  return {text:'New Kusinamate website inquiry',unfurl_links:false,unfurl_media:false,
    blocks:[{type:'section',text:{type:'plain_text',text:'New Kusinamate website inquiry',emoji:false}},
      {type:'section',text:{type:'plain_text',text:details,emoji:false}},
      ...[message.slice(0,1500),message.slice(1500)].filter(Boolean).map(text=>({type:'section',text:{type:'plain_text',text,emoji:false}}))]};
}
export function createSlackMirror({url,fetchImpl=fetch,timeoutMs=7000}) {
  return async data=>{
    const target=url();
    if(!validSlackWebhook(target))return {status:'failed'};
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const response=await fetchImpl(target,{method:'POST',redirect:'error',signal:controller.signal,
        headers:{'Content-Type':'application/json'},body:JSON.stringify(slackPayload(data))});
      // HTTP acceptance only; not proof a human saw the message. Do not read/log
      // response bodies. Unexpected or transient responses are conservatively unknown.
      if(response.status===200)return {status:'accepted'};
      return {status:response.status>=400&&response.status<500?'failed':'unknown'};
    } catch {return {status:'unknown'};}
    finally {clearTimeout(timer);}
  };
}
