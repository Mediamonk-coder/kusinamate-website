import nodemailer from 'nodemailer';
import {checkRateLimit} from '@vercel/firewall';
import {createSharedRateCheck} from '../lib/shared-rate.mjs';
import { createContactHandler } from '../lib/contact.mjs';
const settings={"brand": "Kusinamate", "recipient": "hello@kusinamate.com", "origins": ["https://kusinamate.com", "https://www.kusinamate.com", "https://website-seven-topaz-26.vercel.app"]};
let transport;
const handler=createContactHandler({...settings,
 sharedRateCheck:createSharedRateCheck({check:checkRateLimit,hosts:settings.origins.filter(x=>x.startsWith('https://')).map(x=>new URL(x).host)}),
 configured:()=>Boolean(process.env.SMTP_USER&&process.env.SMTP_PASS&&process.env.CONTACT_SEND_ENABLED==='true'),
 send:async message=>{
  transport??=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,
   connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,
   auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS.replace(/\s/g,'')}});
  return transport.sendMail({from:process.env.MAIL_FROM||process.env.SMTP_USER,...message});
 }
});
export const POST=handler;
