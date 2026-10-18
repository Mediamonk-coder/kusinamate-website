import { createHash, randomUUID } from 'node:crypto';

// Independent brand endpoint. In-memory throttle is a secondary guard only:
// The owner may explicitly defer shared protection via the runtime adapter.
export function createContactHandler({ brand, recipient, origins, send, mirror, configured, sharedRateCheck, clock = Date.now }) {
  const attempts = new Map();
  const json = (status, body, headers = {}) => Response.json(body, {status, headers:{'Cache-Control':'no-store',...headers}});
  const fail = (status, error, headers) => json(status,{success:false,error},headers);
  return async function contact(request) {
    if(request.method !== 'POST') return fail(405,'Use POST.',{Allow:'POST'});
    if(!origins.includes(request.headers.get('origin'))) return fail(403,'This website is not allowed.');
    if(!(request.headers.get('content-type') || '').startsWith('application/json')) return fail(415,'Use JSON.');
    if(Number(request.headers.get('content-length') || 0)>12000) return fail(413,'Message is too large.');
    let body;
    try { const raw=await request.text();if(Buffer.byteLength(raw)>12000)return fail(413,'Message is too large.');body=JSON.parse(raw); } catch {return fail(400,'Check the form details.');}
    if(!body || typeof body !== 'object' || Array.isArray(body))return fail(400,'Check the form details.');
    if(body.website)return fail(400,'We could not accept this inquiry. Please email our team.');
    const limits={full_name:100,business_name:150,contact:254,partner_type:100,message:3000};
    const data={};
    for(const [key,max] of Object.entries(limits)) {
      if(body[key]!==undefined && typeof body[key]!=='string')return fail(400,'Check the form details.');
      data[key]=(body[key]||'').trim();
      if(data[key].length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(data[key]))return fail(400,'Check the form details.');
    }
    const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contact);
    const phone=/^(09|\+639)\d{9}$/.test(data.contact.replace(/[\s()-]/g,''));
    if(data.full_name.length<2 || !data.contact || (!email&&!phone) || /[\r\n]/.test(data.contact))return fail(400,'Enter your name and a valid email or Philippine mobile number.');
    data.partner_type ||= 'General inquiry';
    if(!configured())return fail(503,'The inquiry form is unavailable. Please email our team.');
    // The adapter requires enforced protection or the explicit temporary launch mode.
    try {
      const shared=await sharedRateCheck(request);
      if(shared?.allowed===false)return fail(429,'Please wait before sending another inquiry.',{'Retry-After':'600'});
      if(shared?.allowed!==true)throw new Error('Invalid shared protection response');
    } catch { return fail(503,'The inquiry form is unavailable. Please email our team.'); }
    const now=clock();
    for(const [key,value] of attempts)if(value.until<=now)attempts.delete(key);
    // The contact digest avoids trusting a client-supplied forwarding header.
    const normalizedContact=email?data.contact.toLowerCase():data.contact.replace(/[\s()-]/g,'').replace(/^09/,'+639');
    const key=createHash('sha256').update(normalizedContact).digest('hex');
    const record=attempts.get(key)||{count:0,until:now+900000};
    if(record.count>=3 || attempts.size>=5000)return fail(429,'Please wait before sending another inquiry.',{'Retry-After':'900'});
    record.count++;attempts.set(key,record);
    const id=randomUUID();
    // Each destination is attempted once. Never retry email because Slack failed.
    const [mailResult, slackResult] = await Promise.allSettled([
      Promise.resolve().then(()=>send({to:recipient,replyTo:email?data.contact:undefined,subject:`${brand}: website inquiry`,text:`Reference: ${id}\nBrand: ${brand}\nName: ${data.full_name}\nBusiness: ${data.business_name||'Not supplied'}\nContact: ${data.contact}\nInterest: ${data.partner_type}\n\n${data.message}`})),
      Promise.resolve().then(()=>mirror ? mirror({id,brand,...data}) : {status:'disabled'})
    ]);
    const emailAccepted=mailResult.status==='fulfilled' && mailResult.value?.accepted?.some(address=>String(address).toLowerCase()===recipient.toLowerCase());
    const slackStatus=slackResult.status==='fulfilled' && ['accepted','failed','disabled'].includes(slackResult.value?.status) ? slackResult.value.status : 'unknown';
    const outcomes={email:emailAccepted?'accepted':'unknown',slack:slackStatus};
    // Only reference/status metadata: never log provider errors, visitor text or secrets.
    if(!emailAccepted || (mirror && slackStatus!=='accepted')) console.error('Inquiry destination outcome', {id,...outcomes});
    if(emailAccepted)return json(200,{success:true,accepted:true,id,outcomes});
    return json(502,{success:false,accepted:false,id,outcomes,error:'We could not confirm email delivery. Please contact our team with this reference before resending.'});
  };
}
