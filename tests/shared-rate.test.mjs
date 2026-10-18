import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedRateCheck} from '../lib/shared-rate.mjs';
const env={VERCEL:'1',NODE_ENV:'production',CONTACT_RATE_LIMIT_READY:'true'};
const request=()=>new Request('https://brand.example/api/contact',{headers:{'x-real-ip':'192.0.2.1',cookie:'private=test'}});
test('shared SDK uses fixed rule, trusted host/IP, bounded timeout and no customer data',async()=>{let args;const check=createSharedRateCheck({env,hosts:['brand.example'],check:async(...a)=>{args=a;return {rateLimited:false}}});assert.equal((await check(request())).allowed,true);assert.equal(args[0],'website-contact');assert.equal(args[1].timeout,1500);assert.deepEqual(Object.keys(args[1].headers).sort(),['host','x-real-ip']);});
test('shared SDK denial and all error responses fail closed',async()=>{for(const result of [{rateLimited:false,error:'not-found'},{rateLimited:true,error:'blocked'},{},null]){const check=createSharedRateCheck({env,hosts:['brand.example'],check:async()=>result});await assert.rejects(()=>check(request()))}const check=createSharedRateCheck({env,hosts:['brand.example'],check:async()=>({rateLimited:true})});assert.equal((await check(request())).allowed,false)});
test('local development, missing readiness, untrusted host and missing edge IP never query SDK',async()=>{let calls=0;for(const override of [{VERCEL:''},{NODE_ENV:'development'},{CONTACT_RATE_LIMIT_READY:'false'}]){const check=createSharedRateCheck({env:{...env,...override},hosts:['brand.example'],check:async()=>{calls++}});await assert.rejects(()=>check(request()))}const check=createSharedRateCheck({env,hosts:['brand.example'],check:async()=>{calls++}});await assert.rejects(()=>check(new Request('https://evil.example/api/contact')));await assert.rejects(()=>check(new Request('https://brand.example/api/contact')));assert.equal(calls,0)});

test('explicit temporary mode skips SDK but retains trusted runtime and host checks',async()=>{
 let calls=0;const opts={env:{...env,CONTACT_RATE_LIMIT_READY:'false',CONTACT_RATE_LIMIT_MODE:'temporary-disabled'},hosts:['brand.example'],check:async()=>{calls++;throw Error('must not call')}};
 assert.deepEqual(await createSharedRateCheck(opts)(request()),{allowed:true});
 for(const override of [{VERCEL:''},{NODE_ENV:'development'}]) await assert.rejects(()=>createSharedRateCheck({...opts,env:{...opts.env,...override}})(request()));
 await assert.rejects(()=>createSharedRateCheck(opts)(new Request('https://evil.example/api/contact',{headers:{'x-real-ip':'192.0.2.1'}})));
 await assert.rejects(()=>createSharedRateCheck(opts)(new Request('https://brand.example/api/contact')));
 assert.equal(calls,0);
});
test('unknown mode fails closed even when readiness is true',async()=>{
 await assert.rejects(()=>createSharedRateCheck({env:{...env,CONTACT_RATE_LIMIT_MODE:'typo'},hosts:['brand.example'],check:async()=>({rateLimited:false})})(request()));
});
