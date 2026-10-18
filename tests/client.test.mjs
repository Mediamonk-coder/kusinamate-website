import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../direct-contact.js',import.meta.url),'utf8');
function setup(fetcher,enabled=true){
 let submit,calls=0;
 const values={full_name:'Local QA',contact:'qa@example.com',business_name:'',partner_type:'General inquiry',message:'Local unit test',website:''};
 const status={dataset:{},focus(){}},button={disabled:false};
 const form={querySelector:q=>q==='[role="status"]'?status:button,querySelectorAll:()=>[],addEventListener:(_,fn)=>submit=fn,append(){},reportValidity:()=>true};
 const context={document:{querySelector:q=>q==='form'?form:null,createElement:()=>({})},window:{BRAND_CONTACT_CONFIG:{endpoint:'/api/contact',enabled}},FormData:class{get(k){return values[k]}},Date,AbortController,setTimeout,clearTimeout,fetch:async(...a)=>{calls++;return fetcher(...a)}};
 vm.runInNewContext(source,context);
 return {submit:()=>submit({preventDefault(){}}),status,button,values,calls:()=>calls};
}
test('HTML edge 429 gets cooldown before JSON parsing and preserves form',async()=>{const app=setup(async()=>new Response('<html>rate limited</html>',{status:429}));await app.submit();assert.match(app.status.textContent,/15 minutes/);await app.submit();assert.equal(app.calls(),1);assert.equal(app.button.disabled,false);assert.equal(app.values.contact,'qa@example.com')});
test('unavailable static/server route does not claim success or retry automatically',async()=>{for(const code of [404,405,503]){const app=setup(async()=>new Response('',{status:code}));await app.submit();assert.match(app.status.textContent,/unavailable/);assert.equal(app.calls(),1);assert.equal(app.button.disabled,false)}});
test('acceptance is truthful and repeated same-page submission suppressed',async()=>{const app=setup(async()=>Response.json({success:true,accepted:true,id:'test-id'}));await app.submit();assert.match(app.status.textContent,/accepted for email delivery/);await app.submit();assert.equal(app.calls(),1)});
test('network error, malformed success, SMTP timeout and redirect failure stay uncertain without retry',async()=>{for(const fetcher of [async()=>{throw new Error('network')},async()=>new Response('<html>bad gateway</html>'),async()=>Response.json({success:false},{status:502}),async()=>Response.json({success:true})]){const app=setup(fetcher);await app.submit();assert.match(app.status.textContent,/could not confirm/);await app.submit();assert.equal(app.calls(),1);assert.equal(app.button.disabled,false)}});
test('concurrent double click sends only once',async()=>{let finish;const app=setup(()=>new Promise(resolve=>finish=resolve));const pending=app.submit();await app.submit();assert.equal(app.calls(),1);finish(Response.json({success:true,accepted:true,id:'test-id'}));await pending;assert.equal(app.button.disabled,false)});

test('disabled preview form cannot issue requests even on programmatic submit',async()=>{const app=setup(async()=>{throw new Error('must not fetch')},false);await app.submit();assert.equal(app.calls(),0);assert.equal(app.button.disabled,true)});
