const test=require('node:test'),assert=require('node:assert/strict');
test('isolated Google OAuth exposes only Google, uses sandbox callback and PKCE, rejects missing state',async()=>{
 const app=await require('./sandbox-home-server.cjs')({fresh:true,port:0,googleOAuth:{clientId:'sandbox-fake.apps.googleusercontent.com',clientSecret:'fake-test-only'}});
 try{
 const providers=await(await fetch(app.origin+'/api/auth/providers')).json();assert.deepEqual(providers,{google:true,naver:false,kakao:false});
 const r=await fetch(app.origin+'/api/auth/google/start?next=assets/91001',{redirect:'manual'});assert.equal(r.status,303);const u=new URL(r.headers.get('location'));assert.equal(u.origin,'https://accounts.google.com');assert.equal(u.searchParams.get('redirect_uri'),app.origin+'/api/auth/google/callback');assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.ok(u.searchParams.get('state'));assert.ok(r.headers.get('set-cookie').includes('HttpOnly'));assert.equal(u.searchParams.get('client_secret'),null);
 const denied=await fetch(app.origin+'/api/auth/google/callback?state=wrong&code=fake',{redirect:'manual'});assert.equal(denied.status,303);assert.match(denied.headers.get('location'),/oauth_error=state/);
 assert.equal((await fetch(app.origin+'/api/auth/naver/start',{redirect:'manual'})).status,403);
 const purchaseBlocked=await fetch(app.origin+'/api/auth/neon/purchase',{method:'POST'});assert.equal(purchaseBlocked.status,403);
 }finally{await app.close();}
});
