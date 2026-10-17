(async () => {
 const source = await figma.getNodeByIdAsync('5:2');
 if (!source) throw new Error('未找到管家页');
 const fonts = new Map();
 for (const t of source.findAll(n=>n.type==='TEXT')) for(const s of t.getStyledTextSegments(['fontName'])) fonts.set(JSON.stringify(s.fontName),s.fontName);
 await Promise.all([...fonts.values()].map(f=>figma.loadFontAsync(f)));
 const existing=figma.currentPage.children.filter(n=>['首页 · 薄荷青光晕','宠物页 · 杏桃色光晕'].includes(n.name));
 if(existing.length===2){
  const changed=[];
  for(const f of existing){
   for(const inst of f.findAll(n=>n.type==='INSTANCE')){
    for(const g of inst.findAll(n=>n.type==='GROUP')){g.visible=false;changed.push(g.id);}
   }
   const list=f.findOne(n=>n.name==='管理列表');
   if(list)for(const r of list.children){for(const n of r.children){n.layoutPositioning='AUTO';changed.push(n.id);}}
  }
  figma.currentPage.selection=existing;figma.viewport.scrollAndZoomIntoView(existing);
  figma.showUI('<body style="font:14px sans-serif">已修正图标重叠与列表对齐。<textarea style="width:95%;height:150px">'+JSON.stringify({mutatedNodeIds:changed})+'</textarea></body>',{width:400,height:220});
  return;
 }
 const ids=['7:3','7:6','7:16','7:17','9:16','9:19','9:17','7:12','8:10','8:16','8:23','8:31','8:38','8:45','8:2'];
 const nodes={}; await Promise.all(ids.map(async id=>nodes[id]=await figma.getNodeByIdAsync(id)));
 const rgb=h=>({r:parseInt(h.slice(0,2),16)/255,g:parseInt(h.slice(2,4),16)/255,b:parseInt(h.slice(4,6),16)/255});
 const paint=h=>[{type:'SOLID',color:rgb(h)}];
 const ink='393047',muted='948B9B',purple='7D64D8';
 function frame(parent,name,x,y,w,h,fill){const f=figma.createFrame();parent.appendChild(f);f.name=name;f.resize(w,h);f.x=x;f.y=y;f.fills=fill?paint(fill):[];f.clipsContent=false;return f;}
 function txt(parent,str,size=14,color=ink,template='9:19'){const t=nodes[template].clone();parent.appendChild(t);t.name=str;t.characters=str;t.fontSize=size;t.fills=paint(color);t.textAutoResize='WIDTH_AND_HEIGHT';t.layoutAlign='INHERIT';t.layoutGrow=0;return t;}
 function at(parent,str,x,y,size,color,template){const t=txt(parent,str,size,color,template);t.x=x;t.y=y;return t;}
 function stack(parent,name,x,y,w,gap=8){const f=frame(parent,name,x,y,w,10);f.layoutMode='VERTICAL';f.primaryAxisSizingMode='AUTO';f.counterAxisSizingMode='FIXED';f.itemSpacing=gap;return f;}
 function row(parent,name,w,h,gap=8){const f=frame(parent,name,0,0,w,h);f.layoutMode='HORIZONTAL';f.primaryAxisSizingMode='FIXED';f.counterAxisSizingMode='FIXED';f.counterAxisAlignItems='CENTER';f.itemSpacing=gap;return f;}
 function card(parent,name,x,y,w,h){const f=frame(parent,name,x,y,w,h,'FFFFFF');f.cornerRadius=22;return f;}
 function icon(parent,id,x,y){const n=nodes[id].clone();parent.appendChild(n);n.x=x;n.y=y;return n;}
 function illustration(parent,x,y,scale){const n=nodes['7:12'].clone();parent.appendChild(n);n.rescale(scale);n.x=x;n.y=y;return n;}
 function pill(parent,str,x,y,w,color,fg){const p=frame(parent,str,x,y,w,27,color);p.cornerRadius=14;p.layoutMode='HORIZONTAL';p.primaryAxisAlignItems='CENTER';p.counterAxisAlignItems='CENTER';p.primaryAxisSizingMode='FIXED';p.counterAxisSizingMode='FIXED';txt(p,str,11,fg);return p;}
 function screen(name,x,top,active){const f=source.clone();figma.currentPage.appendChild(f);f.name=name;f.x=x;f.y=100;
 for(const c of [...f.children]) if(!['系统状态栏','顶部导航','底部导航'].includes(c.name)) c.remove();
 f.fills=[{type:'GRADIENT_LINEAR',gradientTransform:[[0,1,0],[-1,0,1]],gradientStops:[{position:0,color:{...rgb(top),a:1}},{position:.38,color:{...rgb('F5F5EB'),a:1}},{position:1,color:{...rgb('FFF9F6'),a:1}}]}];
 const title=f.findOne(n=>n.type==='TEXT'&&n.characters==='宠物管家');title.characters=active==='首页'?'宠物日常':'我的宠物';title.name=title.characters;
 const nav=f.children.find(n=>n.name==='底部导航');for(const tab of nav.children){const col=tab.name===active?purple:'A49AAA';for(const n of tab.findAll(()=>true)){if(n.type==='TEXT')n.fills=paint(col);else {if('strokes'in n&&n.strokes.length)n.strokes=paint(col);if('fills'in n&&Array.isArray(n.fills)&&n.fills.some(p=>p.type==='SOLID'))n.fills=n.fills.map(p=>p.type==='SOLID'?{...p,color:rgb(col)}:p);}}}
 return f;}
 function shortcuts(root,y,labels,iconIds){const bar=row(root,'快捷入口',362,88,10);bar.x=20;bar.y=y;labels.forEach((s,i)=>{const slot=frame(bar,s,0,0,114,88);const n=nodes['8:2'].createInstance();slot.appendChild(n);n.x=0;n.y=0;const t=n.findOne(n=>n.type==='TEXT');t.characters=s;icon(slot,iconIds[i],44,14);});}
 const maxX=Math.max(...figma.currentPage.children.map(n=>n.x+n.width));
 const home=screen('首页 · 薄荷青光晕',maxX+120,'C8EEE2','首页');
 const h=stack(home,'首页问候',24,118,200,8);txt(h,'每个日常，\n都值得好好照顾',25,ink,'7:16');txt(h,'陪毛孩子，把日子过得软乎乎',12,muted,'7:17');
 illustration(home,216,108,.59);pill(home,'✦  今天也是被治愈的一天',24,245,185,'FFFFFF','6F998C');
 const today=card(home,'今日照护',20,294,362,159);const tc=stack(today,'照护内容',18,16,326,11);const tr=row(tc,'照护标题',326,25);txt(tr,'今日照护',16,ink,'9:16');const progress=txt(tr,'已完成 1 / 3',11,muted);progress.layoutGrow=1;progress.textAlignHorizontal='RIGHT';
 const tasks=[['✓','早餐已喂好','08:30','81A99B'],['○','添一碗新鲜水','待完成',purple],['○','陪它玩 15 分钟','待完成',purple]];
 for(const [mark,label,time,c] of tasks){const r=row(tc,label,326,24,10);txt(r,mark,17,c);const a=txt(r,label,13);a.layoutGrow=1;txt(r,time,11,muted);}
 at(home,'随手记一记',20,473,16,ink,'9:16');at(home,'留住每一点变化',283,476,11,muted);
 shortcuts(home,506,['饮食记录','状态记录','拍照记录'],['8:10','8:16','8:38']);
 at(home,'养宠小灵感',20,617,16,ink,'9:16');at(home,'更多  ›',341,620,11,muted);
 const tip=card(home,'养宠灵感卡',20,650,362,132);const tipText=stack(tip,'灵感内容',18,17,230,9);txt(tipText,'让喝水，变成一件小乐事',16,ink,'9:16');txt(tipText,'多放一个水碗，勤换一碗清水。\n从小小习惯开始，照顾它的每一天。',12,muted);pill(tip,'和管家聊聊  →',18,91,122,'F0EAFB',purple);icon(tip,'8:10',298,24);
 const pet=screen('宠物页 · 杏桃色光晕',maxX+602,'FFDCC4','宠物');
 const ph=stack(pet,'宠物档案概览',24,112,200,9);txt(ph,'毛孩子的小天地',25,ink,'7:16');txt(ph,'把它的成长，好好收藏',12,muted,'7:17');
 illustration(pet,218,117,.58);pill(pet,'+  添加宠物',24,199,100,'FFFFFF','BD8A6F');
 const profile=card(pet,'当前宠物档案',20,278,362,166);const pc=stack(profile,'档案内容',18,15,326,10);const pr=row(pc,'档案标题',326,29);txt(pr,'奶糖',22,ink,'7:16');txt(pr,'♀',15,'C68B9C');const edit=txt(pr,'编辑档案  ›',11,muted);edit.layoutGrow=1;edit.textAlignHorizontal='RIGHT';txt(pc,'布偶猫  ·  已绝育  ·  陪伴第 365 天',12,muted);const stats=row(pc,'宠物基础数据',326,57,12);for(const [a,b] of [['2 岁 3 个月','年龄'],['4.2 kg','最新体重'],['状态良好','今日状态']]){const s=stack(stats,b,0,0,100,4);txt(s,a,16,ink,'9:16');txt(s,b,11,muted);}
 at(pet,'它的专属档案',20,467,16,ink,'9:16');shortcuts(pet,499,['饮食档案','健康记录','成长相册'],['8:23','8:16','8:38']);
 const manage=card(pet,'宠物管理',20,610,362,132);const mc=stack(manage,'管理列表',18,12,326,8);for(const [label,sub,id] of [['照护提醒','疫苗 · 驱虫','8:16'],['我的食物','粮与零食清单','8:10'],['家庭成员','一起照顾它','8:31']]){const r=row(mc,label,326,30,10);const ic=icon(r,id,0,0);ic.rescale(.7);const t=txt(r,label,13);t.layoutGrow=1;txt(r,sub,11,muted);txt(r,'›',17,muted);}
 at(pet,'每一次认真记录，都是爱它的证据。',89,768,12,muted,'7:17');
 const result=[home,pet].map(f=>({id:f.id,name:f.name,total:f.findAll(()=>true).length,types:f.findAll(()=>true).reduce((a,n)=>(a[n.type]=(a[n.type]||0)+1,a),{}),fonts:[...new Set(f.findAll(n=>n.type==='TEXT').map(n=>JSON.stringify(n.fontName)))],imageNodes:f.findAll(n=>'fills'in n&&Array.isArray(n.fills)&&n.fills.some(p=>p.type==='IMAGE')).map(n=>({id:n.id,name:n.name,width:n.width,height:n.height})),createdNodeIds:[f.id,...f.findAll(()=>true).map(n=>n.id)]}));
 figma.currentPage.selection=[home,pet];figma.viewport.scrollAndZoomIntoView([source,home,pet]);
 figma.showUI('<html><body style="font:13px sans-serif;padding:12px"><b>首页与宠物页已完成</b><p>原管家页保持不变。新增画板均为可编辑图层。</p><textarea style="width:100%;height:180px">'+JSON.stringify(result,null,2)+'</textarea></body></html>',{width:420,height:280});
})().catch(e=>{figma.showUI('<pre>'+String(e.stack||e)+'</pre>',{width:600,height:300});});
