(()=>{'use strict';
const C=document.getElementById('c'),x=C.getContext('2d');
let W=0,H=0,DPR=1,cam=0,keys={};
const world={w:3900,h:720};
const input={left:false,right:false,jump:false,attack:false};
const save=JSON.parse(localStorage.getItem('mosswood-save')||'{}');
const player={x:130,y:500,w:34,h:48,vx:0,vy:0,ground:false,jumps:0,face:1,health:save.healthLevel?4+save.healthLevel:4,maxHealth:save.healthLevel?4+save.healthLevel:4,coins:0,inv:0,atk:0,double:!!save.double,damage:(save.damageLevel||0)+1,checkpoint:130};
let coinsCollected=save.coins||0,stage=1,paused=false,won=false,shake=0,last=0,bossStarted=false;
const platforms=[
{x:-100,y:650,w:900,h:100},{x:850,y:650,w:700,h:100},{x:1600,y:650,w:650,h:100},{x:2300,y:650,w:1600,h:100},
{x:520,y:520,w:230,h:24},{x:980,y:500,w:220,h:24},{x:1300,y:430,w:190,h:24},{x:1780,y:520,w:210,h:24},{x:2050,y:410,w:190,h:24},
{x:2450,y:520,w:220,h:24},{x:2750,y:430,w:180,h:24},{x:3050,y:520,w:220,h:24}
];
const enemies=[{x:650,y:610,w:38,h:30,vx:40,alive:true},{x:1120,y:610,w:38,h:30,vx:-38,alive:true},{x:1450,y:610,w:38,h:30,vx:42,alive:true},{x:1840,y:610,w:38,h:30,vx:-40,alive:true},{x:2600,y:610,w:38,h:30,vx:38,alive:true},{x:3160,y:610,w:38,h:30,vx:-42,alive:true}];
const coins=[];for(let i=0;i<20;i++)coins.push({x:430+i*150,y:[570,470,580,410,570][i%5],got:false});
const boss={x:3480,y:545,w:112,h:105,vx:-55,health:18,maxHealth:18,phase:0,timer:0,vulnerable:0,active:false,defeated:false,projectiles:[]};

function resize(){DPR=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;C.width=W*DPR;C.height=H*DPR;C.style.width=W+'px';C.style.height=H+'px';x.setTransform(DPR,0,0,DPR,0,0)}addEventListener('resize',resize);resize();
function rect(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}
function saveGame(){localStorage.setItem('mosswood-save',JSON.stringify({coins:coinsCollected,double:player.double,healthLevel:player.maxHealth-4,damageLevel:player.damage-1}))}
function updateHUD(){const l=document.getElementById('leaves');l.innerHTML='';for(let i=0;i<player.maxHealth;i++){let e=document.createElement('i');e.className='leaf'+(i>=player.health?' empty':'');l.appendChild(e)}document.getElementById('coins').textContent=coinsCollected}
updateHUD();
function banner(t,s){let b=document.getElementById('banner');b.querySelector('.title').textContent=t;b.querySelector('.sub').textContent=s;b.classList.add('bannerShow');clearTimeout(b.t);b.t=setTimeout(()=>b.classList.remove('bannerShow'),1800)}banner('MOSSWOOD','Stage One · The Briar Path');
function toast(t){let e=document.getElementById('toast');e.textContent=t;e.classList.add('show');clearTimeout(e.t);e.t=setTimeout(()=>e.classList.remove('show'),900)}

addEventListener('keydown',e=>{keys[e.code]=true;if(['ArrowLeft','ArrowRight','ArrowUp','Space'].includes(e.code))e.preventDefault()});addEventListener('keyup',e=>keys[e.code]=false);
for(const [id,key] of [['left','left'],['right','right'],['jump','jump'],['attack','attack']]){const el=document.getElementById(id);for(const ev of ['pointerdown','pointerenter'])el.addEventListener(ev,e=>{if(ev==='pointerenter'&&e.buttons===0)return;el.setPointerCapture?.(e.pointerId);input[key]=true;el.classList.add('pressed')});for(const ev of ['pointerup','pointercancel','pointerleave'])el.addEventListener(ev,()=>{input[key]=false;el.classList.remove('pressed')})}

function pollGamepad(){const p=navigator.getGamepads?.()[0];if(!p)return;input.left=p.axes[0]<-.25||p.buttons[14]?.pressed;input.right=p.axes[0]> .25||p.buttons[15]?.pressed;input.jump=p.buttons[0]?.pressed||p.buttons[1]?.pressed;input.attack=p.buttons[2]?.pressed||p.buttons[3]?.pressed}
function attack(){if(player.atk>0)return;player.atk=.28;let hitX=player.x+(player.face>0?player.w: -38),hit={x:hitX,y:player.y+8,w:38,h:38};if(boss.active&&!boss.defeated&&rect(hit,boss)&&boss.vulnerable>0){boss.health-=player.damage;boss.vulnerable=0;shake=8;toast('WEAK SPOT!');}for(const en of enemies)if(en.alive&&rect(hit,en)){en.alive=false;coinsCollected+=3;shake=5;for(let i=0;i<3;i++)coins.push({x:en.x+i*16,y:en.y-20,got:true,buried:false,vx:(i-1)*60,vy:-150});toast('+3 coins')}for(const c of coins)if(!c.got&&c.buried!==false&&rect(hit,c)){c.got=true;coinsCollected++}}

function hurt(){if(player.inv>0)return;player.health--;player.inv=1.5;shake=12;if(player.health<=0){coinsCollected=0;saveGame();banner('THE FOREST RECLAIMS','All coins lost · respawning');player.x=player.checkpoint;player.y=480;player.vx=0;player.vy=0;player.health=player.maxHealth;boss.projectiles=[];updateHUD();}
function restartBoss(){boss.health=boss.maxHealth;boss.active=false;boss.defeated=false;boss.projectiles=[];bossStarted=false}}

function openShop(){paused=true;let s=document.getElementById('shop');document.getElementById('shopCoins').textContent=coinsCollected+' ◉';s.style.display='block';s.querySelectorAll('[data-upgrade]').forEach(b=>{let t=b.dataset.upgrade,cost=+b.textContent;if(t==='double')b.disabled=player.double||coinsCollected<cost;if(t==='damage')b.disabled=player.damage>=4||coinsCollected<cost;if(t==='health')b.disabled=player.maxHealth>=8||coinsCollected<cost})}
document.querySelectorAll('[data-upgrade]').forEach(b=>b.addEventListener('click',()=>{let t=b.dataset.upgrade,cost=+b.textContent;if(coinsCollected<cost)return;coinsCollected-=cost;if(t==='double')player.double=true;if(t==='damage')player.damage++;if(t==='health'){player.maxHealth+=1;player.health=player.maxHealth}saveGame();updateHUD();openShop()}));
document.getElementById('continue').onclick=()=>{document.getElementById('shop').style.display='none';paused=false;player.checkpoint=player.x>3300?3300:850;banner('ONWARD','The Briar Widow awaits')};

function physics(dt){pollGamepad();const left=input.left||keys.ArrowLeft||keys.KeyA,right=input.right||keys.ArrowRight||keys.KeyD,jump=keys.Space||keys.ArrowUp||keys.KeyW||input.jump,attackHeld=input.attack||keys.KeyX||keys.KeyF;
if(paused)return;
if(left){player.vx-=900*dt;player.face=-1}if(right){player.vx+=900*dt;player.face=1}if(!left&&!right)player.vx*=Math.pow(.0007,dt);player.vx=Math.max(-260,Math.min(260,player.vx));
if(jump&&!physics.jumpHeld){if(player.ground||player.double&&player.jumps<2){player.vy=-520-(player.ground?20:0);player.ground=false;player.jumps++;}}physics.jumpHeld=jump;if(!jump&&player.vy<-180)player.vy*=.94;
if(attackHeld)attack();player.atk=Math.max(0,player.atk-dt);player.inv=Math.max(0,player.inv-dt);
player.vy+=1300*dt;player.x+=player.vx*dt;player.y+=player.vy*dt;player.ground=false;
for(const p of platforms){if(player.vy>=0&&player.x+player.w>p.x&&player.x<p.x+p.w&&player.y+player.h>=p.y&&player.y+player.h-p.vy*dt<=p.y+8){player.y=p.y-player.h;player.vy=0;player.ground=true;player.jumps=0}}
if(player.y>760){hurt();player.x=player.checkpoint;player.y=480;player.vx=0;player.vy=0}
player.x=Math.max(0,Math.min(world.w-player.w,player.x));
for(const en of enemies)if(en.alive){en.x+=en.vx*dt;if(en.x<300||en.x>2250&&en.x<2300||en.x>3370)en.vx*=-1;for(const p of platforms)if(en.y+en.h>=p.y&&en.y+en.h-p.y<30&&en.x>p.x&&en.x<p.x+p.w){}if(rect(player,en)){if(player.vy>120&&player.y+player.h-en.y<25){en.alive=false;player.vy=-330;coinsCollected+=3;shake=5;coins.push({x:en.x,y:en.y-10,got:true,buried:false})}else hurt()}}
for(let i=coins.length-1;i>=0;i--){const c=coins[i];if(c.buried===false){c.vy=(c.vy||-150)+500*dt;c.y+=(c.vy||0)*dt;if(c.y>610)c.buried=true}else if(!c.got&&Math.abs(player.x-c.x)<28&&Math.abs(player.y-c.y)<42){c.got=true;coinsCollected++;toast('Coin')}}
if(player.x>2250&&!paused&&stage===1&&bossStarted===false){bossStarted=true;openShop()}if(player.x>3320&&!boss.active&&!boss.defeated){boss.active=true;document.getElementById('bossHud').style.display='block';banner('THE BRIAR WIDOW','Attack the glowing heart')}bossLogic(dt);
updateHUD();if(player.inv>0){}
}
function bossLogic(dt){if(!boss.active||boss.defeated)return;boss.timer+=dt;if(boss.vulnerable>0)boss.vulnerable-=dt;
boss.x+=boss.vx*dt;if(boss.x<3280||boss.x>3760)boss.vx*=-1;
if(boss.timer>2.2&&boss.projectiles.length<6){boss.projectiles.push({x:boss.x+45,y:boss.y+35,vx:-190,vy:-40*Math.sin(boss.timer)});boss.timer=0}
for(let i=boss.projectiles.length-1;i>=0;i--){let q=boss.projectiles[i];q.x+=q.vx*dt;q.y+=q.vy*dt;q.vy+=150*dt;if(rect(player,{x:q.x,y:q.y,w:12,h:12}))hurt();if(q.y>650)boss.projectiles.splice(i,1)}
if(boss.timer>1.65&&boss.vulnerable<=0){boss.vulnerable=1.15}
if(rect(player,boss)&&player.y+player.h<boss.y+40&&player.vy>40){boss.vulnerable>0?(boss.health-=player.damage*2):(hurt())}else if(rect(player,boss))hurt();
if(boss.health<=0){boss.defeated=true;boss.active=false;won=true;coinsCollected+=25;saveGame();document.getElementById('bossHud').style.display='none';banner('FOREST SAVED','Stage Complete · +25 coins');setTimeout(openShop,2000)}}

function draw(){x.save();x.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);shake*=.82;cam+=(Math.max(0,Math.min(world.w-W,player.x-W*.42))-cam)*.08;x.translate(-cam,0);
let sky=x.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#163e3b');sky.addColorStop(.65,'#4d8050');sky.addColorStop(1,'#a3a568');x.fillStyle=sky;x.fillRect(cam,0,W,H);
// atmospheric forest layers
for(let i=-1;i<12;i++){let bx=i*410+(-(cam*.18)%410);x.fillStyle='#1b493a';x.beginPath();x.moveTo(bx,650);x.quadraticCurveTo(bx+110,280,bx+220,650);x.fill();x.fillStyle='#245842';x.fillRect(bx+160,250,28,400)}
for(let i=0;i<90;i++){let bx=(i*73-(cam*.38)%73);x.fillStyle=i%3?'#315d3a':'#47764a';x.beginPath();x.arc(bx,120+(i*47)%470,35+(i%4)*12,0,7);x.fill()}
for(const p of platforms){x.fillStyle='#5e4a31';x.fillRect(p.x,p.y,p.w,p.h);x.fillStyle='#71a94e';x.fillRect(p.x,p.y,p.w,10);for(let i=0;i<p.w;i+=35){x.fillStyle=i%70?'#557d3d':'#82bd58';x.fillRect(p.x+i,p.y-6,18,8)}}
// checkpoints/merchant
x.fillStyle='#c99c62';x.fillRect(820,560,30,90);x.fillStyle='#9ed46b';x.beginPath();x.moveTo(835,510);x.lineTo(870,550);x.lineTo(800,550);x.fill();
for(let i=0;i<coins.length;i++){let c=coins[i];if(c.got||c.buried===true)continue;x.fillStyle='#ffe66b';x.beginPath();x.ellipse(c.x,c.y,9,13,0,0,7);x.fill();x.strokeStyle='#f1a81d';x.lineWidth=3;x.stroke()}
for(const en of enemies)if(en.alive){x.fillStyle='#6f3e39';x.fillRect(en.x,en.y+5,en.w,en.h-5);x.fillStyle='#442a29';x.fillRect(en.x+4,en.y,en.w-8,10);x.fillStyle='#ffd5aa';x.fillRect(en.x+7,en.y+13,5,5);x.fillRect(en.x+26,en.y+13,5,5)}
// spider boss
if(boss.active||boss.defeated&&!bossStarted||!boss.defeated&&boss.x>3300){x.save();x.translate(boss.x,boss.y);x.strokeStyle='#2b1a25';x.lineWidth=7;for(let s=-1;s<=1;s+=2){for(let k=0;k<4;k++){x.beginPath();x.moveTo(55+s*20,35+k*8);x.lineTo(s*(35+k*17),20+k*26);x.stroke()}}x.fillStyle=boss.vulnerable>0?'#a99b64':'#2b1d27';x.beginPath();x.ellipse(55,58,42,48,0,0,7);x.fill();x.fillStyle='#efe078';if(boss.vulnerable>0)x.beginPath(),x.arc(55,55,13,0,7),x.fill();else{x.fillStyle='#d74874';x.beginPath();x.arc(38,38,5,0,7);x.arc(72,38,5,0,7);x.fill()}x.restore()}
for(const q of boss.projectiles){x.fillStyle='#c3f06b';x.beginPath();x.arc(q.x,q.y,8,0,7);x.fill();x.fillStyle='#7ad18c';x.beginPath();x.arc(q.x-4,q.y-4,4,0,7);x.fill()}
// player
x.save();if(player.inv>0&&Math.floor(player.inv*14)%2)x.globalAlpha=.35;x.translate(player.x,player.y);if(player.face<0)x.translate(player.w,0),x.scale(-1,1);x.fillStyle='#213d2d';x.fillRect(7,10,20,24);x.fillStyle='#73a54c';x.fillRect(4,30,26,14);x.fillStyle='#e0b56d';x.fillRect(9,4,16,12);x.fillStyle='#3a2621';x.fillRect(5,2,24,6);x.fillStyle='#1a241b';x.fillRect(15,13,3,3);x.fillRect(25,13,3,3);x.fillStyle='#9a7545';x.fillRect(13,34,8,14);x.fillRect(27,34,8,14);if(player.atk>0){x.strokeStyle='#eaffbf';x.lineWidth=5;x.beginPath();x.moveTo(30,18);x.lineTo(58,27);x.stroke()}x.restore();
// foreground vines
x.fillStyle='#21482f';for(let i=0;i<world.w;i+=230){x.fillRect(i,0,7,180+(i%160));x.beginPath();x.arc(i+20,150+(i%90),18,0,7);x.fill()}
x.restore();document.getElementById('bossFill').style.width=Math.max(0,boss.health/boss.maxHealth*100)+'%';
}
function loop(t){let dt=Math.min(.033,(t-last)/1000||0);last=t;if(!paused)physics(dt);draw();requestAnimationFrame(loop)}requestAnimationFrame(loop);
})();