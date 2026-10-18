import test from 'node:test';
import assert from 'node:assert/strict';
import {createSlackMirror,slackPayload,validSlackWebhook} from '../lib/slack.mjs';
import {createContactHandler} from '../lib/contact.mjs';
const url='https://hooks.slack.com/services/TEST/TEST/TEST';
const data={full_name:'Test <@U123> <!channel>',business_name:'@here',contact:'qa@example.invalid',message:'<https://example.invalid|click> & <!everyone> '+ 'x'.repeat(3000)};
test('visitor content is bounded plain text, with static notification text and no mentions syntax interpretation',()=>{
 const payload=slackPayload({...data,id:'abc'});
 assert.equal(payload.text,'New Kusinamate website inquiry');
 for(const block of payload.blocks){assert.equal(block.text.type,'plain_text');assert.equal(block.text.emoji,false);assert.ok(block.text.text.length<=3000)}
 assert.equal(payload.unfurl_links,false);assert.equal(payload.unfurl_media,false);
 assert.ok(JSON.stringify(payload).length<7000);
 assert.ok(!('channel' in payload));assert.ok(!('link_names' in payload));
});
test('webhook URLs restricted to Slack HTTPS service paths',()=>{
 assert.ok(validSlackWebhook(url));
 for(const bad of ['https://evil.invalid/services/a/b/c','http://hooks.slack.com/services/a/b/c',url+'?secret=x','https://user:pass@hooks.slack.com/services/a/b/c'])assert.equal(validSlackWebhook(bad),false);
});
test('one Slack attempt with redirects blocked; errors and timeout return safe outcomes',async()=>{
 for(const status of [200,400,429,500]){let calls=0;
 const send=createSlackMirror({url:()=>url,fetchImpl:async(target,options)=>{calls++;assert.equal(options.redirect,'error');assert.ok(options.signal);return {status}}});
 assert.equal((await send(data)).status,status===200?'accepted':status<500?'failed':'unknown');assert.equal(calls,1);
 }
 const send=createSlackMirror({url:()=>url,timeoutMs:5,fetchImpl:async(_,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('secret provider detail'))))});
 assert.deepEqual(await send(data),{status:'unknown'});
});
test('Slack failure preserves accepted email with one send per destination; SMTP failure still attempts Slack once',async()=>{
 for(const emailOK of [true,false]){let mails=0,slacks=0;
 const handler=createContactHandler({brand:'Kusinamate',recipient:'hello@kusinamate.com',origins:['https://kusinamate.com'],configured:()=>true,sharedRateCheck:async()=>({allowed:true}),send:async()=>{mails++;if(!emailOK)throw Error('SMTP');return {accepted:['hello@kusinamate.com']}},mirror:async()=>{slacks++;return {status:emailOK?'unknown':'accepted'}}});
 const response=await handler(new Request('https://kusinamate.com/api/contact',{method:'POST',headers:{origin:'https://kusinamate.com','content-type':'application/json'},body:JSON.stringify({...data,message:'Mock only'})}));
 assert.equal(response.status,emailOK?200:502);const body=await response.json();assert.equal(body.accepted,emailOK);assert.deepEqual(body.outcomes,{email:emailOK?'accepted':'unknown',slack:emailOK?'unknown':'accepted'});assert.equal(mails,1);assert.equal(slacks,1);
 }
});
