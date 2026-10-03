const express=require('express'),cors=require('cors'),crypto=require('crypto'),PDF=require('pdfkit'),{Pool}=require('pg');
const pkg=require('@kkiapay-org/nodejs-sdk'),kkiapay=pkg.kkiapay||pkg.default||pkg;
const E=process.env,db=E.DATABASE_URL||'';
const pool=new Pool({connectionString:db,ssl:/localhost|railway\.internal/.test(db)?false:{rejectUnauthorized:false}});
const k=kkiapay({publickey:E.KKIAPAY_PUBLIC_KEY,privatekey:E.KKIAPAY_PRIVATE_KEY,secretkey:E.KKIAPAY_SECRET,sandbox:E.KKIAPAY_SANDBOX!=='false'});
const app=express();app.use(cors({origin:E.WEB_ORIGIN||'*'}));app.use(express.json());
const fmt=n=>Number(n).toLocaleString('fr-FR').replace(/\s/g,' ')+' FCFA';

async function init(){
  await pool.query(`create table if not exists products(id serial primary key,name text not null,category text,emoji text,price int not null,rating real default 0,reviews int default 0,description text,composition text,stock int default 0);
  create table if not exists orders(id text primary key,status text not null,total int not null,name text,email text,phone text,address text,items jsonb,transaction_id text,created_at timestamptz default now());`);
  await pool.query('alter table products add column if not exists subcategory text');
  if((await pool.query('select count(*)::int n from products')).rows[0].n===0){
    for(const p of require('./products')) await pool.query('insert into products(name,category,emoji,price,rating,reviews,description,composition,stock) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[p.name,p.category,p.emoji,p.price,p.rating,p.reviews,p.description,p.composition,p.stock]);
  }
}
async function mail(to,subject,html){
  if(!E.RESEND_API_KEY||!to)return;
  try{await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+E.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:E.MAIL_FROM,to:[to],subject,html})})}catch(e){console.error('mail',e.message)}
}
const admin=(q,r,n)=>E.ADMIN_TOKEN&&q.get('authorization')==='Bearer '+E.ADMIN_TOKEN?n():r.status(401).json({error:'Non autorisé'});

app.get('/health',(q,r)=>r.json({ok:true}));
app.get('/products',async(q,r)=>r.json((await pool.query('select * from products order by id')).rows));

app.post('/orders',async(q,r)=>{
  try{
    const{customer:c={},items=[]}=q.body||{};
    if(!c.name||!/\S+@\S+/.test(c.email||'')||!c.address||!items.length)return r.status(400).json({error:'Informations de commande incomplètes.'});
    const ids=items.map(i=>+i.id),rows=(await pool.query('select * from products where id=any($1)',[ids])).rows;
    let total=0,lines=[];
    for(const i of items){
      const p=rows.find(x=>x.id===+i.id),n=Math.floor(+i.qty);
      if(!p||!(n>0))return r.status(400).json({error:'Article invalide.'});
      if(p.stock<n)return r.status(409).json({error:`Stock insuffisant pour « ${p.name} » (reste ${p.stock}).`});
      total+=p.price*n;lines.push({id:p.id,name:p.name,qty:n,price:p.price});
    }
    const id=crypto.randomUUID();
    await pool.query('insert into orders(id,status,total,name,email,phone,address,items) values($1,$2,$3,$4,$5,$6,$7,$8)',[id,'pending',total,c.name,c.email,c.phone,c.address,JSON.stringify(lines)]);
    r.json({orderId:id,amount:total});
  }catch(e){console.error(e);r.status(500).json({error:'Erreur serveur.'})}
});

