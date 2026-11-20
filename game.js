(() => {
  'use strict';

  // Mosslight is a small, asset-free canvas platformer. World coordinates stay
  // independent of the canvas size; the renderer scales to desktop and phones.
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const screen = document.querySelector('#screen');
  const titleCard = document.querySelector('#titleCard');
  const shopCard = document.querySelector('#shopCard');
  const endCard = document.querySelector('#endCard');
  const pauseCard = document.querySelector('#pauseCard');
  const hud = document.querySelector('#hud');
  const bossHud = document.querySelector('#bossHud');
  const touchControls = document.querySelector('#touchControls');
  const W = 960, H = 540, FLOOR = 454, GRAVITY = 1750;
  const stageNames = ['Fernfall Trail', 'The Gloaming Wilds'];
  const keys = new Set();
  const touch = { left:false, right:false, jump:false, attack:false };
  let gameMode = 'title', lastTime = 0, cameraX = 0, elapsed = 0;
  let player, platforms, enemies, coins, particles, bolts, webs, boss, worldWidth;
  let stage = 0, checkpointX = 80, totalSeeds = 0, audioOn = true, audioCtx;
  let toastTimer = 0, screenShake = 0, bossDefeated = false, deaths = 0;
  const upgrades = { double:false, damage:1, health:5 };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a,b) => a + Math.random() * (b-a);
  const rects = (a,b) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
  const roundRect = (c,x,y,w,h,r) => { c.beginPath(); c.roundRect(x,y,w,h,r); };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  window.addEventListener('resize', resize); resize();

  function sound(freq=440, duration=.08, type='sine', volume=.035) {
    if (!audioOn) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const o=audioCtx.createOscillator(), g=audioCtx.createGain();
      o.type=type; o.frequency.setValueAtTime(freq,audioCtx.currentTime);
      if(type==='sine') o.frequency.exponentialRampToValueAtTime(Math.max(50,freq*.72),audioCtx.currentTime+duration);
      g.gain.setValueAtTime(volume,audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);
      o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration);
    } catch(_) {}
  }
  function showToast(message) {
    const el=document.querySelector('#toast'); el.textContent=message;el.classList.add('show');toastTimer=2.1;
  }
  function setScreen(which) {
    screen.replaceChildren();
    const card={title:titleCard,shop:shopCard,end:endCard,pause:pauseCard}[which];
    if(card){card.hidden=false;screen.appendChild(card);}
    gameMode=which;
    hud.hidden=which==='title'||which==='end';
    touchControls.hidden=which!=='playing'||!isTouchDevice();
    if(which!=='playing') bossHud.hidden=true;
  }
  const isTouchDevice=()=>('ontouchstart' in window)||navigator.maxTouchPoints>0;

  function makePlayer(x=80) {
    return {x,y:FLOOR-48,w:32,h:48,vx:0,vy:0,face:1,onGround:false,jumps:0,
      hp:upgrades.health,maxHp:upgrades.health,invuln:0,attackCd:0,flash:0,anim:0};
  }
  function setupStage(index, preservePlayer=false) {
    stage=index; worldWidth=3300;
    platforms=[
      {x:270,y:390,w:120,h:18},{x:520,y:340,w:124,h:18},{x:770,y:390,w:155,h:18},
      {x:1050,y:350,w:135,h:18},{x:1320,y:395,w:160,h:18},{x:1580,y:340,w:150,h:18},
      {x:1880,y:385,w:140,h:18},{x:2130,y:330,w:150,h:18},{x:2420,y:390,w:165,h:18}
    ];
    if(index===1) platforms.push({x:930,y:320,w:135,h:18},{x:1740,y:300,w:150,h:18},{x:2250,y:275,w:135,h:18});
    const count=index===0?8:10;
    enemies=Array.from({length:count},(_,i)=>({x:420+i*310+(i%2)*45,y:FLOOR-32,w:34,h:32,baseX:360+i*310,range:125,dir:i%2?1:-1,speed:45+index*8,alive:true,anim:rand(0,8)}));
    coins=[];
    for(let i=0;i<17;i++) coins.push({x:190+i*175,y:FLOOR-58-(i%3)*25,r:9,taken:false,bob:rand(0,6)});
    for(const p of platforms) for(let j=0;j<2;j++) coins.push({x:p.x+38+j*46,y:p.y-20,r:8,taken:false,bob:rand(0,6)});
    particles=[];bolts=[];webs=[];boss={x:worldWidth-370,y:FLOOR-138,w:118,h:112,hp:index===0?7:10,maxHp:index===0?7:10,timer:1.6,state:'idle',attackTimer:2,flash:0};
    bossDefeated=false;checkpointX=80;cameraX=0;
    if(!preservePlayer||!player) player=makePlayer(80);
    else {player.x=80;player.y=FLOOR-player.h;player.vx=player.vy=0;player.hp=player.maxHp;player.invuln=1.2;player.jumps=0;}
    document.querySelector('#stageNumber').textContent=String(index+1).padStart(2,'0');
    document.querySelector('#stageName').textContent=stageNames[index];
    bossHud.hidden=true;
    updateHud();
  }

  function startGame() {
    totalSeeds=0;deaths=0;upgrades.double=false;upgrades.damage=1;upgrades.health=5;
    player=null;setupStage(0);setScreen('playing');sound(620,.14,'sine');
  }
  function updateHud() {
    if(!player)return;
    const leaves=document.querySelector('#leaves');leaves.replaceChildren();
    for(let i=0;i<player.maxHp;i++){const leaf=document.createElement('span');leaf.className='leaf'+(i>=player.hp?' empty':'');leaf.textContent='❧';leaves.appendChild(leaf);}
    document.querySelector('#coinCount').textContent=String(totalSeeds).padStart(2,'0');
    if(boss){document.querySelector('#bossHealth').style.width=`${Math.max(0,boss.hp/boss.maxHp*100)}%`;}
  }

  function inputState() {
    let left=keys.has('ArrowLeft')||keys.has('KeyA')||touch.left;
    let right=keys.has('ArrowRight')||keys.has('KeyD')||touch.right;
    let jump=keys.has('Space')||keys.has('ArrowUp')||keys.has('KeyW')||keys.has('KeyZ')||touch.jump;
    let attack=keys.has('KeyX')||keys.has('KeyJ')||keys.has('KeyK')||touch.attack;
    const pads=navigator.getGamepads?.()||[];const pad=Array.from(pads).find(Boolean);
    if(pad){left||=pad.axes[0]<-.28||pad.buttons[14]?.pressed;right||=pad.axes[0]>.28||pad.buttons[15]?.pressed;jump||=!!pad.buttons[0]?.pressed||!!pad.buttons[12]?.pressed;attack||=!!pad.buttons[2]?.pressed||!!pad.buttons[5]?.pressed;}
    return {left,right,jump,attack};
  }
  let jumpWasDown=false,attackWasDown=false;
  function doJump() {
    if(player.onGround||upgrades.double&&player.jumps<2){player.vy=player.jumps? -565:-610;player.onGround=false;player.jumps++;sound(player.jumps>1?460:560,.11,'triangle');burst(player.x+player.w/2,player.y+player.h,'#d7e8a5',7);}
  }
  function attack() {
    if(player.attackCd>0)return;
    player.attackCd=.36;player.flash=.16;
    bolts.push({x:player.x+(player.face>0?player.w:-10),y:player.y+20,w:16,h:11,vx:player.face*570,life:1.15,damage:upgrades.damage});
    sound(700,.1,'triangle',.022);burst(player.x+player.w/2+player.face*20,player.y+23,'#d6ec92',4);
  }

  function burst(x,y,color,n=8) {
    for(let i=0;i<n;i++) particles.push({x,y,vx:rand(-115,115),vy:rand(-175,25),life:rand(.3,.72),max:.72,color,r:rand(2,4)});
  }
  function damagePlayer() {
    if(player.invuln>0)return;
    player.hp--;player.invuln=1.35;player.vy=-330;player.vx=-player.face*190;screenShake=8;
    sound(145,.22,'sawtooth',.045);burst(player.x+player.w/2,player.y+22,'#f1a37c',12);updateHud();
    if(player.hp<=0){
      deaths++;totalSeeds=0;showToast('THE WOOD GIVES YOU ANOTHER CHANCE');
      player.x=checkpointX;player.y=FLOOR-player.h;player.vx=player.vy=0;player.hp=player.maxHp;player.invuln=2;
      if(bossDefeated===false&&boss.x<worldWidth-350)boss.hp=boss.maxHp;
      cameraX=Math.max(0,player.x-300);updateHud();
    }
  }
  function hitEnemy(enemy) {
    enemy.alive=false;for(let i=0;i<3;i++)coins.push({x:enemy.x+rand(2,enemy.w-2),y:enemy.y-5,r:8,taken:false,bob:rand(0,6)});
    burst(enemy.x+enemy.w/2,enemy.y+10,'#c7df83',12);sound(270,.12,'square',.025);showToast('A LITTLE LIGHT LEFT BEHIND');
  }
  function update(dt) {
    elapsed+=dt; if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)document.querySelector('#toast').classList.remove('show');}
    if(screenShake>0)screenShake=Math.max(0,screenShake-dt*28);
    if(gameMode!=='playing')return;
    const input=inputState();
    if(input.jump&&!jumpWasDown)doJump();
    if(input.attack&&!attackWasDown)attack();
    jumpWasDown=input.jump;attackWasDown=input.attack;
    const speed=245, accel=1900;
    if(input.left){player.vx=Math.max(player.vx-accel*dt,-speed);player.face=-1;}
    else if(input.right){player.vx=Math.min(player.vx+accel*dt,speed);player.face=1;}
    else player.vx*=Math.pow(.001,dt);
    if(!input.jump&&player.vy< -170)player.vy+=GRAVITY*dt*1.35; // variable-height jump
    player.vy=Math.min(player.vy+GRAVITY*dt,980);
    player.x=clamp(player.x+player.vx*dt,0,worldWidth-player.w);
    const oldY=player.y;player.y+=player.vy*dt;player.onGround=false;
    if(player.y+player.h>=FLOOR){player.y=FLOOR-player.h;player.vy=0;player.onGround=true;player.jumps=0;}
    for(const p of platforms){
      if(player.x+player.w>p.x&&player.x<p.x+p.w&&oldY+player.h<=p.y+4&&player.y+player.h>=p.y&&player.vy>=0){player.y=p.y-player.h;player.vy=0;player.onGround=true;player.jumps=0;}
    }
    player.anim+=dt*Math.abs(player.vx)*.045;player.invuln=Math.max(0,player.invuln-dt);player.attackCd=Math.max(0,player.attackCd-dt);player.flash=Math.max(0,player.flash-dt);
    if(player.y>H+250){damagePlayer();player.y=FLOOR-player.h;}
    if(player.x>checkpointX+620){checkpointX=Math.floor(player.x/600)*600;showToast('TRAIL MARKER FOUND');}

    for(const e of enemies){if(!e.alive)continue;e.anim+=dt*e.speed*.07;e.x+=e.dir*e.speed*dt;if(e.x<e.baseX-e.range||e.x>e.baseX+e.range)e.dir*=-1;
      if(rects(player,e)){
        if(player.vy>40&&oldY+player.h<e.y+12){player.y=e.y-player.h;player.vy=-410;player.jumps=0;hitEnemy(e);}
        else if(player.invuln<=0)damagePlayer();
      }
    }
    for(const c of coins){c.bob+=dt*3;if(!c.taken&&rects(player,{x:c.x-c.r,y:c.y-c.r+Math.sin(c.bob)*3,w:c.r*2,h:c.r*2})){c.taken=true;totalSeeds++;sound(850+Math.min(totalSeeds,15)*24,.07,'sine',.025);burst(c.x,c.y,'#f1d978',5);updateHud();}}
    for(const b of bolts){b.x+=b.vx*dt;b.life-=dt;
      for(const e of enemies)if(e.alive&&rects(b,e)){hitEnemy(e);b.life=0;break;}
      if(!bossDefeated&&boss.state==='open'&&rects(b,{x:boss.x+42,y:boss.y+12,w:38,h:38})){boss.hp-=b.damage;boss.flash=.2;b.life=0;burst(boss.x+61,boss.y+30,'#f4db84',10);sound(390,.14,'triangle',.04);screenShake=4;if(boss.hp<=0)defeatBoss();updateHud();}
      else if(!bossDefeated&&rects(b,boss)&&boss.state!=='open'){b.life=0;burst(b.x,b.y,'#91aa96',3);}
    }
    bolts=bolts.filter(b=>b.life>0&&b.x>-30&&b.x<worldWidth+30);
    updateBoss(dt);
    for(const w of webs){w.x+=w.vx*dt;w.y+=w.vy*dt;w.vy+=160*dt;w.life-=dt;if(rects(w,player)&&player.invuln<=0){damagePlayer();w.life=0;} }
    webs=webs.filter(w=>w.life>0&&w.x>-50&&w.x<worldWidth+50);
    for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=420*dt;p.life-=dt;}
    particles=particles.filter(p=>p.life>0);
    if(!bossDefeated&&player.x>boss.x-430)bossHud.hidden=false;
    if(!bossDefeated&&player.x>boss.x+boss.w+35){player.x=boss.x-80;player.vx=0;showToast('THE WEB BLOCKS YOUR WAY');}
    cameraX=clamp(player.x-W*.38,0,worldWidth-W);
    updateHud();
  }
  function updateBoss(dt) {
    if(bossDefeated)return;
    boss.timer-=dt;boss.attackTimer-=dt;boss.flash=Math.max(0,boss.flash-dt);
    if(boss.timer<=0){
      if(boss.state==='idle'){boss.state='open';boss.timer=1.45;document.querySelector('#bossState').textContent='WEAK SPOT EXPOSED';sound(520,.18,'sine',.025);}
      else {boss.state='idle';boss.timer=3.0;document.querySelector('#bossState').textContent='LISTENING…';}
    }
    if(boss.attackTimer<=0){
      boss.attackTimer=boss.state==='open'?1.45:2.1;
      const direction=player.x<boss.x?-1:1;
      // A paired silk volley makes jumping, rather than tanking, the natural answer.
      webs.push({x:boss.x+(direction<0?5:boss.w-15),y:boss.y+68,w:19,h:18,vx:direction*205,vy:-30,life:3.2});
      if(Math.random()>.43)webs.push({x:boss.x+(direction<0?2:boss.w-14),y:boss.y+40,w:16,h:16,vx:direction*160,vy:85,life:3});
      sound(220,.11,'triangle',.018);
    }
  }
  function defeatBoss(){
    bossDefeated=true;boss.hp=0;bossHud.hidden=true;boss.state='down';
    burst(boss.x+boss.w/2,boss.y+45,'#f3d982',38);sound(620,.35,'sine',.055);screenShake=10;
    for(let i=0;i<12;i++)coins.push({x:boss.x+rand(0,boss.w),y:boss.y+rand(20,80),r:9,taken:false,bob:rand(0,6)});
    totalSeeds+=4;updateHud();showToast('THE OLD GUARDIAN RESTS');
    setTimeout(()=>{if(gameMode!=='playing')return;if(stage===0){document.querySelector('#shopCoins').textContent=totalSeeds;setScreen('shop');refreshShop();}else finishGame();},1800);
  }
  function finishGame(){document.querySelector('#endStats').textContent=`${deaths} fresh starts  ·  ${totalSeeds} seeds in your pouch`;setScreen('end');sound(780,.3,'sine',.035);}

  function drawBackground(){
    const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,stage===0?'#142d31':'#1c2633');sky.addColorStop(.52,stage===0?'#527269':'#585b69');sky.addColorStop(1,'#a2a57a');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    // Soft morning haze and layered canopy silhouettes move at different speeds.
    const sunX=680-(cameraX*.06%1100);const glow=ctx.createRadialGradient(sunX,125,5,sunX,125,245);glow.addColorStop(0,'#e7d99a55');glow.addColorStop(1,'#e7d99a00');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
    ctx.fillStyle=stage===0?'#355c50':'#404b58';ctx.beginPath();ctx.moveTo(0,325);for(let x=0;x<=W+40;x+=40)ctx.lineTo(x,270+Math.sin((x+cameraX*.08)*.012)*30+Math.sin(x*.027)*12);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill();
    ctx.fillStyle='#213f39';for(let i=-1;i<13;i++){let x=((i*116-cameraX*.19)%(W+150)+W+150)%(W+150)-60;let h=170+((i*37)%95);treeSilhouette(x,330-h,h,'#27473f',.75);}
    ctx.fillStyle='#1b382f';for(let i=-1;i<17;i++){let x=((i*83-cameraX*.34)%(W+120)+W+120)%(W+120)-50;let h=120+((i*53)%85);treeSilhouette(x,362-h,h,'#1c3c32',.88);}
    // drifting pollen specks
    for(let i=0;i<24;i++){let x=(i*173+elapsed*9-cameraX*.15)%(W+20), y=90+((i*71+Math.sin(elapsed+i)*18)%310);ctx.globalAlpha=.16+Math.sin(elapsed*1.6+i)*.12;ctx.fillStyle='#e3edaf';ctx.beginPath();ctx.arc(x,y,1.3,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  }
  function treeSilhouette(x,bottom,h,color,scale=1){
    ctx.save();ctx.translate(x,bottom);ctx.scale(scale,scale);ctx.fillStyle=color;ctx.fillRect(-8,-h*.48,16,h*.5);
    for(let i=0;i<4;i++){let y=-h*(.25+i*.18),r=h*(.25-i*.025);ctx.beginPath();ctx.ellipse(0,y,r,r*.44,0,0,Math.PI*2);ctx.fill();}ctx.restore();
  }
  function drawGround(){
    ctx.fillStyle='#423b30';ctx.fillRect(-cameraX,FLOOR,worldWidth,H-FLOOR+200);
    const g=ctx.createLinearGradient(0,FLOOR,0,FLOOR+100);g.addColorStop(0,'#597248');g.addColorStop(.16,'#3b5139');g.addColorStop(1,'#28362e');ctx.fillStyle=g;ctx.fillRect(-cameraX,FLOOR,worldWidth,110);
    ctx.fillStyle='#90a66c';ctx.fillRect(-cameraX,FLOOR,worldWidth,4);
    for(let x=Math.floor(cameraX/46)*46;x<cameraX+W+46;x+=46){const sx=x-cameraX;ctx.fillStyle=(x/46|0)%2?'#a6b377':'#768c5c';ctx.beginPath();ctx.moveTo(sx,FLOOR);ctx.lineTo(sx+4,FLOOR-5-(x%3));ctx.lineTo(sx+8,FLOOR);ctx.fill();
      if((x/46|0)%3===0){ctx.strokeStyle='#71835a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx+20,FLOOR+31);ctx.quadraticCurveTo(sx+26,FLOOR+22,sx+33,FLOOR+32);ctx.stroke();}}
    // Small blocks of earth under ledges.
    for(const p of platforms){const x=p.x-cameraX;if(x+p.w<0||x>W)continue;ctx.fillStyle='#4b5640';roundRect(ctx,x,p.y,p.w,p.h,4);ctx.fill();ctx.fillStyle='#99ad72';roundRect(ctx,x,p.y-3,p.w,7,4);ctx.fill();ctx.fillStyle='#667b52';ctx.fillRect(x+4,p.y+9,p.w-8,3);for(let k=16;k<p.w-5;k+=31){ctx.fillStyle='#83915b';ctx.fillRect(x+k,p.y+8,5,4);}}
  }
  function drawDecor(){
    for(let x=Math.floor(cameraX/230)*230;x<cameraX+W+240;x+=230){const sx=x-cameraX;const n=Math.floor(x/230);if(n%3===0){ctx.fillStyle='#263e31';ctx.fillRect(sx+23,FLOOR-47,5,48);ctx.fillStyle='#426344';ctx.beginPath();ctx.ellipse(sx+25,FLOOR-42,20,8,-.25,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(sx+13,FLOOR-32,14,7,.35,0,Math.PI*2);ctx.fill();}
      if(n%2===0){ctx.fillStyle='#c8d38b';ctx.globalAlpha=.82;ctx.beginPath();ctx.arc(sx+112,FLOOR-4,2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e2d79c';ctx.beginPath();ctx.arc(sx+112,FLOOR-9,1.4,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}}
  }
  function drawCoin(c){const y=c.y+Math.sin(c.bob)*4,x=c.x-cameraX;if(x<-20||x>W+20)return;ctx.save();ctx.translate(x,y);ctx.shadowColor='#f2d978';ctx.shadowBlur=14;ctx.fillStyle='#f4d875';ctx.beginPath();ctx.ellipse(0,0,c.r*.75,c.r,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#fff0a7';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,0,c.r*.34,c.r*.68,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
  function drawEnemy(e){const x=e.x-cameraX;if(x<-40||x>W+40)return;const bob=Math.sin(e.anim)*2;ctx.save();ctx.translate(x+e.w/2,e.y+bob);ctx.fillStyle='#182a23';ctx.globalAlpha=.25;ctx.beginPath();ctx.ellipse(0,30,18,4,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    ctx.fillStyle='#7b9860';roundRect(ctx,-16,3,32,25,11);ctx.fill();ctx.fillStyle='#abc37a';ctx.beginPath();ctx.ellipse(0,4,18,10,0,Math.PI,Math.PI*2);ctx.fill();ctx.fillStyle='#f2d8a2';ctx.beginPath();ctx.arc(-5,12,2,0,Math.PI*2);ctx.arc(5,12,2,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#354934';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-8,26);ctx.lineTo(-11,30);ctx.moveTo(8,26);ctx.lineTo(11,30);ctx.stroke();ctx.restore();}
  function drawPlayer(){
    if(player.invuln>0&&Math.floor(elapsed*17)%2===0)return;
    const x=player.x-cameraX,y=player.y;const run=Math.sin(player.anim)*3;ctx.save();ctx.translate(x+player.w/2,y);
    // leaf-green cloak and jaunty seedcap, assembled from simple shapes
    ctx.fillStyle='#162b21';ctx.globalAlpha=.3;ctx.beginPath();ctx.ellipse(0,48,20,5,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    ctx.strokeStyle='#473c2e';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-6,39);ctx.lineTo(-8+run,47);ctx.moveTo(6,39);ctx.lineTo(8-run,47);ctx.stroke();
    ctx.fillStyle=player.flash?'#fff1c1':'#719353';ctx.beginPath();ctx.moveTo(-13,17);ctx.quadraticCurveTo(-15,25,-13,40);ctx.quadraticCurveTo(0,47,14,39);ctx.lineTo(11,17);ctx.closePath();ctx.fill();
    ctx.fillStyle='#d5bd85';ctx.beginPath();ctx.ellipse(0,12,12,13,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#293a2b';ctx.beginPath();ctx.ellipse(player.face*4,14,1.5,2.4,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#a7bf71';ctx.beginPath();ctx.ellipse(-1,1,14,7,-.08,Math.PI,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(2,-2,7,8,.35,Math.PI,Math.PI*2);ctx.fill();
    ctx.fillStyle='#d8d69a';ctx.beginPath();ctx.arc(0,0,2,0,Math.PI*2);ctx.fill();
    if(player.attackCd>.23){ctx.strokeStyle='#eaf3b4';ctx.lineWidth=3;ctx.globalAlpha=.85;ctx.beginPath();ctx.arc(player.face*16,22,22,-.8,1.05);ctx.stroke();ctx.globalAlpha=1;}
    ctx.restore();
  }
  function drawBoss(){
    if(bossDefeated)return;const x=boss.x-cameraX,y=boss.y;if(x<-180||x>W+180)return;const pulse=.5+.5*Math.sin(elapsed*5);
    ctx.save();ctx.translate(x+boss.w/2,y+boss.h/2);const shake=boss.flash?rand(-2,2):0;ctx.translate(shake,0);
    // Long articulated legs frame the body; telltale silk glows before each volley.
    ctx.strokeStyle='#352b43';ctx.lineWidth=9;ctx.lineCap='round';
    for(let i=0;i<4;i++){const side=i<2?-1:1, row=i%2;const sway=Math.sin(elapsed*3+i)*8;ctx.beginPath();ctx.moveTo(side*27,-10+row*18);ctx.quadraticCurveTo(side*59,-43+row*48+sway,side*(61+row*8),-25+row*66+sway);ctx.stroke();ctx.strokeStyle='#78607a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(side*27,-10+row*18);ctx.quadraticCurveTo(side*59,-43+row*48+sway,side*(61+row*8),-25+row*66+sway);ctx.stroke();ctx.strokeStyle='#352b43';ctx.lineWidth=9;}
    ctx.fillStyle='#25243c';ctx.beginPath();ctx.ellipse(2,7,37,43,-.12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#48334d';ctx.beginPath();ctx.ellipse(4,-16,30,30,-.3,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#7c4c62';ctx.beginPath();ctx.ellipse(-1,-30,10,6,-.4,0,Math.PI*2);ctx.ellipse(15,-28,8,5,.3,0,Math.PI*2);ctx.fill();
    for(let i=0;i<4;i++){const ex=-13+(i%2)*18,ey=-8+Math.floor(i/2)*15;ctx.fillStyle=boss.state==='open'?'#f7d875':'#d7837d';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=10;ctx.beginPath();ctx.arc(ex,ey,3.2,0,Math.PI*2);ctx.fill();}
    ctx.shadowBlur=0;ctx.fillStyle='#9f7382';ctx.beginPath();ctx.ellipse(0,39,23,25,0,0,Math.PI*2);ctx.fill();
    if(boss.state==='open'){ctx.shadowColor='#f3df87';ctx.shadowBlur=22;ctx.fillStyle=`rgba(255,235,142,${.62+.3*pulse})`;ctx.beginPath();ctx.arc(0,35,12+2*pulse,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#fff5bd';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,35,17,0,Math.PI*2);ctx.stroke();}
    else{ctx.fillStyle='#67445b';ctx.beginPath();ctx.arc(0,35,8,0,Math.PI*2);ctx.fill();}
    ctx.restore();
    if(boss.state==='idle'&&boss.attackTimer<.72){ctx.globalAlpha=.35+Math.sin(elapsed*18)*.2;ctx.strokeStyle='#f4d98c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x+boss.w/2,y+72,45,Math.PI,Math.PI*1.6);ctx.stroke();ctx.globalAlpha=1;}
  }
  function drawWeb(w){const x=w.x-cameraX;ctx.save();ctx.translate(x+w.w/2,w.y+w.h/2);ctx.rotate(Math.sin(elapsed*8)*.16);ctx.fillStyle='#b9cec0';ctx.strokeStyle='#e3e8d8';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(9,0);ctx.lineTo(0,10);ctx.lineTo(-9,0);ctx.closePath();ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(-6,-5);ctx.lineTo(6,5);ctx.moveTo(6,-5);ctx.lineTo(-6,5);ctx.stroke();ctx.restore();}
  function render(){
    ctx.save();if(screenShake>0)ctx.translate(rand(-screenShake,screenShake),rand(-screenShake/2,screenShake/2));
    drawBackground();drawGround();drawDecor();
    for(const c of coins)if(!c.taken)drawCoin(c);
    for(const e of enemies)if(e.alive)drawEnemy(e);
    drawBoss();for(const w of webs)drawWeb(w);
    for(const b of bolts){const x=b.x-cameraX;ctx.save();ctx.shadowColor='#d7ef98';ctx.shadowBlur=14;ctx.fillStyle='#e4f2b1';roundRect(ctx,x,b.y,b.w,b.h,7);ctx.fill();ctx.fillStyle='#fff9d6';ctx.fillRect(x+4,b.y+3,4,3);ctx.restore();}
    for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x-cameraX,p.y,p.r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    if(player)drawPlayer();
    // A soft vignette ties the procedural scene together.
    const vignette=ctx.createRadialGradient(W/2,H/2,160,W/2,H/2,610);vignette.addColorStop(0,'#07130c00');vignette.addColorStop(1,'#08181155');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
    ctx.restore();
  }

  function refreshShop(){
    document.querySelector('#shopCoins').textContent=totalSeeds;
    document.querySelectorAll('.upgrade').forEach(button=>{
      const type=button.dataset.upgrade,cost={double:12,damage:15,health:20}[type];
      const owned=type==='double'?upgrades.double:type==='damage'?upgrades.damage>=3:upgrades.health>=8;
      button.disabled=owned||totalSeeds<cost;
      button.querySelector('strong').textContent=owned?'OWNED':`${cost} ✦`;
      if(type==='damage')button.querySelector('small').textContent=`Attack power · ${upgrades.damage}/3`;
      if(type==='health')button.querySelector('small').textContent=`Maximum leaves · ${upgrades.health}/8`;
    });
  }
  function buyUpgrade(type){
    const cost={double:12,damage:15,health:20}[type];if(totalSeeds<cost)return;
    if(type==='double'&&upgrades.double||type==='damage'&&upgrades.damage>=3||type==='health'&&upgrades.health>=8)return;
    totalSeeds-=cost;if(type==='double')upgrades.double=true;if(type==='damage')upgrades.damage++;if(type==='health'){upgrades.health++;player.maxHp++;player.hp++;}
    sound(690,.18,'sine',.04);burst(W/2,H/2,'#d7e99a',18);refreshShop();updateHud();
  }
  function continueTrail(){
    if(stage===0){setupStage(1,true);setScreen('playing');showToast('THE GLOAMING WILDS');}
    else finishGame();
  }

  document.querySelector('#startButton').addEventListener('click',startGame);
  document.querySelector('#againButton').addEventListener('click',startGame);
  document.querySelector('#continueButton').addEventListener('click',continueTrail);
  document.querySelector('#resumeButton').addEventListener('click',()=>setScreen('playing'));
  document.querySelectorAll('.upgrade').forEach(b=>b.addEventListener('click',()=>buyUpgrade(b.dataset.upgrade)));
  document.querySelector('#pauseButton').addEventListener('click',()=>{if(gameMode==='playing')setScreen('pause');});
  document.querySelector('#soundToggle').addEventListener('click',e=>{audioOn=!audioOn;e.currentTarget.querySelector('span:last-child').textContent=audioOn?'Sound on':'Sound off';e.currentTarget.querySelector('.sound-icon').textContent=audioOn?'♪':'♩';if(audioOn)sound(620,.12);});
  document.querySelectorAll('[data-control]').forEach(button=>{
    const action=button.dataset.control;
    const press=e=>{e.preventDefault();touch[action]=true;button.classList.add('active');button.setPointerCapture?.(e.pointerId);};
    const release=e=>{e.preventDefault();touch[action]=false;button.classList.remove('active');};
    button.addEventListener('pointerdown',press);button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  });
  window.addEventListener('keydown',e=>{
    if(['ArrowLeft','ArrowRight','ArrowUp','Space'].includes(e.code))e.preventDefault();
    keys.add(e.code);
    if(e.code==='Escape'||e.code==='KeyP'){if(gameMode==='playing')setScreen('pause');else if(gameMode==='pause')setScreen('playing');}
    if(e.code==='Enter'){if(gameMode==='title')startGame();else if(gameMode==='shop')continueTrail();else if(gameMode==='pause')setScreen('playing');else if(gameMode==='end')startGame();}
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>{keys.clear();for(const k of Object.keys(touch))touch[k]=false;if(gameMode==='playing')setScreen('pause');});
  function loop(now){const dt=Math.min(.033,(now-lastTime)/1000||0);lastTime=now;update(dt);render();requestAnimationFrame(loop);}
  setupStage(0);setScreen('title');requestAnimationFrame(loop);
})();
