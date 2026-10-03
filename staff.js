// Admin Suppliers Window : connexion + double authentification (TOTP) + rôles + produits + commandes + équipe.
// Aucune dépendance en plus. Variables Railway : AUTH_SECRET (32 caractères minimum), ADMIN_EMAIL, ADMIN_PASSWORD.
// Secours : ADMIN_RESET=1 réinitialise le compte super-admin (mot de passe + 2FA) au prochain démarrage. À retirer ensuite.
const crypto=require('crypto');
const E=process.env,SEC=E.AUTH_SECRET||'';
const PERM={
  super:['products:read','products:write','orders:read','orders:status','money:read','staff:manage'],
  stock:['products:read','products:write','orders:read','orders:status'],
  support:['products:read','orders:read'],
  compta:['products:read','orders:read','money:read']
};
const G={pending:['pending'],prepare:['paid','paid_stock_issue'],shipped:['shipped'],delivered:['delivered'],returned:['returned']};
const b64=b=>Buffer.from(b).toString('base64url');
const sign=p=>{const d=b64(JSON.stringify(p));return d+'.'+crypto.createHmac('sha256',SEC).update(d).digest('base64url')};
const verify=t=>{try{const[d,s]=String(t).split('.'),h=crypto.createHmac('sha256',SEC).update(d).digest('base64url');if(!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(h)))return null;const p=JSON.parse(Buffer.from(d,'base64url'));return p.exp>Date.now()?p:null}catch(e){return null}};
const hash=(pw,salt=crypto.randomBytes(16).toString('hex'))=>new Promise((ok,ko)=>crypto.scrypt(String(pw),salt,64,(e,k)=>e?ko(e):ok(salt+':'+k.toString('hex'))));
const check=async(pw,st)=>{const[s,h]=String(st).split(':'),x=(await hash(pw,s)).split(':')[1];return crypto.timingSafeEqual(Buffer.from(x),Buffer.from(h))};
const AL='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32=b=>{let bits='',o='';for(const x of b)bits+=x.toString(2).padStart(8,'0');for(let i=0;i<bits.length;i+=5)o+=AL[parseInt(bits.slice(i,i+5).padEnd(5,'0'),2)];return o};
const unb32=s=>{let bits='';for(const c of s)bits+=AL.indexOf(c).toString(2).padStart(5,'0');const o=[];for(let i=0;i+8<=bits.length;i+=8)o.push(parseInt(bits.slice(i,i+8),2));return Buffer.from(o)};
const totp=(sec,t=Date.now())=>{const c=Buffer.alloc(8);c.writeBigUInt64BE(BigInt(Math.floor(t/30000)));const h=crypto.createHmac('sha1',unb32(sec)).update(c).digest(),o=h[19]&15;return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0')};
const okCode=(sec,code)=>[-1,0,1].some(d=>totp(sec,Date.now()+d*30000)===String(code).trim());
const tries={};
const lim=k=>{const n=Date.now(),a=(tries[k]||[]).filter(t=>n-t<6e5);tries[k]=a;return a.length>=5};
const fail=k=>{tries[k]=[...(tries[k]||[]),Date.now()]};
const W=f=>(q,r,n)=>Promise.resolve(f(q,r,n)).catch(e=>{console.error(e);r.status(500).json({error:'Erreur serveur.'})});

module.exports=(app,pool)=>{
  if(SEC.length<32){console.error('AUTH_SECRET manquant (32 caractères minimum) : le panneau admin est désactivé.');return}
  pool.query(`create table if not exists staff(id serial primary key,email text unique not null,name text,role text not null,pass text not null,totp text,totp_on boolean default false,active boolean default true,created_at timestamptz default now())`)
  .then(async()=>{
    const em=(E.ADMIN_EMAIL||'').trim().toLowerCase(),pw=(E.ADMIN_PASSWORD||'').trim();
    if(!em||!pw){console.warn('staff: ADMIN_EMAIL ou ADMIN_PASSWORD absent, aucun compte de départ créé.');return}
    const n=(await pool.query('select count(*)::int n from staff')).rows[0].n;
    if(!n){
      await pool.query("insert into staff(email,name,role,pass) values($1,'Super-Admin','super',$2)",[em,await hash(pw)]);
      console.log('staff: super-admin créé pour',em);
    }else if(E.ADMIN_RESET==='1'){
      await pool.query("insert into staff(email,name,role,pass,active) values($1,'Super-Admin','super',$2,true) on conflict(email) do update set pass=$2,role='super',active=true,totp=null,totp_on=false",[em,await hash(pw)]);
      console.log('staff: super-admin réinitialisé pour',em,'(pensez à supprimer ADMIN_RESET)');
    }
  }).catch(e=>console.error('staff',e.message));

  const auth=perm=>W(async(q,r,n)=>{
    const t=verify((q.get('authorization')||'').slice(7));
    if(!t||t.st!=='full')return r.status(401).json({error:'Session expirée.'});
    const u=(await pool.query('select id,email,name,role,active from staff where id=$1',[t.id])).rows[0];
    if(!u||!u.active)return r.status(401).json({error:'Compte désactivé.'});
    if(perm&&!PERM[u.role].includes(perm))return r.status(403).json({error:'Accès refusé.'});
    q.u=u;q.can=p=>PERM[u.role].includes(p);n();
  });

  app.get('/panel',(q,r)=>{r.set({'Cache-Control':'no-store','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"});r.sendFile(__dirname+'/panel.html')});

  app.post('/panel/api/login',W(async(q,r)=>{
    const b=q.body||{},email=String(b.email||'').trim().toLowerCase(),password=String(b.password||''),k=email+'|'+q.ip;
    if(lim(k))return r.status(429).json({error:'Trop de tentatives. Réessayez dans 10 minutes.'});
    const u=(await pool.query('select * from staff where email=$1',[email])).rows[0];
    const why=!u?'e-mail inconnu':!u.active?'compte désactivé':!(await check(password,u.pass))?'mot de passe différent':null;
    if(why){console.log('login refusé :',why,'|',email);fail(k);return r.status(401).json({error:'Identifiants incorrects.'})}
    let uri=null,secret=null;
    if(!u.totp_on){
      secret=u.totp||b32(crypto.randomBytes(20));
      if(!u.totp)await pool.query('update staff set totp=$2 where id=$1',[u.id,secret]);
      uri='otpauth://totp/Suppliers%20Window:'+encodeURIComponent(u.email)+'?secret='+secret+'&issuer=Suppliers%20Window';
    }
    r.json({tmp:sign({id:u.id,st:'tmp',exp:Date.now()+3e5}),enroll:!u.totp_on,secret,uri});
  }));

  app.post('/panel/api/totp',W(async(q,r)=>{
    const t=verify((q.body||{}).tmp);
    if(!t||t.st!=='tmp')return r.status(401).json({error:'Session expirée, reconnectez-vous.'});
    const k='t'+t.id;
    if(lim(k))return r.status(429).json({error:'Trop de tentatives. Réessayez dans 10 minutes.'});
    const u=(await pool.query('select * from staff where id=$1 and active',[t.id])).rows[0];
    if(!u||!u.totp||!okCode(u.totp,q.body.code)){fail(k);return r.status(401).json({error:'Code incorrect.'})}
    if(!u.totp_on)await pool.query('update staff set totp_on=true where id=$1',[u.id]);
    r.json({token:sign({id:u.id,st:'full',exp:Date.now()+288e5}),me:{email:u.email,name:u.name,role:u.role,perms:PERM[u.role]}});
  }));

  app.get('/panel/api/products',auth('products:read'),W(async(q,r)=>r.json((await pool.query('select * from products order by id desc')).rows)));
  app.post('/panel/api/products',auth('products:write'),W(async(q,r)=>{
    const b=q.body||{};
    if(!b.name||!(+b.price>=0))return r.status(400).json({error:'Nom et prix requis.'});
    const v=[b.name,b.category||null,b.subcategory||null,b.emoji||null,Math.round(+b.price),Math.max(0,Math.floor(+b.stock||0)),b.description||null,b.composition||null];
    r.json((await(b.id
      ?pool.query('update products set name=$1,category=$2,subcategory=$3,emoji=$4,price=$5,stock=$6,description=$7,composition=$8 where id=$9 returning *',[...v,b.id])
      :pool.query('insert into products(name,category,subcategory,emoji,price,stock,description,composition) values($1,$2,$3,$4,$5,$6,$7,$8) returning *',v))).rows[0]);
  }));

  app.get('/panel/api/orders',auth('orders:read'),W(async(q,r)=>{
    const g=G[q.query.status];
    const rows=(await pool.query('select id,status,total,name,email,phone,address,items,created_at from orders '+(g?'where status=any($1) ':'')+'order by created_at desc limit 300',g?[g]:[])).rows;
    r.json(q.can('money:read')?rows:rows.map(o=>({...o,total:null,items:(o.items||[]).map(i=>({id:i.id,name:i.name,qty:i.qty}))})));
  }));
  app.patch('/panel/api/orders/:id/status',auth('orders:status'),W(async(q,r)=>{
    const s=(q.body||{}).status;
    if(!['shipped','delivered','returned'].includes(s))return r.status(400).json({error:'Statut invalide.'});
    const u=await pool.query("update orders set status=$2 where id=$1 and status<>'pending' returning id,status",[q.params.id,s]);
    u.rowCount?r.json(u.rows[0]):r.status(409).json({error:'Commande introuvable ou non payée.'});
  }));

  app.get('/panel/api/staff',auth('staff:manage'),W(async(q,r)=>r.json((await pool.query('select id,email,name,role,active,totp_on from staff order by id')).rows)));
  app.post('/panel/api/staff',auth('staff:manage'),W(async(q,r)=>{
    const b=q.body||{};
    if(!/\S+@\S+/.test(b.email||'')||!PERM[b.role]||String(b.password||'').length<10)return r.status(400).json({error:'E-mail, rôle et mot de passe (10 caractères minimum) requis.'});
    try{r.json((await pool.query('insert into staff(email,name,role,pass) values($1,$2,$3,$4) returning id,email,name,role,active,totp_on',[b.email.trim().toLowerCase(),b.name||'',b.role,await hash(b.password)])).rows[0])}
    catch(e){r.status(409).json({error:'Cet e-mail existe déjà.'})}
  }));
  app.patch('/panel/api/staff/:id',auth('staff:manage'),W(async(q,r)=>{
    const b=q.body||{},id=+q.params.id;
    if(id===q.u.id&&(b.active===false||(b.role&&b.role!==q.u.role)))return r.status(400).json({error:'Vous ne pouvez pas modifier votre propre rôle ni vous désactiver.'});
    if(b.password&&String(b.password).length<10)return r.status(400).json({error:'Mot de passe : 10 caractères minimum.'});
    if(b.role&&PERM[b.role])await pool.query('update staff set role=$2 where id=$1',[id,b.role]);
    if(typeof b.active==='boolean')await pool.query('update staff set active=$2 where id=$1',[id,b.active]);
    if(b.password)await pool.query('update staff set pass=$2 where id=$1',[id,await hash(b.password)]);
    if(b.reset2fa)await pool.query('update staff set totp=null,totp_on=false where id=$1',[id]);
    r.json({ok:true});
  }));
};
module.exports.t={totp,okCode,b32,hash,check};
