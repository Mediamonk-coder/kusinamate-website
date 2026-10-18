// Vercel supplies x-real-ip at its trusted edge. Never use this adapter on an
// arbitrary reverse proxy or enable the SDK's development bypass for mail.
export function createSharedRateCheck({check, env = process.env, hosts}) {
  return async request => {
    if(env.VERCEL !== '1' || env.NODE_ENV !== 'production')
      throw new Error('Shared protection is not ready');
    const host = new URL(request.url).host;
    const allowed = [...hosts, env.VERCEL_URL].filter(Boolean);
    if(!allowed.includes(host) || !request.headers.get('x-real-ip'))
      throw new Error('Untrusted runtime request');
    // Owner-authorized temporary launch mode; never an SDK-error fallback.
    if(env.CONTACT_RATE_LIMIT_MODE === 'temporary-disabled') return {allowed:true};
    if(env.CONTACT_RATE_LIMIT_MODE && env.CONTACT_RATE_LIMIT_MODE !== 'enforced')
      throw new Error('Unknown rate limit mode');
    if(env.CONTACT_RATE_LIMIT_READY !== 'true') throw new Error('Shared protection is not ready');
    // Forward only the context required by the rate service, never form data.
    const result = await check('website-contact', {timeout:1500, headers:{
      host, 'x-real-ip':request.headers.get('x-real-ip')
    }});
    if(result?.error || typeof result?.rateLimited !== 'boolean')
      throw new Error('Shared protection unavailable');
    return result.rateLimited ? {allowed:false} : {allowed:true};
  };
}