app.post('/orders/:id/pay',async(q,r)=>{
  const cl=await pool.connect();
  try{
    const o=(await cl.query('select * from orders where id=$1',[q.params.id])).rows[0];
    if(!o)return r.status(404).json({error:'Commande introuvable.'});
    if(o.status==='paid')return r.json({ok:true});
    const t=await k.verify(String(q.body.transactionId||''));
    console.log('KKiaPay verify:',JSON.stringify(t)); // vérifiez ce format en mode sandbox
    const paid=t&&t.status==='SUCCESS'&&(t.amount==null||Number(t.amount)>=o.total);
    if(!paid)return r.status(402).json({error:'Paiement non confirmé par KKiaPay.'});
    await cl.query('begin');
    let short=false;
    for(const i of o.items){
      const u=await cl.query('update products set stock=stock-$1 where id=$2 and stock>=$1 returning name,stock',[i.qty,i.id]);
      if(!u.rowCount)short=true;
      else if(u.rows[0].stock<=+(E.LOW_STOCK||5))mail(E.ADMIN_EMAIL,'Stock bas : '+u.rows[0].name,`<p>Il reste ${u.rows[0].stock} unité(s) de « ${u.rows[0].name} ».</p>`);
    }
    if(short){await cl.query('rollback');await cl.query("update orders set status='paid_stock_issue',transaction_id=$2 where id=$1",[o.id,String(q.body.transactionId)]);mail(E.ADMIN_EMAIL,'Commande payée à vérifier','<p>Commande '+o.id+' payée mais stock insuffisant : remboursement ou réapprovisionnement à gérer.</p>');return r.status(409).json({error:'Un article n\'est plus disponible.'})}
    await cl.query("update orders set status='paid',transaction_id=$2 where id=$1",[o.id,String(q.body.transactionId)]);
    await cl.query('commit');
    const list=o.items.map(i=>`<li>${i.qty} × ${i.name} — ${fmt(i.price*i.qty)}</li>`).join('');
    mail(o.email,'Votre commande Suppliers Window',`<p>Merci ${o.name} !</p><ul>${list}</ul><p><b>Total : ${fmt(o.total)}</b></p><p>Reçu PDF : ${(E.PUBLIC_API_URL||'')}/orders/${o.id}/receipt.pdf</p>`);
    mail(E.ADMIN_EMAIL,'Nouvelle commande '+fmt(o.total),`<p>${o.name} — ${o.phone||''}<br>${o.address}</p><ul>${list}</ul>`);
    r.json({ok:true});
  }catch(e){try{await cl.query('rollback')}catch(_){}console.error(e);r.status(500).json({error:'Vérification impossible pour le moment.'})}
  finally{cl.release()}
});

app.get('/orders/:id/receipt.pdf',async(q,r)=>{
  const o=(await pool.query("select * from orders where id=$1 and status='paid'",[q.params.id])).rows[0];
  if(!o)return r.status(404).send('Reçu introuvable');
  r.type('pdf');const d=new PDF({margin:50});d.pipe(r);
  d.fontSize(20).text('Suppliers Window').fontSize(12).text('Reçu de paiement').moveDown();
  d.text('Commande : '+o.id).text('Date : '+new Date(o.created_at).toLocaleDateString('fr-FR')).text('Client : '+o.name+' — '+o.email).moveDown();
  o.items.forEach(i=>d.text(`${i.qty} × ${i.name}   ${fmt(i.price*i.qty)}`));
  d.moveDown().fontSize(14).text('Total payé : '+fmt(o.total));d.end();
});

// Administration (jeton dans l'en-tête Authorization: Bearer ...)
app.get('/admin/orders',admin,async(q,r)=>r.json((await pool.query('select id,status,total,name,email,phone,address,items,created_at from orders order by created_at desc limit 200')).rows));
app.post('/admin/products',admin,async(q,r)=>{
  const p=q.body,a=[p.name,p.category,p.emoji,p.price,p.rating||0,p.reviews||0,p.description,p.composition,p.stock||0,p.subcategory||null];
  r.json((await(p.id?pool.query('update products set name=$1,category=$2,emoji=$3,price=$4,rating=$5,reviews=$6,description=$7,composition=$8,stock=$9,subcategory=$10 where id=$11 returning *',[...a,p.id]):pool.query('insert into products(name,category,emoji,price,rating,reviews,description,composition,stock,subcategory) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *',a))).rows[0]);
});

require('./staff')(app,pool); // panneau admin (/panel)
init().then(()=>app.listen(E.PORT||3000,()=>console.log('API prête'))).catch(e=>{console.error(e);process.exit(1)});
