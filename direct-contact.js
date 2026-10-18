(() => {
  'use strict';
  const form=document.querySelector('form');
  if(!form)return;
  const status=form.querySelector('[role="status"]');
  const button=form.querySelector('[type="submit"]');
  const config=window.BRAND_CONTACT_CONFIG;
  if(!config||!status||!button)return;
  if(config.enabled===false){
    form.hidden=true;button.disabled=true;
    form.addEventListener('submit',event=>event.preventDefault());
    return;
  }
  form.hidden=false;
  const unavailable=document.querySelector('[data-contact-unavailable]');
  if(unavailable)unavailable.hidden=true;
  form.addEventListener('submit',submit);
  form.noValidate=true;form.action='/api/contact';
  form.querySelectorAll('fieldset[disabled]').forEach(el=>el.disabled=false);button.disabled=false;
  const honeypot=document.createElement('div');honeypot.hidden=true;
  honeypot.innerHTML='<label>Leave this field empty<input name="website" tabindex="-1" autocomplete="off"></label>';
  form.append(honeypot);
  const outcomes=new Map();let pending=false;let cooldown=0;
  function announce(message,state){status.hidden=false;status.textContent=message;status.dataset.state=state;status.focus({preventScroll:true});}
  async function submit(event){
    event.preventDefault();if(pending)return;
    if(Date.now()<cooldown){announce('Please wait before sending another inquiry. You can also email our team.','error');return;}
    const data={};for(const key of ['full_name','business_name','contact','partner_type','message','website'])data[key]=String(new FormData(form).get(key)||'').trim();
    data.partner_type ||= 'General inquiry';
    const contact=data.contact.replace(/[\s()-]/g,'');
    const validContact=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contact)||/^(09|\+639)\d{9}$/.test(contact);
    if(!form.reportValidity()||data.full_name.length<2||!validContact){announce('Enter your name and a valid email or Philippine mobile number.','error');return;}
    const body=JSON.stringify(data);
    if(outcomes.has(body)){announce(outcomes.get(body),'notice');return;}
    pending=true;button.disabled=true;
    announce('Sending your inquiry…','pending');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
    const uncertain='We could not confirm whether your inquiry was sent. Your details are still here. Please email our team before resending.';
    try {
      const response=await fetch(config.endpoint,{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json','Accept':'application/json'},body,signal:controller.signal});
      if([404,405,503].includes(response.status)){announce('The inquiry form is unavailable right now. Please use the email link on this page.','error');return;}
      if(response.status===429){cooldown=Date.now()+900000;announce('Please wait 15 minutes before sending another inquiry, or email our team.','error');return;}
      let result;try{result=await response.json()}catch{throw new Error('Unconfirmed response')}
      if(response.ok&&result.success===true&&result.accepted===true&&typeof result.id==='string'){
        const message=`Your inquiry was accepted for email delivery. Thank you for getting in touch. Reference: ${result.id}`;
        outcomes.set(body,message);announce(message,'success');
      }
      else if([400,403,404,405,413,415,503].includes(response.status)){
        announce([404,405,503].includes(response.status)?'The inquiry form is unavailable right now. Please use the email link on this page.':'Please check your details or use the email link on this page.','error');
      } else {const message=uncertain+(typeof result.id==='string'&&/^[0-9a-f-]{36}$/.test(result.id)?` Reference: ${result.id}`:'');outcomes.set(body,message);announce(message,'error');}
    } catch {outcomes.set(body,uncertain);announce(uncertain,'error');}
    finally {clearTimeout(timer);pending=false;button.disabled=false;}
  }
})();
